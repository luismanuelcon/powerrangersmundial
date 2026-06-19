import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { pool } from "./lib/db.mjs";
import {
  decrypt,
  encrypt,
  lookupHash,
  newSessionToken,
  sessionHash,
} from "./lib/security.mjs";

const port = Number(process.env.PORT || 4200);
const root = process.cwd();
const secret = process.env.SESSION_SECRET;
const defaultApiUrl = "https://api.football-data.org/v4/competitions/WC/matches";
const blockedPaths = new Set([
  ".env.local",
  "users.local.js",
  "package-lock.json",
]);
const blockedFolders = ["lib/", "scripts/", "node_modules/", ".git/"];
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const fixtureContext = { window: {} };
vm.runInNewContext(readFileSync("fixtures.js", "utf8"), fixtureContext);
const fixtures = fixtureContext.window.WORLD_CUP_GROUP_FIXTURES || [];

function sendJson(response, status, value, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...headers,
  });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 100_000) throw new Error("Solicitud demasiado grande");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function cookies(request) {
  return Object.fromEntries(
    (request.headers.cookie || "")
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([key, value]) => key && value),
  );
}

function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    nickname: row.nickname,
    role: row.role,
  };
}

function privateUser(row) {
  try {
    return {
      ...publicUser(row),
      phone: decrypt(row.phone_cipher, secret),
      document: decrypt(row.document_cipher, secret),
      credentialsNeedReset: false,
    };
  } catch {
    return {
      ...publicUser(row),
      phone: "",
      document: "",
      credentialsNeedReset: true,
    };
  }
}

async function apiConfig() {
  const { rows } = await pool.query(
    "select key, value_cipher from prm_settings where key in ('api_url', 'api_token')",
  );
  const settings = Object.fromEntries(rows.map((row) => [row.key, decrypt(row.value_cipher, secret)]));
  return {
    url: settings.api_url || defaultApiUrl,
    token: settings.api_token || "",
  };
}

async function appSettings() {
  const { rows } = await pool.query(
    "select key, value_cipher from prm_settings where key in ('ranking_drag_enabled', 'ranking_badges')",
  );
  const settings = Object.fromEntries(rows.map((row) => [row.key, decrypt(row.value_cipher, secret)]));
  let rankingBadges;
  try {
    rankingBadges = JSON.parse(settings.ranking_badges || "null");
  } catch {
    rankingBadges = null;
  }
  return {
    rankingDragEnabled: settings.ranking_drag_enabled !== "false",
    rankingBadges: Array.isArray(rankingBadges) ? rankingBadges : [
      { positionType: "fromBottom", position: 2, emoji: "⚠️", label: "CUIDADO LOCO", tone: "warning" },
      { positionType: "fromBottom", position: 1, emoji: "🐕", label: "LA PERRA DEL MUNDIAL", tone: "danger" },
    ],
  };
}

async function saveApiConfig(url, token) {
  const values = [["api_url", url]];
  if (token) values.push(["api_token", token]);
  for (const [key, value] of values) {
    await pool.query(
      `
        insert into prm_settings (key, value_cipher, updated_at)
        values ($1, $2, now())
        on conflict (key) do update set
          value_cipher = excluded.value_cipher,
          updated_at = now()
      `,
      [key, encrypt(value, secret)],
    );
  }
}

async function saveAppSettings(settings) {
  const values = [["ranking_drag_enabled", settings.rankingDragEnabled ? "true" : "false"]];
  if (Array.isArray(settings.rankingBadges)) {
    values.push(["ranking_badges", JSON.stringify(settings.rankingBadges)]);
  }
  for (const [key, value] of values) {
    await pool.query(
      `
        insert into prm_settings (key, value_cipher, updated_at)
        values ($1, $2, now())
        on conflict (key) do update set
          value_cipher = excluded.value_cipher,
          updated_at = now()
      `,
      [key, encrypt(value, secret)],
    );
  }
}

async function authenticatedUser(request) {
  const token = cookies(request).prm_session;
  if (!token) return null;
  const { rows } = await pool.query(
    `
      select u.*
      from prm_sessions s
      join prm_users u on u.id = s.user_id
      where s.token_hash = $1 and s.expires_at > now()
    `,
    [sessionHash(token)],
  );
  return rows[0] || null;
}

