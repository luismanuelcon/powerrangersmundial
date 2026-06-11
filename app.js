const ADMIN_ID = "admin";
const STORAGE_KEY = "prm_state_v1";

const initialMatches = window.WORLD_CUP_GROUP_FIXTURES;

const demoParticipants = [];

function defaultState() {
  return {
    participants: demoParticipants,
    matches: initialMatches,
    predictions: {},
    currentUserId: null,
    api: {
      url: "https://api.football-data.org/v4/competitions/WC/matches",
      token: "",
    },
  };
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return defaultState();
    const participants = (saved.participants || []).map(({ id, name, nickname, role }) => ({
      id,
      name,
      nickname,
      role,
    }));
    const validUser = participants.some((person) => person.id === saved.currentUserId);
    const savedMatches = Array.isArray(saved.matches) ? saved.matches : [];
    const savedById = new Map(savedMatches.map((match) => [match.id, match]));
    const predictions = structuredClone(saved.predictions || {});
    const officialIds = new Set(initialMatches.map((match) => match.id));
    const matches = initialMatches.map((official) => {
      const previous = savedById.get(official.id);
      const sameFixture =
        previous &&
        normalizeCountryName(previous.home) === normalizeCountryName(official.home) &&
        normalizeCountryName(previous.away) === normalizeCountryName(official.away);

      if (previous && !sameFixture) {
        Object.values(predictions).forEach((userPredictions) => {
          delete userPredictions[official.id];
        });
      }

      return sameFixture
        ? {
            ...official,
            status: previous.status,
            homeScore: previous.homeScore,
            awayScore: previous.awayScore,
          }
        : official;
    });
    matches.push(...savedMatches.filter((match) => !officialIds.has(match.id)));

    return {
      ...defaultState(),
      ...saved,
      participants,
      predictions,
      currentUserId: validUser ? saved.currentUserId : null,
      matches,
    };
  } catch {
    return defaultState();
  }
}

let state = loadState();
let activeStage = "Todos";
let searchTerm = "";
let toastTimer;
let adminUsers = [];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    ...state,
    participants: state.participants.map(({ id, name, nickname, role }) => ({
      id,
      name,
      nickname,
      role,
    })),
  }));
}

saveState();

function currentUser() {
  return state.participants.find((person) => person.id === state.currentUserId) || null;
}

function isAdmin() {
  return currentUser()?.id === ADMIN_ID;
}

