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
    // Solo agregar partidos guardados que no dupliquen equipos de partidos oficiales
    const officialTeamPairs = new Set(initialMatches.map((m) => 
      `${normalizeCountryName(m.home)}|${normalizeCountryName(m.away)}`
    ));
    matches.push(...savedMatches.filter((match) => {
      if (officialIds.has(match.id)) return false;
      const teamPair = `${normalizeCountryName(match.home)}|${normalizeCountryName(match.away)}`;
      return !officialTeamPairs.has(teamPair);
    }));
    
    // Limpiar duplicados existentes (por equipos normalizados)
    const seenTeamPairs = new Set();
    const dedupedMatches = matches.filter((match) => {
      const teamPair = `${normalizeCountryName(match.home)}|${normalizeCountryName(match.away)}`;
      if (seenTeamPairs.has(teamPair)) return false;
      seenTeamPairs.add(teamPair);
      return true;
    });

    return {
      ...defaultState(),
      ...saved,
      participants,
      predictions,
      currentUserId: validUser ? saved.currentUserId : null,
      matches: dedupedMatches,
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
  "bosniaherzegovina": "ba",
  "bosnia y herzegovina": "ba",
  brasil: "br",
  brazil: "br",
  "cabo verde": "cv",
  canada: "ca",
  "cape verde": "cv",
  "cape verde islands": "cv",
  catar: "qa",
  chile: "cl",
  colombia: "co",
  "congo dr": "cd",
  "corea del sur": "kr",
  "costa de marfil": "ci",
  croacia: "hr",
  croatia: "hr",
  curacao: "cw",
  czechia: "cz",
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
  jordania: "jo",
  marruecos: "ma",
  mexico: "mx",
  morocco: "ma",
  netherlands: "nl",
  noruega: "no",
  norway: "no",
  "nueva zelanda": "nz",
  "new zealand": "nz",
  "paises bajos": "nl",
  panama: "pa",
  paraguay: "py",
  portugal: "pt",
  qatar: "qa",
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
  "Bosnia-Herzegovina": "Bosnia y Herzegovina",
  Brazil: "Brasil",
  Canada: "Canadá",
  "Cape Verde": "Cabo Verde",
  "Cape Verde Islands": "Cabo Verde",
  Colombia: "Colombia",
  "Congo DR": "R. D. del Congo",
  Croatia: "Croacia",
  Curaçao: "Curazao",
  Czechia: "Chequia",
  "Czech Republic": "Chequia",
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
  let normalized = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s.]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  // Normalizar variantes comunes
  const aliases = {
    "bosniaherzegovina": "bosnia and herzegovina",
    "bosnia herzegowina": "bosnia and herzegovina",
    "czechia": "czech republic",
    "chequia": "czech republic",
    "republica checa": "czech republic",
    "korea republic": "south korea",
    "republic of korea": "south korea",
    "usa": "united states",
    "ivory coast": "cote divoire",
    "cote divoire": "ivory coast",
  };
  return aliases[normalized] || normalized;
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
    // Contar puntos para partidos FINISHED, IN_PLAY o PAUSED (con scores válidos)
    const validStatuses = ["FINISHED", "IN_PLAY", "PAUSED"];
    if (!validStatuses.includes(match.status) || match.homeScore == null || match.awayScore == null) return;

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

function calculateDayStats(person, dateStr = null) {
  const targetDate = dateStr || new Date().toISOString().slice(0, 10);
  let exact = 0;
  let correct = 0;
  let points = 0;
  const predictions = state.predictions[person.id] || {};

  state.matches.forEach((match) => {
    const matchDate = match.kickoff?.slice(0, 10);
    if (matchDate !== targetDate) return;
    const prediction = predictions[match.id];
    if (!prediction) return;
    if (match.status !== "FINISHED" && match.status !== "IN_PLAY" && match.status !== "PAUSED") return;
    if (match.homeScore == null || match.awayScore == null) return;

    if (prediction.home === match.homeScore && prediction.away === match.awayScore) {
      exact += 1;
      points += 2;
    } else if (outcome(prediction.home, prediction.away) === outcome(match.homeScore, match.awayScore)) {
      correct += 1;
      points += 1;
    }
  });

  return { ...person, exact, correct, points };
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
  if (viewId === "grupos") renderStandings();
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
      ${locked ? `<button class="view-predictions-btn" data-view-predictions="${match.id}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>Ver predicciones</button>` : ""}
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
      ${locked ? `<button class="view-predictions-btn" data-view-predictions="${match.id}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>Ver predicciones</button>` : ""}
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

  // Vincular botones de ver predicciones
  $$("[data-view-predictions]").forEach((button) => {
    button.addEventListener("click", () => openPredictionsDialog(button.dataset.viewPredictions));
  });
}