function sessionCookie(token, maxAge = 60 * 60 * 24 * 30) {
  return `prm_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}

async function handleApi(request, response, pathname) {
  if (request.method === "POST" && pathname === "/api/login") {
    const body = await readJson(request);
    const phone = String(body.phone || "").replace(/\D/g, "");
    const document = String(body.document || "").replace(/\D/g, "");
    const { rows } = await pool.query(
      "select * from prm_users where phone_hash = $1 and document_hash = $2",
      [lookupHash(phone, secret), lookupHash(document, secret)],
    );
    if (!rows[0]) {
      sendJson(response, 401, { error: "Celular o clave incorrectos." });
      return;
    }

    const token = newSessionToken();
    await pool.query(
      `
        insert into prm_sessions (token_hash, user_id, expires_at)
        values ($1, $2, now() + interval '30 days')
      `,
      [sessionHash(token), rows[0].id],
    );
    sendJson(response, 200, { user: publicUser(rows[0]) }, {
      "Set-Cookie": sessionCookie(token),
    });
    return;
  }

  if (request.method === "POST" && pathname === "/api/logout") {
    const token = cookies(request).prm_session;
    if (token) {
      await pool.query("delete from prm_sessions where token_hash = $1", [sessionHash(token)]);
    }
    sendJson(response, 200, { ok: true }, { "Set-Cookie": sessionCookie("", 0) });
    return;
  }

  const user = await authenticatedUser(request);
  if (!user) {
    sendJson(response, 401, { error: "Sesión requerida" });
    return;
  }

  if (request.method === "GET" && pathname === "/api/session") {
    const { rows } = await pool.query("select id, name, nickname, role from prm_users order by name");
    const predictions = await pool.query(
      `
        select user_id, match_id, home_score, away_score, automatic, saved_at
        from prm_predictions
        where automatic = false
      `,
    );
    const results = await pool.query(
      "select match_id, home_score, away_score, status from prm_match_results",
    );
    const config = await apiConfig();
    const settings = await appSettings();
    sendJson(response, 200, {
      user: publicUser(user),
      participants: rows.map(publicUser),
      predictions: predictions.rows,
      results: results.rows,
      api: {
        url: config.url,
        tokenConfigured: Boolean(config.token),
      },
      settings,
    });
    return;
  }

  if (request.method === "PUT" && pathname.startsWith("/api/predictions/")) {
    const matchId = decodeURIComponent(pathname.slice("/api/predictions/".length));
    const body = await readJson(request);
    const home = Number(body.home);
    const away = Number(body.away);
    if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0 || home > 20 || away > 20) {
      sendJson(response, 400, { error: "Marcador inválido" });
      return;
    }
    await pool.query(
      `
        insert into prm_predictions (user_id, match_id, home_score, away_score, automatic, saved_at)
        values ($1,$2,$3,$4,false,now())
        on conflict (user_id, match_id) do update set
          home_score=excluded.home_score,
          away_score=excluded.away_score,
          automatic=false,
          saved_at=now()
      `,
      [user.id, matchId, home, away],
    );
    sendJson(response, 200, { ok: true, savedAt: new Date().toISOString() });
    return;
  }

  if (request.method === "POST" && pathname === "/api/football-proxy") {
    const body = await readJson(request);
    const config = await apiConfig();
    if (!config.token) {
      sendJson(response, 400, { error: "Token de API no configurado" });
      return;
    }
    const apiUrl = body.resource === "standings"
      ? "https://api.football-data.org/v4/competitions/WC/standings"
      : config.url;

    try {
      const fetchResponse = await fetch(apiUrl, {
        headers: { "X-Auth-Token": config.token },
      });
      if (!fetchResponse.ok) {
        sendJson(response, fetchResponse.status, { error: `API error: ${fetchResponse.status}` });
        return;
      }
      sendJson(response, 200, await fetchResponse.json());
    } catch (error) {
      sendJson(response, 500, { error: `Fetch error: ${error.message}` });
    }
    return;
  }

  if (user.role !== "Administrador") {
    sendJson(response, 403, { error: "Acceso exclusivo del administrador" });
    return;
  }

  if (request.method === "GET" && pathname === "/api/users") {
    const { rows } = await pool.query("select * from prm_users order by name");
    sendJson(response, 200, { users: rows.map(privateUser) });
    return;
  }

  if (request.method === "PUT" && pathname === "/api/settings/api") {
    const body = await readJson(request);
    const url = String(body.url || "").trim();
    const token = String(body.token || "").trim();
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:") throw new Error();
    } catch {
      sendJson(response, 400, { error: "La URL de la API debe ser HTTPS" });
      return;
    }
    await saveApiConfig(url, token);
    const config = await apiConfig();
    sendJson(response, 200, {
      url: config.url,
      tokenConfigured: Boolean(config.token),
    });
    return;
  }

  if (request.method === "PUT" && pathname === "/api/settings/app") {
    const body = await readJson(request);
    const rankingBadges = Array.isArray(body.rankingBadges)
      ? body.rankingBadges.slice(0, 8).map((badge) => ({
          positionType: badge.positionType === "fromBottom" ? "fromBottom" : "fromTop",
          position: Math.max(1, Math.min(99, Number.parseInt(badge.position, 10) || 1)),
          emoji: String(badge.emoji || "").trim().slice(0, 8),
          label: String(badge.label || "").trim().slice(0, 48),
          tone: ["warning", "danger", "gold", "blue", "green"].includes(badge.tone) ? badge.tone : "gold",
        })).filter((badge) => badge.label)
      : undefined;
    await saveAppSettings({
      rankingDragEnabled: Boolean(body.rankingDragEnabled),
      rankingBadges,
    });
    sendJson(response, 200, await appSettings());
    return;
  }

  if (request.method === "PUT" && pathname.startsWith("/api/results/")) {
    const matchId = decodeURIComponent(pathname.slice("/api/results/".length));
    const body = await readJson(request);
    await pool.query(
      `
        insert into prm_match_results (match_id, home_score, away_score, status, updated_at)
        values ($1,$2,$3,$4,now())
        on conflict (match_id) do update set
          home_score=excluded.home_score,
          away_score=excluded.away_score,
          status=excluded.status,
          updated_at=now()
      `,
      [matchId, body.homeScore ?? null, body.awayScore ?? null, body.status || "SCHEDULED"],
    );
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "POST" && pathname === "/api/users") {
    const body = await readJson(request);
    const id = crypto.randomUUID();
    const values = normalizeUserInput(body);
    await pool.query(
      `
        insert into prm_users (
          id, name, nickname, phone_hash, phone_cipher,
          document_hash, document_cipher, role
        ) values ($1,$2,$3,$4,$5,$6,$7,'Participante')
      `,
      [id, values.name, values.nickname, ...values.credentials],
    );
    sendJson(response, 201, { id });
    return;
  }

  const userMatch = pathname.match(/^\/api\/users\/([^/]+)$/);
  if (request.method === "PUT" && userMatch) {
    const id = decodeURIComponent(userMatch[1]);
    const body = await readJson(request);
    const values = normalizeUserInput(body);
    await pool.query(
      `
        update prm_users set
          name=$2, nickname=$3, phone_hash=$4, phone_cipher=$5,
          document_hash=$6, document_cipher=$7, updated_at=now()
        where id=$1
      `,
      [id, values.name, values.nickname, ...values.credentials],
    );
    sendJson(response, 200, { ok: true });
    return;
  }

  sendJson(response, 404, { error: "API no encontrada" });
}

function normalizeUserInput(body) {
  const name = String(body.name || "").trim();
  const nickname = String(body.nickname || "").trim();
  const phone = String(body.phone || "").replace(/\D/g, "");
  const document = String(body.document || "").replace(/\D/g, "");
  if (!name || !nickname || !/^\d{10}$/.test(phone) || !/^\d{6,10}$/.test(document)) {
    const error = new Error("Datos de usuario inválidos");
    error.status = 400;
    throw error;
  }
  return {
    name,
    nickname,
    credentials: [
      lookupHash(phone, secret),
      encrypt(phone, secret),
      lookupHash(document, secret),
      encrypt(document, secret),
    ],
  };
}

createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    if (pathname.startsWith("/api/")) {
      await handleApi(request, response, pathname);
      return;
    }

    const requested = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    if (
      blockedPaths.has(requested) ||
      blockedFolders.some((folder) => requested.startsWith(folder))
    ) {
      response.writeHead(404);
      response.end();
      return;
    }

    const filePath = normalize(join(root, requested));
    if (!filePath.startsWith(root) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("No encontrado");
      return;
    }

    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream",
    });
    createReadStream(filePath).pipe(response);
  } catch (error) {
    console.error(error);
    const status = error.code === "23505" ? 409 : error.status || 500;
    const message = status === 409
      ? "El celular o la cédula ya pertenecen a otro usuario."
      : status === 500
        ? "Error interno del servidor"
        : error.message;
    sendJson(response, status, { error: message });
  }
}).listen(port, "0.0.0.0", () => {
  console.log(`Power Rangers Mundial: http://localhost:${port}`);
});