function initials(name) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function displayName(person) {
  return person.nickname?.trim() || person.name.split(/\s+/)[0];
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const countryCodes = {
  alemania: "de",
  algeria: "dz",
  argelia: "dz",
  argentina: "ar",
  australia: "au",
  austria: "at",
  belgica: "be",
  belgium: "be",
  bosnia: "ba",
  "bosnia and herzegovina": "ba",
  "bosnia y herzegovina": "ba",
  brasil: "br",
  brazil: "br",
  canada: "ca",
  "cape verde": "cv",
  catar: "qa",
  chile: "cl",
  colombia: "co",
  "corea del sur": "kr",
  "costa de marfil": "ci",
  croacia: "hr",
  croatia: "hr",
  curacao: "cw",
  "czech republic": "cz",
  ecuador: "ec",
  egipto: "eg",
  egypt: "eg",
  england: "gb-eng",
  espana: "es",
  "estados unidos": "us",
  france: "fr",
  francia: "fr",
  germany: "de",
  ghana: "gh",
  haiti: "ht",
  iran: "ir",
  iraq: "iq",
  "ivory coast": "ci",
  japon: "jp",
  japan: "jp",
  jordan: "jo",
  marruecos: "ma",
  mexico: "mx",
  netherlands: "nl",
  noruega: "no",
  norway: "no",
  "nueva zelanda": "nz",
  "new zealand": "nz",
  "paises bajos": "nl",
  panama: "pa",
  paraguay: "py",
  portugal: "pt",
  "republica checa": "cz",
  "rep. checa": "cz",
  "rd del congo": "cd",
  "dr congo": "cd",
  "republica democratica del congo": "cd",
  "saudi arabia": "sa",
  "arabia saudita": "sa",
  scotland: "gb-sct",
  escocia: "gb-sct",
  senegal: "sn",
  "south africa": "za",
  sudafrica: "za",
  "south korea": "kr",
  spain: "es",
  suecia: "se",
  sweden: "se",
  suiza: "ch",
  switzerland: "ch",
  tunez: "tn",
  tunisia: "tn",
  turkey: "tr",
  turquia: "tr",
  "united states": "us",
  uruguay: "uy",
  uzbekistan: "uz",
};

const teamNamesEs = {
  Algeria: "Argelia",
  Australia: "Australia",
  Austria: "Austria",
  Belgium: "Bélgica",
  "Bosnia and Herzegovina": "Bosnia y Herzegovina",
  Brazil: "Brasil",
  Canada: "Canadá",
  "Cape Verde": "Cabo Verde",
  Colombia: "Colombia",
  Croatia: "Croacia",
  Curaçao: "Curazao",
  "Czech Republic": "República Checa",
  "DR Congo": "R. D. del Congo",
  Ecuador: "Ecuador",
  Egypt: "Egipto",
  England: "Inglaterra",
  France: "Francia",
  Germany: "Alemania",
  Ghana: "Ghana",
  Haiti: "Haití",
  Iran: "Irán",
  Iraq: "Irak",
  "Ivory Coast": "Costa de Marfil",
  Japan: "Japón",
  Jordan: "Jordania",
  Mexico: "México",
  Morocco: "Marruecos",
  Netherlands: "Países Bajos",
  "New Zealand": "Nueva Zelanda",
  Norway: "Noruega",
  Panama: "Panamá",
  Paraguay: "Paraguay",
  Portugal: "Portugal",
  Qatar: "Catar",
  "Saudi Arabia": "Arabia Saudita",
  Scotland: "Escocia",
  Senegal: "Senegal",
  "South Africa": "Sudáfrica",
  "South Korea": "Corea del Sur",
  Spain: "España",
  Sweden: "Suecia",
  Switzerland: "Suiza",
  Tunisia: "Túnez",
  Turkey: "Turquía",
  "United States": "Estados Unidos",
  Uruguay: "Uruguay",
  Uzbekistan: "Uzbekistán",
};

function teamName(name) {
  return teamNamesEs[name] || name;
}

function normalizeCountryName(name) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s.]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function flagMarkup(name, size = "large") {
  const code = countryCodes[normalizeCountryName(name)];
  if (!code) {
    return `<span class="flag-placeholder" aria-label="${name}">🌐</span>`;
  }
  return `<img class="flag-image flag-${size}" src="https://flagcdn.com/${code}.svg" alt="Bandera de ${name}" loading="lazy">`;
}

function formatDate(dateValue, options = {}) {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    ...options,
  }).format(new Date(dateValue));
}

function formatKickoff(dateValue) {
  return formatDate(dateValue, { hour: "numeric", minute: "2-digit" });
}

function predictionDeadline(match) {
  return new Date(new Date(match.kickoff).getTime() - 30 * 60_000);
}

function isLocked(match) {
  return new Date() >= predictionDeadline(match) || ["IN_PLAY", "PAUSED", "FINISHED"].includes(match.status);
}

function assignAutomaticPredictions() {
  let changed = false;

  state.matches.forEach((match) => {
    if (!isLocked(match)) return;

    state.participants.forEach((person) => {
      state.predictions[person.id] ||= {};
      if (state.predictions[person.id][match.id]) return;

      state.predictions[person.id][match.id] = {
        home: 0,
        away: 0,
        savedAt: predictionDeadline(match).toISOString(),
        automatic: true,
      };
      changed = true;
    });
  });

  if (changed) saveState();
  return changed;
}

function outcome(home, away) {
  if (home === away) return "DRAW";
  return home > away ? "HOME" : "AWAY";
}

function predictionFor(userId, matchId) {
  return state.predictions[userId]?.[matchId] || null;
}