function openPredictionsDialog(matchId) {
  const match = state.matches.find((item) => item.id === matchId);
  if (!match || !isLocked(match)) return;

  $("#predictionsMatchTitle").textContent = `${teamName(match.home)} vs ${teamName(match.away)}`;
  
  const resultInfo = match.status === "FINISHED" 
    ? `<div class="result-final">Resultado final: <strong>${match.homeScore} – ${match.awayScore}</strong></div>`
    : `<div class="result-pending">Partido en curso o por jugarse</div>`;
  
  $("#predictionsMatchInfo").innerHTML = `
    <div class="match-datetime">${formatDate(match.kickoff, { weekday: "long", day: "numeric", month: "long" })} · ${formatKickoff(match.kickoff)}</div>
    ${resultInfo}
  `;

  const predictionsHtml = state.participants
    .map((person) => {
      const prediction = predictionFor(person.id, matchId);
      const predText = prediction ? `${prediction.home} – ${prediction.away}` : "Sin predicción";
      
      let pointsEarned = "";
      if (match.status === "FINISHED" && prediction) {
        if (prediction.home === match.homeScore && prediction.away === match.awayScore) {
          pointsEarned = '<span class="points-badge exact">+2 Exacto</span>';
        } else if (outcome(prediction.home, prediction.away) === outcome(match.homeScore, match.awayScore)) {
          pointsEarned = '<span class="points-badge correct">+1 Acierto</span>';
        } else {
          pointsEarned = '<span class="points-badge wrong">0</span>';
        }
      }

      const isAutomatic = prediction?.automatic ? '<span class="auto-badge">Auto</span>' : "";

      return `
        <div class="prediction-item ${person.id === state.currentUserId ? 'current-user' : ''}">
          <div class="prediction-user">
            <span class="pred-avatar">${initials(displayName(person))}</span>
            <span class="pred-name">${escapeHtml(displayName(person))}</span>
            ${isAutomatic}
          </div>
          <div class="prediction-score">
            <span class="pred-result">${predText}</span>
            ${pointsEarned}
          </div>
        </div>
      `;
    })
    .join("");

  $("#predictionsContent").innerHTML = predictionsHtml;
  $("#predictionsDialog").showModal();
}

