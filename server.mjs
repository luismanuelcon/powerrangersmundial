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

async function ensureAutomaticPredictions() {
  const closedIds = fixtures
    .filter((match) => Date.now() >= new Date(match.kickoff).getTime() - 30 * 60_000)
    .map((match) => match.id);
  if (!closedIds.length) return;

  await pool.query(
    `
      insert into prm_predictions (
        user_id, match_id, home_score, away_score, automatic, saved_at
      )
      select u.id, m.match_id, 0, 0, true, now()
      from prm_users u
      cross join unnest($1::text[]) as m(match_id)
      on conflict (user_id, match_id) do nothing
    `,
    [closedIds],
  );
}

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
  return {
    ...publicUser(row),
    phone: decrypt(row.phone_cipher, secret),
    document: decrypt(row.document_cipher, secret),
  };
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
    await ensureAutomaticPredictions();
    const { rows } = await pool.query("select id, name, nickname, role from prm_users order by name");
    const predictions = await pool.query(
      "select user_id, match_id, home_score, away_score, automatic, saved_at from prm_predictions",
    );
    const results = await pool.query(
      "select match_id, home_score, away_score, status from prm_match_results",
    );
    sendJson(response, 200, {
      user: publicUser(user),
      participants: rows.map(publicUser),
      predictions: predictions.rows,
      results: results.rows,
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

  if (user.role !== "Administrador") {
    sendJson(response, 403, { error: "Acceso exclusivo del administrador" });
    return;
  }

  if (request.method === "GET" && pathname === "/api/users") {
    const { rows } = await pool.query("select * from prm_users order by name");
    sendJson(response, 200, { users: rows.map(privateUser) });
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