function calculateStats(person) {
  let exact = 0;
  let correct = 0;
  let points = 0;
  let firstPredictionAt = Number.MAX_SAFE_INTEGER;
  const predictions = state.predictions[person.id] || {};

  state.matches.forEach((match) => {
    const prediction = predictions[match.id];
    if (!prediction) return;
    firstPredictionAt = Math.min(firstPredictionAt, new Date(prediction.savedAt).getTime());
    if (match.status !== "FINISHED" || match.homeScore == null || match.awayScore == null) return;

    if (prediction.home === match.homeScore && prediction.away === match.awayScore) {
      exact += 1;
      points += 2;
    } else if (outcome(prediction.home, prediction.away) === outcome(match.homeScore, match.awayScore)) {
      correct += 1;
      points += 1;
    }
  });

  return { ...person, exact, correct, points, firstPredictionAt };
}

function getRanking() {
  return state.participants
    .map(calculateStats)
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.exact - a.exact ||
        a.firstPredictionAt - b.firstPredictionAt ||
        a.name.localeCompare(b.name),
    );
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "No fue posible completar la solicitud.");
    error.status = response.status;
    throw error;
  }
  return data;
}

async function restoreSession() {
  try {
    const data = await apiRequest("/api/session");
    state.participants = data.participants;
    state.currentUserId = data.user.id;
    state.predictions = {};
    for (const prediction of data.predictions || []) {
      state.predictions[prediction.user_id] ||= {};
      state.predictions[prediction.user_id][prediction.match_id] = {
        home: prediction.home_score,
        away: prediction.away_score,
        automatic: prediction.automatic,
        savedAt: prediction.saved_at,
      };
    }
    const results = new Map((data.results || []).map((result) => [result.match_id, result]));
    state.matches = state.matches.map((match) => {
      const result = results.get(match.id);
      return result
        ? {
            ...match,
            homeScore: result.home_score,
            awayScore: result.away_score,
            status: result.status,
          }
        : match;
    });
    saveState();
    return true;
  } catch (error) {
    if (error.status !== 401) console.error(error);
    state.participants = [];
    state.currentUserId = null;
    saveState();
    return false;
  }
}

