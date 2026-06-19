const ADMIN_ID = "admin";
const STORAGE_KEY = "prm_state_v1";
const APP_TIME_ZONE = "America/Bogota";

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
      tokenConfigured: false,
    },
    settings: {
      rankingDragEnabled: true,
      rankingBadges: [
        { positionType: "fromBottom", position: 2, emoji: "⚠️", label: "CUIDADO LOCO", tone: "warning" },
        { positionType: "fromBottom", position: 1, emoji: "🐕", label: "LA PERRA DEL MUNDIAL", tone: "danger" },
      ],
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
    Object.values(predictions).forEach((userPredictions) => {
      Object.entries(userPredictions).forEach(([matchId, prediction]) => {
        if (prediction?.automatic) delete userPredictions[matchId];
      });
    });
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
      api: {
        url: saved.api?.url || defaultState().api.url,
        tokenConfigured: Boolean(saved.api?.tokenConfigured),
      },
      settings: {
        ...defaultState().settings,
        ...(saved.settings || {}),
      },
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
let groupPredictionsDateFilter = "window";
let reminderMatchId = "";
let toastTimer;
let adminUsers = [];
let broadcastSchedule = [];
let rankingDragTimer;
let lastRankingDragAt = 0;
let rankingDragAudio;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    ...state,
    settings: state.settings,
    api: {
      url: state.api.url,
      tokenConfigured: Boolean(state.api.tokenConfigured),
    },
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

const participantColors = [
  "#ff3b30", "#007aff", "#34c759", "#ffcc00", "#af52de", "#ff9500",
  "#00c7be", "#ff2d55", "#64d2ff", "#bf5af2", "#30d158", "#ffd60a",
];

function participantColor(person) {
  const orderedIds = state.participants.map((item) => item.id).sort();
  const index = Math.max(0, orderedIds.indexOf(person.id));
  return participantColors[index % participantColors.length];
}

const participantPhotoNames = new Set([
  "CHECHA",
  "COLO",
  "GAMBE",
  "PANELA",
  "PEPE CHOLO SABROSO",
  "PIRATA",
  "PRIMO HERMANO",
  "TONY CHAMO",
  "VENENO",
]);

function participantPhotoName(person) {
  return displayName(person)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function participantPhotoSource(person) {
  const name = participantPhotoName(person);
  return participantPhotoNames.has(name)
    ? `assets/Fotos/thumbs/${encodeURIComponent(name)}.jpg`
    : "";
}

function participantAvatar(person, className) {
  const source = participantPhotoSource(person);
  const color = participantColor(person);
  if (!source) {
    return `<span class="${className} participant-avatar" style="--participant-color:${color}">${initials(displayName(person))}</span>`;
  }
  return `<img class="${className} participant-photo participant-avatar" style="--participant-color:${color}" src="${source}" alt="${escapeHtml(displayName(person))}" loading="lazy" decoding="async">`;
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
  "costa marfil": "ci",
  "cote divoire": "ci",
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
    "ivory coast": "ivory coast",
    "cote divoire": "ivory coast",
    "costa marfil": "costa de marfil",
  };
  return aliases[normalized] || normalized;
}

function broadcastTeamKey(name) {
  const normalized = String(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(ri|de|del|la|el)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
  const aliases = {
    congodr: "rdcongo",
    drcongo: "rdcongo",
    republicademocraticacongo: "rdcongo",
    ivorycoast: "costamarfil",
    cotedivoire: "costamarfil",
  };
  return aliases[normalized] || normalized;
}

async function loadBroadcastSchedule() {
  try {
    const response = await fetch("assets/data/canales-colombia-copa-2026.json");
    if (!response.ok) return;
    const data = await response.json();
    broadcastSchedule = Array.isArray(data.partidos) ? data.partidos : [];
  } catch (error) {
    console.error("Broadcast schedule error:", error);
  }
}

function channelsForMatch(match) {
  const date = bogotaDateKey(match.kickoff);
  const home = broadcastTeamKey(teamName(match.home));
  const away = broadcastTeamKey(teamName(match.away));
  const broadcast = broadcastSchedule.find((item) => {
    if (item.fecha !== date) return false;
    const first = broadcastTeamKey(item.equipo1);
    const second = broadcastTeamKey(item.equipo2);
    return (first === home && second === away) || (first === away && second === home);
  });
  return broadcast?.canales || [];
}

function channelIconMarkup(channel) {
  const channelIcons = {
    DIRECTV: { className: "directv", file: "directv.png", label: "DTV" },
    "Caracol TV": { className: "caracol", file: "caracol.png", label: "CAR" },
    "RCN TV": { className: "rcn", file: "rcn.png", label: "RCN" },
    "Win Sports": { className: "win", file: "win.png", label: "WIN" },
    "Disney+": { className: "disney", file: "disney.png", label: "D+" },
  };
  const icon = channelIcons[channel];
  if (!icon) return "";
  return `
    <span class="channel-icon ${icon.className}" title="${escapeHtml(channel)}" aria-label="${escapeHtml(channel)}">
      <img src="assets/channels/${icon.file}" alt="" loading="lazy" decoding="async">
      <span class="channel-icon-text">${icon.label}</span>
    </span>
  `;
}

function watchChannelsMarkup(match) {
  const channels = channelsForMatch(match);
  if (!channels.length) return "";
  return `
    <div class="today-watch" aria-label="Dónde ver en Colombia">
      <span class="today-watch-icons">${channels.map(channelIconMarkup).join("")}</span>
    </div>
  `;
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
    timeZone: APP_TIME_ZONE,
    ...options,
  }).format(new Date(dateValue));
}