function renderRanking() {
  assignAutomaticPredictions();
  const ranking = getRanking();
  const podiumClasses = ["first", "second", "third"];
  
  // Partidos del día
  const today = new Date().toISOString().slice(0, 10);
  const todayMatches = state.matches
    .filter((m) => m.kickoff?.slice(0, 10) === today)
    .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
  
  if (todayMatches.length > 0) {
    const hasLiveMatches = todayMatches.some((m) => m.status === "IN_PLAY" || m.status === "PAUSED");
    $("#todayMatches").innerHTML = `
      <div class="today-matches-header">
        <span class="today-icon">${hasLiveMatches ? "🔴" : "📅"}</span>
        <span class="today-title">Partidos de hoy</span>
        ${hasLiveMatches ? '<span class="live-indicator">EN VIVO</span>' : ""}
      </div>
      <div class="today-matches-grid">
        ${todayMatches.map((match) => {
          const statusClass = match.status === "IN_PLAY" || match.status === "PAUSED" ? "live" : 
                              match.status === "FINISHED" ? "finished" : "scheduled";
          const scoreText = match.homeScore != null && match.awayScore != null 
            ? `${match.homeScore} - ${match.awayScore}` 
            : formatKickoff(match.kickoff);
          const statusText = match.status === "IN_PLAY" ? "En juego" :
                             match.status === "PAUSED" ? "Descanso" :
                             match.status === "FINISHED" ? "Final" : "";
          return `
            <div class="today-match ${statusClass}">
              <div class="today-teams">
                <div class="today-team">
                  <span class="today-flag">${flagMarkup(match.home, "small")}</span>
                  <span>${teamName(match.home)}</span>
                </div>
                <div class="today-score">${scoreText}</div>
                <div class="today-team">
                  <span>${teamName(match.away)}</span>
                  <span class="today-flag">${flagMarkup(match.away, "small")}</span>
                </div>
              </div>
              ${statusText ? `<span class="today-status">${statusText}</span>` : ""}
            </div>
          `;
        }).join("")}
      </div>
    `;
  } else {
    $("#todayMatches").innerHTML = "";
  }
  
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

  // Mostrar último lugar con puntos del día
  if (ranking.length > 0) {
    const lastPerson = ranking[ranking.length - 1];
    const dayStats = calculateDayStats(lastPerson);
    const matchesWithResults = todayMatches.filter((m) => 
      m.status === "FINISHED" || m.status === "IN_PLAY" || m.status === "PAUSED"
    );
    const isPartial = matchesWithResults.some((m) => m.status === "IN_PLAY" || m.status === "PAUSED");
    
    $("#lastPlace").innerHTML = `
      <div class="last-place-header">
        <span class="last-place-icon">🐕</span>
        <span class="last-place-title">La perra del mundial</span>
      </div>
      <div class="last-place-content">
        <div class="last-place-info">
          <span class="last-place-avatar">${initials(displayName(lastPerson))}</span>
          <div class="last-place-details">
            <strong>${escapeHtml(displayName(lastPerson))}</strong>
            <small>#${ranking.length} · ${lastPerson.points} puntos totales</small>
          </div>
        </div>
        <div class="last-place-day">
          <span class="day-label">${isPartial ? "HOY (parcial)" : "HOY"}</span>
          <span class="day-points ${dayStats.points > 0 ? "positive" : ""}">${dayStats.points > 0 ? "+" : ""}${dayStats.points} pts</span>
          <small>${dayStats.exact} exacto${dayStats.exact !== 1 ? "s" : ""} · ${dayStats.correct} acierto${dayStats.correct !== 1 ? "s" : ""}</small>
        </div>
      </div>
    `;
  } else {
    $("#lastPlace").innerHTML = "";
  }
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
      TIMED: "SCHEDULED",
      SCHEDULED: "SCHEDULED",
      IN_PLAY: "IN_PLAY",
      PAUSED: "PAUSED",
      FINISHED: "FINISHED",
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

function updateMatchFromApi(existingMatch, apiMatch) {
  if (existingMatch.status === "FINISHED") return false;

  const hasValidScores = apiMatch.homeScore != null && apiMatch.awayScore != null;
  const statusChanged = existingMatch.status !== apiMatch.status;
  const scoresChanged = hasValidScores && (
    existingMatch.homeScore !== apiMatch.homeScore ||
    existingMatch.awayScore !== apiMatch.awayScore
  );
  const kickoffChanged = Boolean(apiMatch.kickoff) && existingMatch.kickoff !== apiMatch.kickoff;

  if (!statusChanged && !scoresChanged && !kickoffChanged) return false;

  existingMatch.status = apiMatch.status;
  if (hasValidScores) {
    existingMatch.homeScore = apiMatch.homeScore;
    existingMatch.awayScore = apiMatch.awayScore;
  }
  if (apiMatch.kickoff) existingMatch.kickoff = apiMatch.kickoff;
  return true;
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
    // Usar proxy del servidor para evitar CORS
    const response = await fetch("/api/football-proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: state.api.url, token: state.api.token }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const imported = normalizeApiMatches(data);
    if (!imported.length) throw new Error("La API no devolvió partidos reconocibles");

    // Mostrar info del primer partido para debug
    const firstMatch = data.matches?.[0];
    if (firstMatch) {
      console.log("API primer partido:", firstMatch.homeTeam?.name, "vs", firstMatch.awayTeam?.name);
      console.log("  status:", firstMatch.status);
      console.log("  score:", firstMatch.score?.fullTime?.home, "-", firstMatch.score?.fullTime?.away);
    }

    // Hacer match por equipos (normalizado) en lugar de por ID
    let updatedCount = 0;
    let liveCount = 0;
    imported.forEach((apiMatch) => {
      const apiHome = normalizeCountryName(apiMatch.home);
      const apiAway = normalizeCountryName(apiMatch.away);
      
      if (apiMatch.status === "IN_PLAY" || apiMatch.status === "PAUSED") liveCount++;
      
      // Buscar partido existente con mismos equipos
      const existingMatch = state.matches.find((local) => {
        const localHome = normalizeCountryName(local.home);
        const localAway = normalizeCountryName(local.away);
        return localHome === apiHome && localAway === apiAway;
      });
      
      if (existingMatch) {
        if (existingMatch.status === "FINISHED") {
          console.log("syncApi: partido FINISHED, ignorando API", apiMatch.home, "vs", apiMatch.away);
          return;
        }
        if (updateMatchFromApi(existingMatch, apiMatch)) updatedCount++;
      }
    });
    
    saveState();
    renderAll();
    navigate("admin");
    const msg = liveCount > 0 
      ? `${updatedCount} partidos (${liveCount} en vivo)` 
      : `${updatedCount} partidos actualizados (API: ${firstMatch?.status || "sin datos"})`;
    showToast(msg);
  } catch (error) {
    console.error(error);
    showToast(`No fue posible sincronizar: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = "Sincronizar API";
  }
}

// Sincronización silenciosa para auto-refresh
async function silentSync() {
  console.log("silentSync: iniciando...", { url: state.api.url, hasToken: !!state.api.token });
  if (!state.api.url || !state.api.token) {
    console.log("silentSync: falta URL o token");
    return;
  }
  try {
    const response = await fetch("/api/football-proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: state.api.url, token: state.api.token }),
    });
    if (!response.ok) {
      console.log("silentSync: respuesta no OK", response.status);
      return;
    }
    const data = await response.json();
    console.log("silentSync: datos recibidos", data?.matches?.length || 0, "partidos");
    const imported = normalizeApiMatches(data);
    if (!imported.length) {
      console.log("silentSync: no se importaron partidos");
      return;
    }

    let changed = false;
    imported.forEach((apiMatch) => {
      const apiHome = normalizeCountryName(apiMatch.home);
      const apiAway = normalizeCountryName(apiMatch.away);
      const existingMatch = state.matches.find((local) => {
        const localHome = normalizeCountryName(local.home);
        const localAway = normalizeCountryName(local.away);
        return localHome === apiHome && localAway === apiAway;
      });
      if (existingMatch) {
        if (existingMatch.status === "FINISHED") {
          console.log("silentSync: partido FINISHED, ignorando API", apiMatch.home, "vs", apiMatch.away);
          return;
        }

        const previousStatus = existingMatch.status;
        if (updateMatchFromApi(existingMatch, apiMatch)) {
          console.log("silentSync: actualizando partido", apiMatch.home, "vs", apiMatch.away, 
            "status:", previousStatus, "->", apiMatch.status,
            "score:", apiMatch.homeScore, "-", apiMatch.awayScore);
          changed = true;
        }
      } else {
        console.log("silentSync: partido no encontrado localmente", apiMatch.home, "vs", apiMatch.away);
      }
    });
    
    console.log("silentSync: cambios detectados:", changed);
    if (changed) {
      saveState();
      renderAll();
      if ($("#ranking").classList.contains("active-view")) renderRanking();
      if ($("#grupos").classList.contains("active-view")) renderStandings();
    }
  } catch (error) {
    console.error("Silent sync error:", error);
  }
}

// Obtener y renderizar standings de grupos
let standingsCache = null;
let standingsCacheTime = 0;

async function fetchStandings() {
  const now = Date.now();
  // Cache por 2 minutos
  if (standingsCache && now - standingsCacheTime < 120_000) {
    return standingsCache;
  }
  
  if (!state.api.token) return null;
  
  try {
    const response = await fetch("/api/football-proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        url: "https://api.football-data.org/v4/competitions/WC/standings", 
        token: state.api.token 
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    standingsCache = data;
    standingsCacheTime = now;
    return data;
  } catch (error) {
    console.error("Standings fetch error:", error);
    return null;
  }
}

async function renderStandings() {
  const container = $("#standingsContainer");
  if (!container) {
    console.error("renderStandings: contenedor no encontrado");
    return;
  }
  container.innerHTML = '<div class="standings-loading">Cargando tablas de grupos...</div>';
  
  const data = await fetchStandings();
  console.log("Standings data:", data);
  
  if (!data || !data.standings) {
    container.innerHTML = `
      <div class="standings-error">
        <p>No se pudieron cargar las tablas de posiciones.</p>
        <p>Verifica que el token de API esté configurado en Admin.</p>
        ${!state.api.token ? '<p><strong>⚠️ No hay token de API configurado</strong></p>' : ''}
      </div>
    `;
    return;
  }
  
  const groups = data.standings.filter(s => s.type === "TOTAL");
  console.log("Grupos encontrados:", groups.length);
  
  if (groups.length === 0) {
    container.innerHTML = '<div class="standings-error">No hay datos de grupos disponibles aún.</div>';
    return;
  }
  
  container.innerHTML = `
    <div class="standings-grid">
      ${groups.map(group => `
        <div class="group-table">
          <div class="group-header">
            <span class="group-name">${group.group?.replace("GROUP_", "Grupo ") || group.stage}</span>
          </div>
          <table class="standings-table">
            <thead>
              <tr>
                <th></th>
                <th>Equipo</th>
                <th>PJ</th>
                <th>G</th>
                <th>E</th>
                <th>P</th>
                <th>GF</th>
                <th>GC</th>
                <th>DG</th>
                <th>Pts</th>
              </tr>
            </thead>
            <tbody>
              ${group.table.map((team, i) => `
                <tr class="${i < 2 ? 'qualifies' : ''}">
                  <td class="pos">${team.position}</td>
                  <td class="team-cell">
                    <span class="standings-flag">${flagMarkup(team.team.name, "small")}</span>
                    <span class="standings-team-name">${teamName(team.team.name)}</span>
                  </td>
                  <td>${team.playedGames}</td>
                  <td>${team.won}</td>
                  <td>${team.draw}</td>
                  <td>${team.lost}</td>
                  <td>${team.goalsFor}</td>
                  <td>${team.goalsAgainst}</td>
                  <td class="${team.goalDifference > 0 ? 'positive' : team.goalDifference < 0 ? 'negative' : ''}">${team.goalDifference > 0 ? '+' : ''}${team.goalDifference}</td>
                  <td class="pts">${team.points}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `).join("")}
    </div>
  `;
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
  if (["inicio", "partidos", "ranking", "grupos", "admin"].includes(view)) navigate(view);
});

async function initializeApp() {
  const authenticated = await restoreSession();
  if (authenticated && isAdmin()) {
    await loadAdminUsers().catch(console.error);
  }
  assignAutomaticPredictions();
  renderAll();
  const initialView = window.location.hash.slice(1);
  if (["inicio", "partidos", "ranking", "grupos", "admin"].includes(initialView)) navigate(initialView);
  if (!authenticated) setTimeout(() => $("#authDialog").showModal(), 300);
  
  // Sync inicial si hay token y partidos hoy
  const today = new Date().toISOString().slice(0, 10);
  const hasTodayMatches = state.matches.some((m) => m.kickoff?.slice(0, 10) === today);
  if (hasTodayMatches && state.api.token) {
    setTimeout(() => silentSync(), 2000);
  }
}

initializeApp();

// Auto-refresh cada minuto
setInterval(() => {
  const changed = assignAutomaticPredictions();
  renderHome();
  if (changed) {
    if ($("#partidos").classList.contains("active-view")) renderMatchesPage();
    if ($("#admin").classList.contains("active-view")) renderAdmin();
  }
  // Siempre actualizar ranking si está visible
  if ($("#ranking").classList.contains("active-view")) renderRanking();
}, 60_000);

// Auto-sync con API si hay partidos hoy (cada 30 minutos para evitar datos incompletos)
setInterval(async () => {
  const today = new Date().toISOString().slice(0, 10);
  const hasTodayMatches = state.matches.some((m) => m.kickoff?.slice(0, 10) === today);
  if (hasTodayMatches && state.api.token) {
    console.log("Auto-sync: sincronizando partidos del día...");
    await silentSync();
  }
}, 1_800_000); // 30 minutos