function navigate(viewId) {
  if (viewId === "admin" && !isAdmin()) return;
  $$(".view").forEach((view) => view.classList.toggle("active-view", view.id === viewId));
  $$("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === viewId));
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (viewId === "partidos") renderMatchesPage();
  if (viewId === "ranking") renderRanking();
  if (viewId === "admin") renderAdmin();
}

function matchCard(match) {
  const user = currentUser();
  const prediction = user ? predictionFor(user.id, match.id) : null;
  const locked = isLocked(match);
  const resultText =
    match.status === "FINISHED"
      ? `${match.homeScore} – ${match.awayScore}`
      : locked
        ? prediction
          ? `${prediction.home} – ${prediction.away}`
          : "Cerrado"
        : "Tu marcador";

  return `
    <article class="match-card">
      <div class="match-meta">
        <span class="stage-pill">${match.stage}</span>
        <span>${formatDate(match.kickoff, { weekday: "short", day: "numeric", month: "short" })} · ${formatKickoff(match.kickoff)}</span>
      </div>
      <div class="teams">
        <div class="team">
          <span class="team-flag">${flagMarkup(match.home)}</span>
          <span class="team-name">${teamName(match.home)}</span>
        </div>
        <span class="versus">VS</span>
        <div class="team">
          <span class="team-flag">${flagMarkup(match.away)}</span>
          <span class="team-name">${teamName(match.away)}</span>
        </div>
      </div>
      ${
        locked
          ? `<div class="locked-score">${resultText}</div>`
          : `<div class="prediction-row">
              <input class="score-input" data-match="${match.id}" data-side="home" type="number" min="0" max="20" value="${prediction?.home ?? ""}" placeholder="–" aria-label="Goles de ${teamName(match.home)}">
              <span>:</span>
              <input class="score-input" data-match="${match.id}" data-side="away" type="number" min="0" max="20" value="${prediction?.away ?? ""}" placeholder="–" aria-label="Goles de ${teamName(match.away)}">
            </div>`
      }
      <div class="saved-mark">${
        prediction?.automatic
          ? "0-0 asignado automáticamente"
          : prediction
            ? "✓ Pronóstico guardado"
            : locked
              ? "Pronóstico bloqueado"
              : "Ingresa ambos marcadores"
      }</div>
    </article>
  `;
}

function renderHome() {
  assignAutomaticPredictions();
  const upcoming = [...state.matches]
    .filter((match) => match.status !== "FINISHED")
    .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
  const cards = upcoming.slice(0, 3);
  $("#homeMatches").innerHTML = cards.length
    ? cards.map(matchCard).join("")
    : `<div class="empty-state">No hay partidos próximos.</div>`;

  const user = currentUser();
  const ranking = getRanking();
  $("#heroPlayers").textContent = state.participants.length;
  $("#heroMatches").textContent = state.matches.length;
  const rankingIndex = user ? ranking.findIndex((person) => person.id === user.id) : -1;
  const stats = user ? calculateStats(user) : null;
  $("#homePosition").textContent = rankingIndex >= 0 ? `#${rankingIndex + 1}` : "—";
  $("#homePositionDetail").textContent = user ? `de ${ranking.length} participantes` : "Ingresa para competir";
  $("#homePoints").textContent = stats?.points ?? 0;

  const next = upcoming.find((match) => !isLocked(match));
  if (next) {
    $("#homeNextMatch").textContent = `${teamName(next.home)} vs. ${teamName(next.away)}`;
    updateCountdown(next);
  } else {
    $("#homeCountdown").textContent = "—";
    $("#homeNextMatch").textContent = "No hay cierres pendientes";
  }
  bindScoreInputs();
}

function updateCountdown(match) {
  const diff = predictionDeadline(match) - new Date();
  if (diff <= 0) {
    $("#homeCountdown").textContent = "Cerrado";
    return;
  }
  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  $("#homeCountdown").textContent = hours > 24 ? `${Math.floor(hours / 24)}d ${hours % 24}h` : `${hours}h ${minutes}m`;
}

function renderStageFilters() {
  const stages = [
    "Todos",
    ...[...new Set(state.matches.map((match) => match.stage))].sort((a, b) =>
      a.localeCompare(b, "es", { numeric: true }),
    ),
  ];
  $("#stageFilters").innerHTML = stages
    .map(
      (stage) =>
        `<button class="filter-button ${activeStage === stage ? "active" : ""}" data-stage="${stage}">${stage}</button>`,
    )
    .join("");

  $$("[data-stage]").forEach((button) => {
    button.addEventListener("click", () => {
      activeStage = button.dataset.stage;
      renderMatchesPage();
    });
  });
}

function listMatchCard(match) {
  const user = currentUser();
  const prediction = user ? predictionFor(user.id, match.id) : null;
  const locked = isLocked(match);
  let resultBadge = "";

  if (prediction && match.status === "FINISHED") {
    const exact = prediction.home === match.homeScore && prediction.away === match.awayScore;
    const correct = outcome(prediction.home, prediction.away) === outcome(match.homeScore, match.awayScore);
    resultBadge = exact ? "EXACTO · +2" : correct ? "ACIERTO · +1" : "SIN PUNTOS";
  }

  return `
    <article class="list-match-card">
      <div class="list-match-time">
        <strong>${formatKickoff(match.kickoff)}</strong>
        <small>${match.venue}</small>
      </div>
      <div class="list-teams">
        <div class="list-team"><span class="mini-flag">${flagMarkup(match.home, "small")}</span>${teamName(match.home)}</div>
        <div class="list-team"><span class="mini-flag">${flagMarkup(match.away, "small")}</span>${teamName(match.away)}</div>
      </div>
      <div>
        ${
          locked
            ? `<div class="locked-score">${prediction ? `${prediction.home} : ${prediction.away}` : "— : —"}</div>
               ${
                 match.status === "FINISHED"
                   ? `<span class="result-badge">${resultBadge || `FINAL ${match.homeScore}:${match.awayScore}`}</span>`
                   : `<span class="result-badge">${prediction?.automatic ? "0-0 AUTOMÁTICO" : "BLOQUEADO"}</span>`
               }`
            : `<div class="list-prediction">
                <input class="score-input" data-match="${match.id}" data-side="home" type="number" min="0" max="20" value="${prediction?.home ?? ""}" placeholder="–">
                <span>:</span>
                <input class="score-input" data-match="${match.id}" data-side="away" type="number" min="0" max="20" value="${prediction?.away ?? ""}" placeholder="–">
              </div>`
        }
      </div>
    </article>
  `;
}

function renderMatchesPage() {
  assignAutomaticPredictions();
  renderStageFilters();
  const filtered = state.matches
    .filter((match) => activeStage === "Todos" || match.stage === activeStage)
    .filter((match) => `${match.home} ${match.away} ${teamName(match.home)} ${teamName(match.away)}`.toLowerCase().includes(searchTerm))
    .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));

  const groups = Object.groupBy
    ? Object.groupBy(filtered, (match) => match.kickoff.slice(0, 10))
    : filtered.reduce((acc, match) => {
        const key = match.kickoff.slice(0, 10);
        (acc[key] ||= []).push(match);
        return acc;
      }, {});

  $("#matchesList").innerHTML =
    Object.entries(groups)
      .map(
        ([date, matches]) => `
          <section class="date-group">
            <div class="date-title">${formatDate(`${date}T12:00:00-05:00`, { weekday: "long", day: "numeric", month: "long" })}</div>
            <div class="date-matches">${matches.map(listMatchCard).join("")}</div>
          </section>`,
      )
      .join("") || `<div class="empty-state">No encontramos partidos con ese filtro.</div>`;
  bindScoreInputs();
}