function formatKickoff(dateValue) {
  return formatDate(dateValue, { hour: "numeric", minute: "2-digit" });
}

function bogotaDateKey(dateValue = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(dateValue));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function relativeBogotaDateKey(days) {
  const [year, month, day] = bogotaDateKey().split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function upcomingFirstSort(a, b) {
  const today = bogotaDateKey();
  const dateA = bogotaDateKey(a.kickoff);
  const dateB = bogotaDateKey(b.kickoff);
  const sectionA = dateA >= today ? 0 : 1;
  const sectionB = dateB >= today ? 0 : 1;
  if (sectionA !== sectionB) return sectionA - sectionB;
  return sectionA === 0
    ? new Date(a.kickoff) - new Date(b.kickoff)
    : new Date(b.kickoff) - new Date(a.kickoff);
}

function predictionDeadline(match) {
  return new Date(new Date(match.kickoff).getTime() - 30 * 60_000);
}

function isLocked(match) {
  return new Date() >= predictionDeadline(match) || ["IN_PLAY", "PAUSED", "FINISHED"].includes(match.status);
}

function outcome(home, away) {
  if (home === away) return "DRAW";
  return home > away ? "HOME" : "AWAY";
}

function predictionFor(userId, matchId) {
  const prediction = state.predictions[userId]?.[matchId] || null;
  return prediction?.automatic ? null : prediction;
}

function calculateStats(person) {
  let exact = 0;
  let correct = 0;
  let points = 0;
  let firstPredictionAt = Number.MAX_SAFE_INTEGER;
  const predictions = state.predictions[person.id] || {};

  state.matches.forEach((match) => {
    const prediction = predictions[match.id];
    if (!prediction || prediction.automatic) return;
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

function calculateStatsUntil(person, dateKey) {
  let exact = 0;
  let correct = 0;
  let points = 0;
  let firstPredictionAt = Number.MAX_SAFE_INTEGER;
  const predictions = state.predictions[person.id] || {};

  state.matches.forEach((match) => {
    if (bogotaDateKey(match.kickoff) > dateKey) return;
    const prediction = predictions[match.id];
    if (!prediction || prediction.automatic) return;
    firstPredictionAt = Math.min(firstPredictionAt, new Date(prediction.savedAt).getTime());
    if (!["FINISHED", "IN_PLAY", "PAUSED"].includes(match.status)) return;
    if (match.homeScore == null || match.awayScore == null) return;

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
  const targetDate = dateStr || bogotaDateKey();
  let exact = 0;
  let correct = 0;
  let points = 0;
  const predictions = state.predictions[person.id] || {};

  state.matches.forEach((match) => {
    const matchDate = bogotaDateKey(match.kickoff);
    if (matchDate !== targetDate) return;
    const prediction = predictions[match.id];
    if (!prediction || prediction.automatic) return;
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
    state.api = data.api || defaultState().api;
    state.settings = {
      ...defaultState().settings,
      ...(data.settings || {}),
    };
    state.predictions = {};
    for (const prediction of data.predictions || []) {
      if (prediction.automatic) continue;
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
  if (viewId === "pronosticos") renderGroupPredictions();
  if (viewId === "ranking") renderRanking();
  if (viewId === "estadisticas") renderStatistics();
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
        prediction
          ? "✓ Pronóstico guardado"
          : locked
            ? "Sin pronóstico"
            : "Ingresa ambos marcadores"
      }</div>
      ${locked ? `<button class="view-predictions-btn" data-view-predictions="${match.id}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>Ver predicciones</button>` : ""}
    </article>
  `;
}

function renderHome() {
  const upcoming = [...state.matches]
    .filter((match) => match.status !== "FINISHED")
    .sort(upcomingFirstSort);
  const todayKey = bogotaDateKey();
  const todayCards = upcoming.filter((match) => bogotaDateKey(match.kickoff) === todayKey);
  const cards = todayCards.length ? todayCards : upcoming.slice(0, 3);
  $("#homeMatches").innerHTML = cards.length
    ? cards.map((match) => listMatchCard(match, "home-match-card")).join("")
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

function listMatchCard(match, extraClass = "") {
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
    <article class="list-match-card ${extraClass}">
      <div class="list-match-meta">
        <strong>${formatKickoff(match.kickoff)}</strong>
        <span>${escapeHtml(match.stage)}</span>
        <small>${escapeHtml(match.venue)}</small>
      </div>
      <div class="list-match-main">
        <div class="list-match-team home">
          <span class="mini-flag">${flagMarkup(match.home, "small")}</span>
          <strong>${teamName(match.home)}</strong>
        </div>
        <div class="list-match-score">
        ${
          locked
            ? `<div class="locked-score">${prediction ? `${prediction.home} : ${prediction.away}` : "— : —"}</div>
               ${
                 match.status === "FINISHED"
                   ? `<span class="result-badge">${resultBadge || `FINAL ${match.homeScore}:${match.awayScore}`}</span>`
                   : `<span class="result-badge">${prediction ? "BLOQUEADO" : "SIN PRONÓSTICO"}</span>`
               }`
            : `<div class="list-prediction">
                <input class="score-input" data-match="${match.id}" data-side="home" type="number" min="0" max="20" value="${prediction?.home ?? ""}" placeholder="–">
                <span>:</span>
                <input class="score-input" data-match="${match.id}" data-side="away" type="number" min="0" max="20" value="${prediction?.away ?? ""}" placeholder="–">
              </div>`
        }
        </div>
        <div class="list-match-team away">
          <strong>${teamName(match.away)}</strong>
          <span class="mini-flag">${flagMarkup(match.away, "small")}</span>
        </div>
      </div>
      ${locked ? `<button class="view-predictions-btn" data-view-predictions="${match.id}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>Ver predicciones</button>` : ""}
    </article>
  `;
}

function renderMatchesPage() {
  renderStageFilters();
  const filtered = state.matches
    .filter((match) => activeStage === "Todos" || match.stage === activeStage)
    .filter((match) => `${match.home} ${match.away} ${teamName(match.home)} ${teamName(match.away)}`.toLowerCase().includes(searchTerm))
    .sort(upcomingFirstSort);

  const groups = Object.groupBy
    ? Object.groupBy(filtered, (match) => bogotaDateKey(match.kickoff))
    : filtered.reduce((acc, match) => {
        const key = bogotaDateKey(match.kickoff);
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
          pointsEarned = '<span class="points-badge wrong">0 pts</span>';
        }
      }
      if (match.status === "FINISHED" && !prediction) {
        pointsEarned = '<span class="points-badge wrong">0 pts</span>';
      }

      return `
        <div class="prediction-item ${person.id === state.currentUserId ? 'current-user' : ''}">
          <div class="prediction-user">
            ${participantAvatar(person, "pred-avatar")}
            <span class="pred-name">${escapeHtml(displayName(person))}</span>
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

function groupPredictionRows(match) {
  const locked = isLocked(match);
  if (!locked) {
    const user = currentUser();
    const prediction = user ? predictionFor(user.id, match.id) : null;
    return `
      <div class="group-prediction-private">
        <strong>Tu pronóstico: ${prediction ? `${prediction.home} - ${prediction.away}` : "Pendiente"}</strong>
        <span>Los pronósticos del grupo se revelan 30 minutos antes del partido.</span>
      </div>
    `;
  }

  return state.participants
    .map((person) => {
      const prediction = predictionFor(person.id, match.id);
      const score = prediction ? `${prediction.home} - ${prediction.away}` : "Sin pronóstico";
      return `
        <div class="group-prediction-row ${person.id === state.currentUserId ? "current-user" : ""}">
          ${participantAvatar(person, "pred-avatar")}
          <strong>${escapeHtml(displayName(person))}</strong>
          <span class="group-prediction-score">${score}</span>
        </div>
      `;
    })
    .join("");
}

function groupPredictionMatchCard(match) {
  const status = match.status === "FINISHED"
    ? `Final ${match.homeScore} - ${match.awayScore}`
    : isLocked(match)
      ? "Pronósticos revelados"
      : "Pronósticos ocultos";
  return `
    <article class="group-prediction-card">
      <div class="group-prediction-match">
        <div>
          <span class="stage-pill">${match.stage}</span>
          <small>${formatKickoff(match.kickoff)} · ${escapeHtml(match.venue)}</small>
        </div>
        <span class="group-prediction-status">${status}</span>
      </div>
      <div class="group-prediction-teams">
        <span><span class="mini-flag">${flagMarkup(match.home, "small")}</span>${teamName(match.home)}</span>
        <strong>VS</strong>
        <span><span class="mini-flag">${flagMarkup(match.away, "small")}</span>${teamName(match.away)}</span>
      </div>
      <div class="group-prediction-rows">${groupPredictionRows(match)}</div>
    </article>
  `;
}

function renderGroupPredictions() {
  const yesterday = relativeBogotaDateKey(-1);
  const today = relativeBogotaDateKey(0);
  const tomorrow = relativeBogotaDateKey(1);
  const filterDates = {
    yesterday: [yesterday],
    today: [today],
    tomorrow: [tomorrow],
    window: [yesterday, today, tomorrow],
  };
  const dates = filterDates[groupPredictionsDateFilter];
  const matches = [...state.matches]
    .filter((match) => !dates || dates.includes(bogotaDateKey(match.kickoff)))
    .sort(upcomingFirstSort);
  const groups = matches.reduce((result, match) => {
    const date = bogotaDateKey(match.kickoff);
    (result[date] ||= []).push(match);
    return result;
  }, {});

  $("#groupPredictionFilters").innerHTML = [
    ["window", "Ayer + Hoy + Mañana"],
    ["yesterday", "Ayer"],
    ["today", "Hoy"],
    ["tomorrow", "Mañana"],
    ["all", "Todos"],
  ].map(([value, label]) => `
    <button class="filter-button ${groupPredictionsDateFilter === value ? "active" : ""}" data-group-date-filter="${value}">
      ${label}
    </button>
  `).join("");

  $("#groupPredictionsList").innerHTML = Object.entries(groups).map(([date, dateMatches]) => `
    <section class="group-prediction-day">
      <div class="date-title">${formatDate(`${date}T12:00:00-05:00`, {
        weekday: "long",
        day: "numeric",
        month: "long",
      })}</div>
      <div class="group-prediction-grid">${dateMatches.map(groupPredictionMatchCard).join("")}</div>
    </section>
  `).join("") || '<div class="empty-state">No hay partidos para este período.</div>';

  $$("[data-group-date-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      groupPredictionsDateFilter = button.dataset.groupDateFilter;
      renderGroupPredictions();
    });
  });
}

function renderRanking() {
  const ranking = getRanking();
  const podiumClasses = ["first", "second", "third"];
  const podiumMedals = [
    { icon: "🥇", label: "Oro" },
    { icon: "🥈", label: "Plata" },
    { icon: "🥉", label: "Bronce" },
  ];
  
  // Partidos del día
  const today = bogotaDateKey();
  const todayMatches = state.matches
    .filter((m) => bogotaDateKey(m.kickoff) === today)
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
          const finishedAction = match.status === "FINISHED"
            ? `role="button" tabindex="0" data-ranking-match-points="${match.id}" aria-label="Ver puntos de ${teamName(match.home)} vs ${teamName(match.away)}"`
            : "";
          return `
            <div class="today-match ${statusClass}" ${finishedAction}>
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
              ${statusText ? `<span class="today-status">${statusText}${match.status === "FINISHED" ? " - Ver puntos" : ""}</span>` : ""}
              ${watchChannelsMarkup(match)}
            </div>
          `;
        }).join("")}
      </div>
    `;
  } else {
    $("#todayMatches").innerHTML = "";
  }

  $$("[data-ranking-match-points]").forEach((card) => {
    const openPoints = () => openPredictionsDialog(card.dataset.rankingMatchPoints);
    card.addEventListener("click", openPoints);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openPoints();
      }
    });
  });
  
  $("#podium").innerHTML = ranking
    .slice(0, 3)
    .map(
      (person, index) => `
        <article class="podium-card ${podiumClasses[index]}">
          <span class="podium-medal" role="img" aria-label="${podiumMedals[index].label}">${podiumMedals[index].icon}</span>
          ${participantAvatar(person, "podium-avatar")}
          <span class="podium-copy">
            <strong>${escapeHtml(displayName(person))}</strong>
            <small>${person.points} puntos · ${person.exact} exactos</small>
          </span>
        </article>`,
    )
    .join("");

  $("#rankingBody").innerHTML = ranking
    .map(
      (person, index) => {
        const isLast = index === ranking.length - 1;
        const isWarning = ranking.length > 1 && index === ranking.length - 2;
        const customBadges = rankingBadgesForIndex(index, ranking.length);
        return `
        <tr class="${isLast ? "ranking-last-place" : isWarning ? "ranking-warning-place" : ""}" style="--participant-row-color:${participantColor(person)}">
          <td><strong>#${index + 1}</strong></td>
          <td>
            <div class="ranking-person">
              ${participantAvatar(person, "table-avatar")}
              <span class="ranking-name">${escapeHtml(displayName(person))}</span>
              ${person.id === state.currentUserId ? '<span class="you-badge">TÚ</span>' : ""}
              ${rankingBadgeMarkup(customBadges)}
            </div>
          </td>
          <td>${person.exact}</td>
          <td>${person.correct}</td>
          <td class="points-cell">${person.points}</td>
        </tr>`;
      },
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
          ${participantAvatar(lastPerson, "last-place-avatar")}
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

function playRankingDragAnimation(ranking, { force = false } = {}) {
  if (!state.settings?.rankingDragEnabled) return;
  const container = $("#rankingDragAnimation");
  if (!container || !ranking.length || !$("#ranking").classList.contains("active-view")) return;

  const now = Date.now();
  if (!force && now - lastRankingDragAt < 7000) return;
  lastRankingDragAt = now;

  const lastPerson = ranking[ranking.length - 1];
  const name = escapeHtml(displayName(lastPerson));
  container.innerHTML = `
    <div class="ranking-drag-stage" style="--participant-color:${participantColor(lastPerson)}">
      <div class="ranking-drag-avatar">
        ${participantAvatar(lastPerson, "ranking-drag-photo")}
        <span>${name}</span>
      </div>
      <div class="ranking-drag-rope"></div>
      <img class="ranking-drag-runner" src="assets/animations/perra-run.gif" alt="" loading="eager" decoding="async">
      <div class="ranking-drag-caption">La perra del mundial va remolcando al último puesto</div>
    </div>
  `;

  container.classList.remove("is-playing");
  void container.offsetWidth;
  container.classList.add("is-playing");
  playRankingDragSound();

  clearTimeout(rankingDragTimer);
  rankingDragTimer = setTimeout(() => {
    container.classList.remove("is-playing");
    container.innerHTML = "";
  }, 3900);
}

function playRankingDragSound() {
  try {
    rankingDragAudio ||= new Audio("assets/audio/perra-bing-bong.mp3");
    rankingDragAudio.volume = 0.55;
    rankingDragAudio.currentTime = 0;
    const playPromise = rankingDragAudio.play();
    if (playPromise) playPromise.catch(() => {});
  } catch {
    // Some browsers block autoplay until the user interacts; the animation should still run.
  }
}

function rankingBadgesForIndex(index, total) {
  return (state.settings?.rankingBadges || [])
    .map((badge) => ({
      positionType: badge.positionType === "fromBottom" ? "fromBottom" : "fromTop",
      position: Math.max(1, Number(badge.position) || 1),
      emoji: String(badge.emoji || "").trim(),
      label: String(badge.label || "").trim(),
      tone: ["warning", "danger", "gold", "blue", "green"].includes(badge.tone) ? badge.tone : "gold",
    }))
    .filter((badge) => badge.label)
    .filter((badge) => {
      const target = badge.positionType === "fromBottom"
        ? total - badge.position + 1
        : badge.position;
      return target === index + 1;
    });
}

function rankingBadgeMarkup(badges) {
  return badges
    .map((badge) => `
      <span class="ranking-custom-badge ${badge.tone}">
        ${badge.emoji ? `<span class="ranking-badge-emoji">${escapeHtml(badge.emoji)}</span>` : ""}
        ${escapeHtml(badge.label)}
      </span>
    `)
    .join("");
}

function renderStatistics() {
  const container = $("#rankingHistory");
  const resultDates = [...new Set(
    state.matches
      .filter((match) => ["FINISHED", "IN_PLAY", "PAUSED"].includes(match.status))
      .filter((match) => match.homeScore != null && match.awayScore != null)
      .map((match) => bogotaDateKey(match.kickoff)),
  )].sort();

  if (!state.participants.length || !resultDates.length) {
    container.innerHTML = '<div class="empty-state">La gráfica aparecerá cuando existan participantes y resultados.</div>';
    return;
  }

  const history = resultDates.map((date) => ({
    date,
    ranking: state.participants
      .map((person) => calculateStatsUntil(person, date))
      .sort((a, b) =>
        b.points - a.points ||
        b.exact - a.exact ||
        a.firstPredictionAt - b.firstPredictionAt ||
        a.name.localeCompare(b.name)),
  }));
  const width = Math.max(720, resultDates.length * 120);
  const height = Math.max(360, state.participants.length * 54 + 100);
  const left = 62;
  const right = 50;
  const top = 42;
  const bottom = 62;
  const x = (index) => resultDates.length === 1
    ? width / 2
    : left + index * ((width - left - right) / (resultDates.length - 1));
  const y = (position) => state.participants.length === 1
    ? height / 2
    : top + (position - 1) * ((height - top - bottom) / (state.participants.length - 1));

  const paths = state.participants.map((person) => {
    const points = history.map((day, index) => {
      const position = day.ranking.findIndex((item) => item.id === person.id) + 1;
      return { x: x(index), y: y(position), position };
    });
    const path = points.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ");
    const last = points.at(-1);
    const source = participantPhotoSource(person);
    const marker = source
      ? `<image href="${source}" x="${last.x - 16}" y="${last.y - 16}" width="32" height="32" preserveAspectRatio="xMidYMid slice" class="chart-photo" />`
      : `<g><circle cx="${last.x}" cy="${last.y}" r="16" fill="${participantColor(person)}"/><text x="${last.x}" y="${last.y + 4}" text-anchor="middle" class="chart-initials">${initials(displayName(person))}</text></g>`;
    return `<g>
      <path d="${path}" fill="none" stroke="${participantColor(person)}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      ${points.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="5" fill="${participantColor(person)}" stroke="#090909" stroke-width="2"><title>${escapeHtml(displayName(person))}: puesto ${point.position}</title></circle>`).join("")}
      ${marker}
    </g>`;
  }).join("");

  container.innerHTML = `
    <div class="statistics-legend">
      ${state.participants.map((person) => `
        <div class="legend-person" style="--participant-color:${participantColor(person)}">
          ${participantAvatar(person, "legend-avatar")}
          <span>${escapeHtml(displayName(person))}</span>
        </div>`).join("")}
    </div>
    <div class="history-chart-scroll">
      <svg class="history-chart" style="width:${width}px" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Evolución diaria de posiciones">
        ${state.participants.map((_, index) => `
          <line x1="${left}" y1="${y(index + 1)}" x2="${width - right}" y2="${y(index + 1)}" class="chart-grid-line"/>
          <text x="22" y="${y(index + 1) + 5}" class="chart-rank">#${index + 1}</text>`).join("")}
        ${resultDates.map((date, index) => `
          <text x="${x(index)}" y="${height - 22}" text-anchor="middle" class="chart-date">${formatDate(`${date}T12:00:00-05:00`, { day: "numeric", month: "short" })}</text>`).join("")}
        ${paths}
      </svg>
    </div>
    <p class="statistics-note">Cada color representa la evolución diaria de un participante.</p>
  `;
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
  $("#userCredentialsNote").textContent = person?.credentialsNeedReset
    ? "Las credenciales anteriores no pueden recuperarse. Ingresa nuevamente el celular y la cédula."
    : "";
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
    .sort(upcomingFirstSort)
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
          ${participantAvatar(person, "table-avatar")}
          <div class="participant-data">
            <strong>${escapeHtml(person.name)}</strong>
            <small>Apodo: ${escapeHtml(displayName(person))}</small>
            <small>Celular: ${person.credentialsNeedReset ? "Requiere actualización" : escapeHtml(person.phone)}</small>
            <small>Cédula: ${person.credentialsNeedReset ? "Requiere actualización" : escapeHtml(person.document)}</small>
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
  $("#apiToken").value = "";
  $("#apiToken").placeholder = state.api.tokenConfigured
    ? "Token guardado; escribe uno nuevo para reemplazarlo"
    : "X-Auth-Token";
  $("#rankingDragEnabled").checked = state.settings?.rankingDragEnabled !== false;
  renderRankingBadgeEditor();
  renderReminderPanel();

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

  $("#rankingDragEnabled").onchange = saveAppSettings;
  $("#addRankingBadge").onclick = () => {
    state.settings.rankingBadges = [
      ...(state.settings.rankingBadges || []),
      { positionType: "fromTop", position: 1, emoji: "🏷️", label: "NUEVA LEYENDA", tone: "gold" },
    ];
    renderRankingBadgeEditor();
  };
  $("#saveRankingBadges").onclick = saveAppSettings;
}

function renderRankingBadgeEditor() {
  const badges = state.settings?.rankingBadges || defaultState().settings.rankingBadges;
  $("#rankingBadgeEditor").innerHTML = badges
    .map((badge, index) => `
      <div class="ranking-badge-row" data-ranking-badge-row="${index}">
        <select data-badge-field="positionType" aria-label="Tipo de puesto">
          <option value="fromTop" ${badge.positionType !== "fromBottom" ? "selected" : ""}>Desde arriba</option>
          <option value="fromBottom" ${badge.positionType === "fromBottom" ? "selected" : ""}>Desde abajo</option>
        </select>
        <input data-badge-field="position" type="number" min="1" max="99" value="${Number(badge.position) || 1}" aria-label="Puesto">
        <input class="emoji-input" data-badge-field="emoji" maxlength="8" value="${escapeHtml(badge.emoji || "")}" aria-label="Emoji">
        <input data-badge-field="label" maxlength="48" value="${escapeHtml(badge.label || "")}" placeholder="Leyenda" aria-label="Leyenda">
        <select data-badge-field="tone" aria-label="Color">
          ${["warning", "danger", "gold", "blue", "green"].map((tone) => `<option value="${tone}" ${badge.tone === tone ? "selected" : ""}>${tone}</option>`).join("")}
        </select>
        <button class="remove-ranking-badge" type="button" data-remove-ranking-badge="${index}" aria-label="Eliminar leyenda">×</button>
      </div>
    `)
    .join("");

  $$("[data-remove-ranking-badge]").forEach((button) => {
    button.onclick = () => {
      state.settings.rankingBadges = readRankingBadgeEditor()
        .filter((_, index) => index !== Number(button.dataset.removeRankingBadge));
      renderRankingBadgeEditor();
    };
  });
}

function readRankingBadgeEditor() {
  return $$("[data-ranking-badge-row]")
    .map((row) => ({
      positionType: row.querySelector('[data-badge-field="positionType"]').value,
      position: Number(row.querySelector('[data-badge-field="position"]').value) || 1,
      emoji: row.querySelector('[data-badge-field="emoji"]').value.trim(),
      label: row.querySelector('[data-badge-field="label"]').value.trim(),
      tone: row.querySelector('[data-badge-field="tone"]').value,
    }))
    .filter((badge) => badge.label);
}

function reminderMatches() {
  return [...state.matches]
    .filter((match) => !isLocked(match))
    .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
}

function reminderPendingUsers(match) {
  return state.participants.filter((person) => !predictionFor(person.id, match.id));
}

function formatRemainingTime(milliseconds) {
  const minutes = Math.max(0, Math.ceil(milliseconds / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

function renderReminderPanel() {
  const select = $("#reminderMatch");
  const preview = $("#reminderPreview");
  const shareButton = $("#shareReminder");
  if (!select || !preview || !shareButton) return;

  const matches = reminderMatches();
  if (!matches.some((match) => match.id === reminderMatchId)) {
    reminderMatchId = matches[0]?.id || "";
  }
  select.innerHTML = matches.map((match) => `
    <option value="${match.id}" ${match.id === reminderMatchId ? "selected" : ""}>
      ${formatDate(match.kickoff, { day: "numeric", month: "short" })} · ${escapeHtml(teamName(match.home))} vs. ${escapeHtml(teamName(match.away))}
    </option>
  `).join("");

  const match = matches.find((item) => item.id === reminderMatchId);
  shareButton.disabled = !match;
  if (!match) {
    preview.innerHTML = '<div class="empty-state">No hay partidos pendientes de cierre.</div>';
    return;
  }

  const pending = reminderPendingUsers(match);
  const deadline = predictionDeadline(match);
  const reminderAt = new Date(new Date(match.kickoff).getTime() - 60 * 60_000);
  const now = new Date();
  const timing = now >= reminderAt
    ? "Momento recomendado para compartir"
    : `Momento recomendado en ${formatRemainingTime(reminderAt - now)}`;

  preview.innerHTML = `
    <div class="reminder-preview-match">
      <span class="stage-pill">${escapeHtml(match.stage)}</span>
      <strong>${escapeHtml(teamName(match.home))} vs. ${escapeHtml(teamName(match.away))}</strong>
      <small>${formatDate(match.kickoff, { weekday: "long", day: "numeric", month: "long" })} · ${formatKickoff(match.kickoff)}</small>
    </div>
    <div class="reminder-preview-status">
      <span>${timing}</span>
      <strong>${pending.length} pendiente${pending.length === 1 ? "" : "s"}</strong>
      <small>Cierre: ${formatKickoff(deadline)}</small>
    </div>
    <div class="reminder-pending-names">
      ${pending.length
        ? pending.map((person) => `<span>${escapeHtml(displayName(person))}</span>`).join("")
        : "<span>Todos completaron su pronóstico</span>"}
    </div>
  `;
}

function loadCanvasImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = source;
  });
}

function wrapCanvasText(context, text, x, y, maxWidth, lineHeight, maxLines = Infinity) {
  const words = text.split(/\s+/);
  let line = "";
  let lines = 0;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width > maxWidth && line) {
      context.fillText(line, x, y);
      y += lineHeight;
      lines += 1;
      line = word;
      if (lines >= maxLines) return y;
    } else {
      line = candidate;
    }
  }
  if (line && lines < maxLines) {
    context.fillText(line, x, y);
    y += lineHeight;
  }
  return y;
}

async function createReminderImage(match, pending) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1080;
  const context = canvas.getContext("2d");
  const background = context.createLinearGradient(0, 0, 1080, 1080);
  background.addColorStop(0, "#07142b");
  background.addColorStop(0.5, "#090909");
  background.addColorStop(1, "#31080b");
  context.fillStyle = background;
  context.fillRect(0, 0, 1080, 1080);

  context.strokeStyle = "rgba(255, 193, 7, 0.45)";
  context.lineWidth = 4;
  context.strokeRect(36, 36, 1008, 1008);

  try {
    const logo = await loadCanvasImage("assets/logo-power-rangers-mundial.png");
    context.drawImage(logo, 70, 65, 150, 150);
  } catch {
    // The reminder remains usable even if the logo cannot be loaded.
  }

  context.fillStyle = "#ffc107";
  context.font = '700 26px "DM Sans", sans-serif';
  context.letterSpacing = "5px";
  context.fillText("FALTA TU PRONÓSTICO", 250, 125);
  context.letterSpacing = "0px";
  context.fillStyle = "#ffffff";
  context.font = '900 68px "Archivo Black", sans-serif';
  const titleY = wrapCanvasText(
    context,
    `${teamName(match.home)} vs. ${teamName(match.away)}`,
    70,
    300,
    940,
    78,
    2,
  );

  context.fillStyle = "#aeb2ba";
  context.font = '600 30px "DM Sans", sans-serif';
  context.fillText(
    `${formatDate(match.kickoff, { weekday: "long", day: "numeric", month: "long" })} · ${formatKickoff(match.kickoff)}`,
    70,
    titleY + 22,
  );

  context.fillStyle = "rgba(255, 193, 7, 0.09)";
  context.strokeStyle = "rgba(255, 193, 7, 0.35)";
  context.fillRect(70, titleY + 70, 940, 150);
  context.strokeRect(70, titleY + 70, 940, 150);
  context.fillStyle = "#ffc107";
  context.font = '900 42px "Archivo Black", sans-serif';
  context.fillText(`CIERRA A LAS ${formatKickoff(predictionDeadline(match))}`, 105, titleY + 130);
  context.fillStyle = "#ffffff";
  context.font = '600 28px "DM Sans", sans-serif';
  context.fillText("Ingresa ahora y guarda tu marcador.", 105, titleY + 180);

  const pendingNames = pending.map(displayName);
  context.fillStyle = "#ffffff";
  context.font = '900 34px "Archivo Black", sans-serif';
  context.fillText(
    pending.length ? `${pending.length} PENDIENTE${pending.length === 1 ? "" : "S"}` : "TODOS COMPLETARON",
    70,
    titleY + 295,
  );
  context.fillStyle = "#d9d9d9";
  context.font = '600 29px "DM Sans", sans-serif';
  wrapCanvasText(
    context,
    pendingNames.length ? pendingNames.join(" · ") : "El grupo ya completó sus pronósticos.",
    70,
    titleY + 345,
    940,
    42,
    4,
  );

  context.fillStyle = "#ffc107";
  context.font = '700 25px "DM Sans", sans-serif';
  context.fillText("powerrangersmundial.azurewebsites.net", 70, 1000);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("No fue posible crear la imagen")), "image/png");
  });
}

function reminderMessage(match, pending) {
  const names = pending.map(displayName);
  return [
    `⚡ *Falta tu pronóstico*`,
    `${teamName(match.home)} vs. ${teamName(match.away)}`,
    `Partido: ${formatDate(match.kickoff, { weekday: "long", day: "numeric", month: "long" })} a las ${formatKickoff(match.kickoff)}`,
    `Cierre: ${formatKickoff(predictionDeadline(match))}`,
    names.length ? `Pendientes: ${names.join(", ")}` : "Todos completaron su pronóstico.",
    `${window.location.origin}/#partidos`,
  ].join("\n");
}

async function sharePredictionReminder() {
  const match = state.matches.find((item) => item.id === reminderMatchId);
  if (!match || isLocked(match)) {
    showToast("Selecciona un partido que aún no haya cerrado.");
    renderReminderPanel();
    return;
  }

  const button = $("#shareReminder");
  const pending = reminderPendingUsers(match);
  const shareProbe = new File([""], "recordatorio.png", { type: "image/png" });
  const supportsFileShare = Boolean(navigator.share && navigator.canShare?.({ files: [shareProbe] }));
  const whatsappWindow = supportsFileShare ? null : window.open("", "_blank");
  button.disabled = true;
  button.textContent = "Creando imagen...";
  try {
    const blob = await createReminderImage(match, pending);
    const file = new File([blob], `recordatorio-${match.id}.png`, { type: "image/png" });
    const text = reminderMessage(match, pending);
    if (supportsFileShare) {
      await navigator.share({
        title: `${teamName(match.home)} vs. ${teamName(match.away)}`,
        text,
        files: [file],
      });
      showToast("Recordatorio listo para compartir");
      return;
    }

    const imageUrl = URL.createObjectURL(blob);
    const download = document.createElement("a");
    download.href = imageUrl;
    download.download = file.name;
    download.click();
    setTimeout(() => URL.revokeObjectURL(imageUrl), 10_000);
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
    if (whatsappWindow) {
      whatsappWindow.opener = null;
      whatsappWindow.location.href = whatsappUrl;
    } else {
      window.location.href = whatsappUrl;
    }
    showToast("Imagen descargada y mensaje abierto");
  } catch (error) {
    whatsappWindow?.close();
    if (error.name !== "AbortError") {
      console.error(error);
      showToast("No fue posible preparar el recordatorio.");
    }
  } finally {
    button.disabled = false;
    button.textContent = "Crear imagen y compartir";
  }
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
      body: JSON.stringify({ resource: "matches" }),
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
  console.log("silentSync: iniciando...", { url: state.api.url, hasToken: state.api.tokenConfigured });
  if (!state.api.url || !state.api.tokenConfigured) {
    console.log("silentSync: falta URL o token");
    return;
  }
  try {
    const response = await fetch("/api/football-proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resource: "matches" }),
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
  
  if (!state.api.tokenConfigured) return null;
  
  try {
    const response = await fetch("/api/football-proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resource: "standings" }),
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
        ${!state.api.tokenConfigured ? '<p><strong>⚠️ No hay token de API configurado</strong></p>' : ''}
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
  const photoSource = user ? participantPhotoSource(user) : "";
  $("#profileInitial").innerHTML = photoSource
    ? `<img class="profile-photo" src="${photoSource}" alt="${escapeHtml(displayName(user))}">`
    : user
      ? initials(displayName(user))
      : "?";
  $("#profileName").textContent = user ? displayName(user) : "Entrar";
  $$(".admin-only").forEach((element) => element.classList.toggle("hidden", !isAdmin()));
}

function renderAll() {
  renderProfile();
  renderHome();
  renderMatchesPage();
  renderGroupPredictions();
  renderRanking();
  renderStatistics();
  if (isAdmin()) renderAdmin();
}

$$("[data-view]").forEach((button) => {
  button.addEventListener("click", () => {
    navigate(button.dataset.view);
    if (button.dataset.view === "ranking") playRankingDragAnimation(getRanking(), { force: true });
  });
});

$$("[data-go]").forEach((button) => {
  button.addEventListener("click", () => {
    navigate(button.dataset.go);
    if (button.dataset.go === "ranking") playRankingDragAnimation(getRanking(), { force: true });
  });
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

$("#apiForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const config = await apiRequest("/api/settings/api", {
      method: "PUT",
      body: JSON.stringify({
        url: $("#apiUrl").value.trim(),
        token: $("#apiToken").value.trim(),
      }),
    });
    state.api = config;
    saveState();
    renderAdmin();
    showToast("Configuración compartida guardada");
  } catch (error) {
    showToast(error.message);
  }
});

async function saveAppSettings() {
  const enabled = $("#rankingDragEnabled").checked;
  const rankingBadges = readRankingBadgeEditor();
  try {
    const settings = await apiRequest("/api/settings/app", {
      method: "PUT",
      body: JSON.stringify({ rankingDragEnabled: enabled, rankingBadges }),
    });
    state.settings = {
      ...defaultState().settings,
      ...settings,
    };
    saveState();
    showToast(enabled ? "Animación de ranking activada" : "Animación de ranking desactivada");
  } catch (error) {
    $("#rankingDragEnabled").checked = state.settings?.rankingDragEnabled !== false;
    showToast(error.message);
  }
}

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

$("#reminderMatch").addEventListener("change", (event) => {
  reminderMatchId = event.target.value;
  renderReminderPanel();
});

$("#shareReminder").addEventListener("click", sharePredictionReminder);

window.addEventListener("hashchange", () => {
  const view = window.location.hash.slice(1);
  if (["inicio", "partidos", "pronosticos", "ranking", "estadisticas", "grupos", "admin"].includes(view)) navigate(view);
});

async function initializeApp() {
  await loadBroadcastSchedule();
  const authenticated = await restoreSession();
  if (authenticated && isAdmin()) {
    await loadAdminUsers().catch(console.error);
  }
  renderAll();
  const initialView = window.location.hash.slice(1);
  if (["inicio", "partidos", "pronosticos", "ranking", "estadisticas", "grupos", "admin"].includes(initialView)) {
    navigate(initialView);
  } else {
    navigate("ranking");
  }
  if (!authenticated) setTimeout(() => $("#authDialog").showModal(), 300);
  
  // Sync inicial si hay token y partidos hoy
  const today = bogotaDateKey();
  const hasTodayMatches = state.matches.some((m) => bogotaDateKey(m.kickoff) === today);
  if (hasTodayMatches && state.api.tokenConfigured) {
    setTimeout(() => silentSync(), 2000);
  }
}

initializeApp();

// Auto-refresh cada minuto
setInterval(() => {
  renderHome();
  // Siempre actualizar ranking si está visible
  if ($("#ranking").classList.contains("active-view")) renderRanking();
}, 60_000);

// Auto-sync con API si hay partidos hoy (cada 30 minutos para evitar datos incompletos)
setInterval(async () => {
  const today = bogotaDateKey();
  const hasTodayMatches = state.matches.some((m) => bogotaDateKey(m.kickoff) === today);
  if (hasTodayMatches && state.api.tokenConfigured) {
    console.log("Auto-sync: sincronizando partidos del día...");
    await silentSync();
  }
}, 1_800_000); // 30 minutos