function bindScoreInputs() {
  $$(".score-input[data-match]").forEach((input) => {
    input.addEventListener("change", async () => {
      const match = state.matches.find((item) => item.id === input.dataset.match);
      if (!match || isLocked(match)) return;
      const user = currentUser();
      if (!user) {
        input.value = "";
        $("#authDialog").showModal();
        return;
      }

      const container = input.closest(".match-card, .list-match-card");
      const homeInput = container.querySelector('[data-side="home"]');
      const awayInput = container.querySelector('[data-side="away"]');
      if (homeInput.value === "" || awayInput.value === "") return;

      const home = Number(homeInput.value);
      const away = Number(awayInput.value);
      if (home < 0 || away < 0 || home > 20 || away > 20) {
        showToast("Usa un marcador entre 0 y 20.");
        return;
      }

      try {
        const data = await apiRequest(`/api/predictions/${encodeURIComponent(match.id)}`, {
          method: "PUT",
          body: JSON.stringify({ home, away }),
        });
        state.predictions[user.id] ||= {};
        state.predictions[user.id][match.id] = {
          home,
          away,
          savedAt: data.savedAt,
        };
        saveState();
        showToast("Pronóstico guardado");
        renderHome();
        if ($("#partidos").classList.contains("active-view")) renderMatchesPage();
      } catch (error) {
        showToast(error.message);
      }
    });
  });
}

function renderRanking() {
  assignAutomaticPredictions();
  const ranking = getRanking();
  const podiumClasses = ["first", "second", "third"];
  $("#podium").innerHTML = ranking
    .slice(0, 3)
    .map(
      (person, index) => `
        <article class="podium-card ${podiumClasses[index]}">
          <span class="podium-position">#${index + 1}</span>
          <span class="podium-avatar">${initials(displayName(person))}</span>
          <strong>${escapeHtml(displayName(person))}</strong>
          <small>${person.points} puntos · ${person.exact} exactos</small>
        </article>`,
    )
    .join("");

  $("#rankingBody").innerHTML = ranking
    .map(
      (person, index) => `
        <tr>
          <td><strong>#${index + 1}</strong></td>
          <td>
            <div class="ranking-person">
              <span class="table-avatar">${initials(displayName(person))}</span>
              ${escapeHtml(displayName(person))}
              ${person.id === state.currentUserId ? '<span class="you-badge">TÚ</span>' : ""}
            </div>
          </td>
          <td>${person.exact}</td>
          <td>${person.correct}</td>
          <td class="points-cell">${person.points}</td>
        </tr>`,
    )
    .join("");
}

function openUserDialog(userId = "") {
  if (!isAdmin()) return;
  const person = adminUsers.find((item) => item.id === userId);
  $("#userDialogTitle").textContent = person ? "Editar usuario" : "Agregar usuario";
  $("#userId").value = person?.id || "";
  $("#userFullName").value = person?.name || "";
  $("#userNickname").value = person?.nickname || "";
  $("#userPhone").value = person?.phone || "";
  $("#userDocument").value = person?.document || "";
  $("#userDialog").showModal();
}

async function saveUser(event) {
  event.preventDefault();
  if (!isAdmin()) return;

  const id = $("#userId").value;
  const name = $("#userFullName").value.trim();
  const nickname = $("#userNickname").value.trim();
  const phone = $("#userPhone").value.replace(/\D/g, "");
  const document = $("#userDocument").value.replace(/\D/g, "");
  try {
    await apiRequest(id ? `/api/users/${encodeURIComponent(id)}` : "/api/users", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify({ name, nickname, phone, document }),
    });
    await restoreSession();
    await loadAdminUsers();
    $("#userDialog").close();
    event.target.reset();
    renderAll();
    navigate("admin");
    showToast(id ? "Usuario actualizado" : "Usuario agregado");
  } catch (error) {
    showToast(error.message);
  }
}

async function loadAdminUsers() {
  if (!isAdmin()) return;
  const data = await apiRequest("/api/users");
  adminUsers = data.users;
}

function renderAdmin() {
  if (!isAdmin()) return;
  assignAutomaticPredictions();
  const finished = state.matches.filter((match) => match.status === "FINISHED").length;
  const predictions = Object.values(state.predictions).reduce(
    (total, userPredictions) => total + Object.keys(userPredictions).length,
    0,
  );
  $("#adminStats").innerHTML = [
    ["PARTICIPANTES", state.participants.length],
    ["PARTIDOS", state.matches.length],
    ["FINALIZADOS", finished],
    ["PRONÓSTICOS", predictions],
  ]
    .map(([label, value]) => `<article class="admin-stat"><small>${label}</small><strong>${value}</strong></article>`)
    .join("");

  $("#adminMatches").innerHTML = [...state.matches]
    .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff))
    .map(
      (match) => `
        <div class="admin-match">
          <div>
            <strong>${teamName(match.home)} vs. ${teamName(match.away)}</strong>
            <small>${match.stage} · ${formatDate(match.kickoff, { day: "numeric", month: "short" })} ${formatKickoff(match.kickoff)}</small>
          </div>
          <div class="admin-score">
            <input data-admin-match="${match.id}" data-admin-side="home" type="number" min="0" value="${match.homeScore ?? ""}" placeholder="–">
            <span>:</span>
            <input data-admin-match="${match.id}" data-admin-side="away" type="number" min="0" value="${match.awayScore ?? ""}" placeholder="–">
            <select data-admin-status="${match.id}">
              <option value="SCHEDULED" ${match.status === "SCHEDULED" ? "selected" : ""}>Programado</option>
              <option value="IN_PLAY" ${match.status === "IN_PLAY" ? "selected" : ""}>En juego</option>
              <option value="FINISHED" ${match.status === "FINISHED" ? "selected" : ""}>Finalizado</option>
            </select>
          </div>
          <button class="save-result" data-save-result="${match.id}" title="Guardar resultado">✓</button>
        </div>`,
    )
    .join("");

  $("#participantsList").innerHTML = adminUsers
    .map(
      (person) => `
        <div class="participant">
          <span class="table-avatar">${initials(displayName(person))}</span>
          <div class="participant-data">
            <strong>${escapeHtml(person.name)}</strong>
            <small>Apodo: ${escapeHtml(displayName(person))}</small>
            <small>Celular: ${person.phone}</small>
            <small>Cédula: ${person.document}</small>
          </div>
          <span class="role-badge ${person.id === ADMIN_ID ? "admin-role" : ""}">${person.role}</span>
          <button class="edit-user-button" type="button" data-edit-user="${person.id}" aria-label="Editar ${escapeHtml(person.name)}">Editar</button>
        </div>`,
    )
    .join("");

  $$("[data-edit-user]").forEach((button) => {
    button.addEventListener("click", () => openUserDialog(button.dataset.editUser));
  });

  $("#apiUrl").value = state.api.url || "";
  $("#apiToken").value = state.api.token || "";

  $$("[data-save-result]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.saveResult;
      const match = state.matches.find((item) => item.id === id);
      const homeValue = $(`[data-admin-match="${id}"][data-admin-side="home"]`).value;
      const awayValue = $(`[data-admin-match="${id}"][data-admin-side="away"]`).value;
      const status = $(`[data-admin-status="${id}"]`).value;
      match.homeScore = homeValue === "" ? null : Number(homeValue);
      match.awayScore = awayValue === "" ? null : Number(awayValue);
      match.status = status;
      if (status === "FINISHED" && (match.homeScore == null || match.awayScore == null)) {
        showToast("Ingresa ambos marcadores para finalizar.");
        return;
      }
      try {
        await apiRequest(`/api/results/${encodeURIComponent(id)}`, {
          method: "PUT",
          body: JSON.stringify({
            homeScore: match.homeScore,
            awayScore: match.awayScore,
            status: match.status,
          }),
        });
        saveState();
        renderAll();
        navigate("admin");
        showToast("Resultado actualizado");
      } catch (error) {
        showToast(error.message);
      }
    });
  });
}

function normalizeApiMatches(data) {
  const source = Array.isArray(data) ? data : data.matches || data.events || [];
  return source.map((match, index) => {
    const home = match.homeTeam?.name || match.strHomeTeam || match.home;
    const away = match.awayTeam?.name || match.strAwayTeam || match.away;
    const kickoff = match.utcDate || match.dateEvent && `${match.dateEvent}T${match.strTime || "00:00:00"}Z` || match.kickoff;
    const statusMap = {
      Match_Finished: "FINISHED",
      FT: "FINISHED",
      "Not Started": "SCHEDULED",
    };
    const homeScore = match.score?.fullTime?.home ?? match.intHomeScore ?? match.homeScore ?? null;
    const awayScore = match.score?.fullTime?.away ?? match.intAwayScore ?? match.awayScore ?? null;
    return {
      id: String(match.id || match.idEvent || `api-${index}-${kickoff}`),
      stage: match.group || match.stage || match.strGroup || "Mundial 2026",
      home,
      away,
      kickoff,
      venue: match.venue || match.strVenue || "Por confirmar",
      status: statusMap[match.status] || statusMap[match.strStatus] || match.status || (homeScore != null ? "FINISHED" : "SCHEDULED"),
      homeScore: homeScore == null ? null : Number(homeScore),
      awayScore: awayScore == null ? null : Number(awayScore),
    };
  }).filter((match) => match.home && match.away && match.kickoff);
}

async function syncApi() {
  if (!state.api.url) {
    showToast("Configura primero la URL de la API.");
    return;
  }
  const button = $("#syncResults");
  button.disabled = true;
  button.textContent = "Sincronizando…";
  try {
    const headers = state.api.token ? { "X-Auth-Token": state.api.token } : {};
    const response = await fetch(state.api.url, { headers });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const imported = normalizeApiMatches(await response.json());
    if (!imported.length) throw new Error("La API no devolvió partidos reconocibles");

    const predictionIds = new Set(
      Object.values(state.predictions).flatMap((predictions) => Object.keys(predictions)),
    );
    const existingById = new Map(state.matches.map((match) => [match.id, match]));
    imported.forEach((match) => existingById.set(match.id, { ...existingById.get(match.id), ...match }));
    state.matches = [...existingById.values()].filter(
      (match) => imported.some((item) => item.id === match.id) || predictionIds.has(match.id),
    );
    saveState();
    renderAll();
    navigate("admin");
    showToast(`${imported.length} partidos sincronizados`);
  } catch (error) {
    console.error(error);
    showToast(`No fue posible sincronizar: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = "Sincronizar API";
  }
}

function rankingMessage() {
  const ranking = getRanking();
  const lines = ranking.slice(0, 10).map(
    (person, index) =>
      `${index + 1}. ${displayName(person)} — ${person.points} pts (${person.exact} exactos)`,
  );
  return [
    "⚽ *POWER RANGERS MUNDIAL*",
    "",
    "🏆 *Tabla de posiciones*",
    ...lines,
    "",
    "¿Quién terminará mandando en esta polla?",
    window.location.href.split("#")[0],
  ].join("\n");
}

function shareWhatsApp() {
  const url = `https://wa.me/?text=${encodeURIComponent(rankingMessage())}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

function renderProfile() {
  const user = currentUser();
  $("#profileInitial").textContent = user ? initials(displayName(user)) : "?";
  $("#profileName").textContent = user ? displayName(user) : "Entrar";
  $$(".admin-only").forEach((element) => element.classList.toggle("hidden", !isAdmin()));
}

function renderAll() {
  renderProfile();
  renderHome();
  renderMatchesPage();
  renderRanking();
  if (isAdmin()) renderAdmin();
}

$$("[data-view]").forEach((button) => {
  button.addEventListener("click", () => navigate(button.dataset.view));
});

$$("[data-go]").forEach((button) => {
  button.addEventListener("click", () => navigate(button.dataset.go));
});

$("#profileButton").addEventListener("click", () => {
  if (currentUser()) {
    const shouldExit = window.confirm(`Sesión activa: ${displayName(currentUser())}\n\n¿Quieres cerrar sesión?`);
    if (shouldExit) {
      apiRequest("/api/logout", { method: "POST" }).finally(() => {
        state.currentUserId = null;
        state.participants = [];
        adminUsers = [];
        saveState();
        renderAll();
        navigate("inicio");
        $("#authDialog").showModal();
      });
    }
  } else {
    $("#authDialog").showModal();
  }
});

$("#authForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const phone = $("#authPhone").value.replace(/\D/g, "");
  const document = $("#authDocument").value.replace(/\D/g, "");
  try {
    const data = await apiRequest("/api/login", {
      method: "POST",
      body: JSON.stringify({ phone, document }),
    });
    await restoreSession();
    if (data.user.role === "Administrador") await loadAdminUsers();
    $("#authDialog").close();
    event.target.reset();
    renderAll();
    showToast(`¡Bienvenido, ${displayName(data.user)}!`);
  } catch (error) {
    showToast(error.message);
    $("#authDocument").value = "";
    $("#authDocument").focus();
  }
});

$("#addUserButton").addEventListener("click", () => openUserDialog());
$("#userForm").addEventListener("submit", saveUser);

$$("[data-close]").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));

$("#matchSearch").addEventListener("input", (event) => {
  searchTerm = event.target.value.trim().toLowerCase();
  renderMatchesPage();
  $("#matchSearch").focus();
});

$("#apiForm").addEventListener("submit", (event) => {
  event.preventDefault();
  state.api.url = $("#apiUrl").value.trim();
  state.api.token = $("#apiToken").value.trim();
  saveState();
  showToast("Configuración guardada");
});

$("#syncResults").addEventListener("click", syncApi);
$("#shareRanking").addEventListener("click", shareWhatsApp);
$("#shareHeader").addEventListener("click", shareWhatsApp);

$("#copyInvite").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(window.location.href.split("#")[0]);
    showToast("Enlace copiado");
  } catch {
    showToast("Copia el enlace desde la barra del navegador.");
  }
});

window.addEventListener("hashchange", () => {
  const view = window.location.hash.slice(1);
  if (["inicio", "partidos", "ranking", "admin"].includes(view)) navigate(view);
});

async function initializeApp() {
  const authenticated = await restoreSession();
  if (authenticated && isAdmin()) {
    await loadAdminUsers().catch(console.error);
  }
  assignAutomaticPredictions();
  renderAll();
  const initialView = window.location.hash.slice(1);
  if (["inicio", "partidos", "ranking", "admin"].includes(initialView)) navigate(initialView);
  if (!authenticated) setTimeout(() => $("#authDialog").showModal(), 300);
}

initializeApp();
setInterval(() => {
  const changed = assignAutomaticPredictions();
  renderHome();
  if (changed) {
    if ($("#partidos").classList.contains("active-view")) renderMatchesPage();
    if ($("#ranking").classList.contains("active-view")) renderRanking();
    if ($("#admin").classList.contains("active-view")) renderAdmin();
  }
}, 60_000);
