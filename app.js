const ADMIN_ID = "admin";
const STORAGE_KEY = "prm_state_v1";
const APP_TIME_ZONE = "America/Bogota";

const groupStageMatches = window.WORLD_CUP_GROUP_FIXTURES;

function knockoutSlots(count, startNumber, sourceStart = null) {
  return Array.from({ length: count }, (_, index) => ({
    code: `P${startNumber + index}`,
    home: sourceStart ? `Ganador P${sourceStart + index * 2}` : `1º grupo ${String.fromCharCode(65 + index)}`,
    away: sourceStart ? `Ganador P${sourceStart + index * 2 + 1}` : "Clasificado por definir",
  }));
}

const KNOCKOUT_ROUNDS = [
  { name: "Ronda de 32", dates: "28 de junio - 3 de julio", note: "Cruces oficiales de eliminacion directa.", matches: knockoutSlots(16, 73) },
  { name: "Octavos de final", dates: "4 - 7 de julio", note: "Avanzan los ganadores de la ronda de 32.", matches: knockoutSlots(8, 89, 73) },
  { name: "Cuartos de final", dates: "9 - 11 de julio", note: "Camino directo a semifinales.", matches: knockoutSlots(4, 97, 89) },
  { name: "Semifinales", dates: "14 - 15 de julio", note: "Los dos ganadores juegan la final.", matches: knockoutSlots(2, 101, 97) },
  { name: "Tercer puesto", dates: "18 de julio", note: "Partido por el tercer lugar.", matches: [{ code: "P103", home: "Perdedor semifinal 1", away: "Perdedor semifinal 2" }] },
  { name: "Final", dates: "19 de julio", note: "Campeon del mundo 2026.", matches: [{ code: "P104", home: "Ganador semifinal 1", away: "Ganador semifinal 2" }] },
];

const DECISION_METHODS = {
  REGULAR: "90 minutos",
  EXTRA_TIME: "Tiempo extra",
  PENALTIES: "Penales",
};

const KNOCKOUT_PHASE_BONUS = {
  "Ronda de 32": 1,
  "Octavos de final": 1,
  "Cuartos de final": 2,
  Semifinales: 3,
  Final: 5,
};

const KNOCKOUT_SCORING_ENABLED = false;

const KNOCKOUT_STAGES = new Set([
  ...Object.keys(KNOCKOUT_PHASE_BONUS),
  "Tercer puesto",
]);

const KNOCKOUT_SCHEDULE = {
  P73: "2026-06-28T14:00:00-05:00",
  P74: "2026-06-28T17:00:00-05:00",
  P75: "2026-06-28T20:00:00-05:00",
  P76: "2026-06-29T14:00:00-05:00",
  P77: "2026-06-29T17:00:00-05:00",
  P78: "2026-06-29T20:00:00-05:00",
  P79: "2026-06-30T14:00:00-05:00",
  P80: "2026-06-30T17:00:00-05:00",
  P81: "2026-06-30T20:00:00-05:00",
  P82: "2026-07-01T14:00:00-05:00",
  P83: "2026-07-01T17:00:00-05:00",
  P84: "2026-07-01T20:00:00-05:00",
  P85: "2026-07-02T17:00:00-05:00",
  P86: "2026-07-02T20:00:00-05:00",
  P87: "2026-07-03T17:00:00-05:00",
  P88: "2026-07-03T20:00:00-05:00",
  P89: "2026-07-04T14:00:00-05:00",
  P90: "2026-07-04T17:00:00-05:00",
  P91: "2026-07-05T14:00:00-05:00",
  P92: "2026-07-05T17:00:00-05:00",
  P93: "2026-07-06T14:00:00-05:00",
  P94: "2026-07-06T17:00:00-05:00",
  P95: "2026-07-07T14:00:00-05:00",
  P96: "2026-07-07T17:00:00-05:00",
  P97: "2026-07-09T14:00:00-05:00",
  P98: "2026-07-09T17:00:00-05:00",
  P99: "2026-07-10T14:00:00-05:00",
  P100: "2026-07-11T17:00:00-05:00",
  P101: "2026-07-14T19:00:00-05:00",
  P102: "2026-07-15T19:00:00-05:00",
  P103: "2026-07-18T15:00:00-05:00",
  P104: "2026-07-19T14:00:00-05:00",
};

function knockoutMatchFixtures() {
  return KNOCKOUT_ROUNDS.flatMap((round) =>
    round.matches.map((match) => ({
      id: `wc26-${match.code.toLowerCase()}`,
      code: match.code,
      stage: round.name,
      kickoff: KNOCKOUT_SCHEDULE[match.code],
      home: match.home,
      away: match.away,
      venue: "Sede por definir",
      status: "SCHEDULED",
      homeScore: null,
      awayScore: null,
    })),
  ).filter((match) => match.kickoff);
}

const initialMatches = [
  ...groupStageMatches,
  ...knockoutMatchFixtures(),
];

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
  localStorage.removeItem(STORAGE_KEY);
  return defaultState();
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
let autoSyncRunning = false;
let sessionRefreshPromise = null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function saveState() {
  localStorage.removeItem(STORAGE_KEY);
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

function activeBogotaDateKeys() {
  return [relativeBogotaDateKey(0), relativeBogotaDateKey(-1)];
}

function isTodayOrYesterdayMatch(match) {
  return activeBogotaDateKeys().includes(bogotaDateKey(match.kickoff));
}

function isLiveDashboardMatch(match) {
  const today = relativeBogotaDateKey(0);
  const yesterday = relativeBogotaDateKey(-1);
  const matchDate = bogotaDateKey(match.kickoff);
  return matchDate === today || (matchDate === yesterday && match.status !== "FINISHED");
}

function isMatchInLiveSyncWindow(match, now = new Date()) {
  if (match.status === "FINISHED") return false;
  const kickoff = new Date(match.kickoff);
  if (Number.isNaN(kickoff.getTime())) return false;
  const syncWindowEnds = new Date(kickoff.getTime() + 2 * 60 * 60_000);
  return now >= kickoff && now < syncWindowEnds;
}

function liveSyncWindowMatches(now = new Date()) {
  return state.matches.filter((match) => isMatchInLiveSyncWindow(match, now));
}

async function autoSyncLiveMatches(reason = "interval") {
  if (!state.api.tokenConfigured) return;
  const activeMatches = liveSyncWindowMatches();
  if (!activeMatches.length || autoSyncRunning) return;
  autoSyncRunning = true;
  console.log(
    `Auto-sync (${reason}): ${activeMatches.length} partido(s) en ventana de 2 horas`,
    activeMatches.map((match) => `${match.home} vs ${match.away}`),
  );
  try {
    await silentSync();
  } finally {
    autoSyncRunning = false;
  }
}

function dayAwareSort(a, b) {
  const today = relativeBogotaDateKey(0);
  const yesterday = relativeBogotaDateKey(-1);
  const dateA = bogotaDateKey(a.kickoff);
  const dateB = bogotaDateKey(b.kickoff);
  const priority = (date) => {
    if (date === today) return 0;
    if (date === yesterday) return 1;
    if (date > today) return 2;
    return 3;
  };
  const sectionA = priority(dateA);
  const sectionB = priority(dateB);
  if (sectionA !== sectionB) return sectionA - sectionB;
  return sectionA === 3
    ? new Date(b.kickoff) - new Date(a.kickoff)
    : new Date(a.kickoff) - new Date(b.kickoff);
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

function isKnockoutMatch(match) {
  return KNOCKOUT_STAGES.has(String(match.stage || "").trim());
}

function decisionLabel(value) {
  return DECISION_METHODS[value] || "";
}

function qualifierLabel(match, value) {
  if (value === "home") return teamName(match.home);
  if (value === "away") return teamName(match.away);
  return "";
}

function matchWinnerSide(match) {
  if (match.winner === "home" || match.winner === "away") return match.winner;
  if (match.homeScore == null || match.awayScore == null || match.homeScore === match.awayScore) return null;
  return match.homeScore > match.awayScore ? "home" : "away";
}

function knockoutPhaseBonus(match) {
  return KNOCKOUT_PHASE_BONUS[match.stage] || 0;
}

function scorePrediction(prediction, match) {
  const empty = { applies: false, exact: 0, correct: 0, points: 0, details: [] };
  if (!prediction || prediction.automatic) return empty;
  if (isKnockoutMatch(match) && !KNOCKOUT_SCORING_ENABLED) return empty;

  const usesKnockoutScoring = KNOCKOUT_SCORING_ENABLED && isKnockoutMatch(match);
  const validStatuses = usesKnockoutScoring ? ["FINISHED"] : ["FINISHED", "IN_PLAY", "PAUSED"];
  if (!validStatuses.includes(match.status) || match.homeScore == null || match.awayScore == null) return {
    ...empty,
    applies: true,
  };

  const details = [];
  const exactScore = prediction.home === match.homeScore && prediction.away === match.awayScore;
  const resultCorrect = outcome(prediction.home, prediction.away) === outcome(match.homeScore, match.awayScore);
  let exact = 0;
  let correct = 0;
  let points = 0;

  if (!usesKnockoutScoring) {
    if (exactScore) {
      exact = 1;
      points = 2;
      details.push("+2 exacto");
    } else if (resultCorrect) {
      correct = 1;
      points = 1;
      details.push("+1 resultado");
    }
    return { applies: true, exact, correct, points, details };
  }

  if (exactScore) {
    exact = 1;
    points += 5;
    details.push("+5 marcador");
  } else if (resultCorrect) {
    correct = 1;
    points += 3;
    details.push("+3 resultado 90'");
  }

  const winner = matchWinnerSide(match);
  const qualifierCorrect = Boolean(winner && prediction.qualifier === winner);
  if (qualifierCorrect) {
    const bonus = knockoutPhaseBonus(match);
    points += 4 + bonus;
    details.push(`+4 clasificado${bonus ? ` +${bonus} fase` : ""}`);
  }

  const decisionCorrect = Boolean(match.decision && prediction.decision === match.decision);
  if (decisionCorrect) {
    points += 2;
    details.push("+2 definicion");
  }

  if (exactScore && qualifierCorrect && decisionCorrect) {
    points += 3;
    details.push("+3 perfecto");
  }

  return { applies: true, exact, correct, points, details };
}

function predictionFor(userId, matchId) {
  const prediction = state.predictions[userId]?.[matchId] || null;
  return prediction?.automatic ? null : prediction;
}

function predictionScoreText(prediction, separator = "–") {
  return prediction ? `${prediction.home} ${separator} ${prediction.away}` : `— ${separator} —`;
}

function predictionMetaText(match, prediction) {
  if (!prediction || !isKnockoutMatch(match)) return "";
  const parts = [];
  if (prediction.qualifier) parts.push(`Clasifica ${qualifierLabel(match, prediction.qualifier)}`);
  if (prediction.decision) parts.push(decisionLabel(prediction.decision));
  return parts.join(" · ");
}

function knockoutPredictionControls(match, prediction, compact = false) {
  if (!isKnockoutMatch(match)) return "";
  const option = (value) => `<option value="${value}" ${prediction?.qualifier === value ? "selected" : ""}>${qualifierLabel(match, value)}</option>`;
  return `
    <div class="knockout-prediction ${compact ? "compact" : ""}">
      <label>
        <span>Clasifica</span>
        <select data-match="${match.id}" data-knockout-field="qualifier" aria-label="Equipo clasificado">
          <option value="">Elige</option>
          ${option("home")}
          ${option("away")}
        </select>
      </label>
      <label>
        <span>Definición</span>
        <select data-match="${match.id}" data-knockout-field="decision" aria-label="Método de definición">
          <option value="">Elige</option>
          ${Object.entries(DECISION_METHODS).map(([value, label]) => `<option value="${value}" ${prediction?.decision === value ? "selected" : ""}>${label}</option>`).join("")}
        </select>
      </label>
    </div>
  `;
}

function matchResultSummary(match) {
  if (match.status !== "FINISHED") return "";
  const score = `${match.homeScore} – ${match.awayScore}`;
  if (!isKnockoutMatch(match)) return score;
  const winner = matchWinnerSide(match);
  const extras = [
    winner ? `Clasificó ${qualifierLabel(match, winner)}` : "",
    decisionLabel(match.decision),
  ].filter(Boolean);
  return extras.length ? `${score} · ${extras.join(" · ")}` : score;
}

function predictionResultBadge(match, prediction) {
  if (match.status !== "FINISHED") return prediction ? "BLOQUEADO" : "SIN PRONÓSTICO";
  if (!prediction) return "SIN PUNTOS";
  const scored = scorePrediction(prediction, match);
  if (!scored.points) return "SIN PUNTOS";
  return `${scored.details[0]?.toUpperCase() || "PUNTOS"} · +${scored.points}`;
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
    const scored = scorePrediction(prediction, match);
    exact += scored.exact;
    correct += scored.correct;
    points += scored.points;
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
    const scored = scorePrediction(prediction, match);
    exact += scored.exact;
    correct += scored.correct;
    points += scored.points;
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
    const scored = scorePrediction(prediction, match);
    exact += scored.exact;
    correct += scored.correct;
    points += scored.points;
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

function matchLiveMinute(match) {
  if (Number.isFinite(Number(match.liveMinute))) return Math.max(0, Math.floor(Number(match.liveMinute)));
  if (match.status !== "IN_PLAY") return null;
  const kickoff = new Date(match.kickoff);
  if (Number.isNaN(kickoff.getTime())) return null;
  const elapsed = Math.floor((Date.now() - kickoff.getTime()) / 60_000);
  return elapsed >= 0 && elapsed <= 130 ? elapsed : null;
}

function matchStatusLabel(match) {
  if (match.status === "IN_PLAY") {
    const minute = matchLiveMinute(match);
    return minute == null ? "En juego" : `En juego · ${minute}'`;
  }
  if (match.status === "PAUSED") return "Descanso";
  if (match.status === "FINISHED") return "Final";
  return isLocked(match) ? "Bloqueado" : "";
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
        qualifier: prediction.qualifier || "",
        decision: prediction.decision || "",
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
            winner: result.winner,
            decision: result.decision,
          }
        : match;
    });
    saveState();
    return true;
  } catch (error) {
    if (error.status !== 401) console.error(error);
    state.participants = [];
    state.currentUserId = null;
    state.predictions = {};
    state.matches = initialMatches.map((match) => ({ ...match }));
    adminUsers = [];
    saveState();
    return false;
  }
}

async function refreshSessionFromDatabase() {
  if (sessionRefreshPromise) return sessionRefreshPromise;
  const previousUserId = state.currentUserId;
  sessionRefreshPromise = (async () => {
    const authenticated = await restoreSession();
    if (authenticated) await refreshKnockoutFixturesFromStandings().catch(console.error);
    if (authenticated && isAdmin()) await loadAdminUsers().catch(console.error);
    if (previousUserId && state.currentUserId && previousUserId !== state.currentUserId) {
      showToast("Sesión actualizada desde la base de datos");
    }
    return authenticated;
  })().finally(() => {
    sessionRefreshPromise = null;
  });
  return sessionRefreshPromise;
}

async function navigate(viewId, options = {}) {
  if (viewId === "grupos") viewId = "pronosticos";
  if (options.refresh !== false) await refreshSessionFromDatabase();
  if (viewId === "admin" && !isAdmin()) return;
  if (["partidos", "pronosticos", "ranking", "llaves"].includes(viewId)) {
    await refreshKnockoutFixturesFromApi().catch(console.error);
  }
  $$(".view").forEach((view) => view.classList.toggle("active-view", view.id === viewId));
  $$("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === viewId));
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (viewId === "partidos") renderMatchesPage();
  if (viewId === "pronosticos") renderGroupPredictions();
  if (viewId === "ranking") renderRanking();
  if (viewId === "estadisticas") renderStatistics();
  if (viewId === "llaves") renderKnockoutBracket();
  if (viewId === "admin") renderAdmin();
}

function matchCard(match) {
  const user = currentUser();
  const prediction = user ? predictionFor(user.id, match.id) : null;
  const locked = isLocked(match);
  const resultText =
    match.status === "FINISHED"
      ? matchResultSummary(match)
      : locked
        ? prediction
          ? predictionScoreText(prediction)
          : "Cerrado"
        : "Tu marcador";
  const predictionMeta = predictionMetaText(match, prediction);

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
            </div>
            ${knockoutPredictionControls(match, prediction)}`
      }
      ${locked && predictionMeta ? `<div class="knockout-summary">${predictionMeta}</div>` : ""}
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
  const activeDayCards = [...state.matches]
    .filter(isLiveDashboardMatch)
    .sort(dayAwareSort);
  const cards = activeDayCards.length ? activeDayCards : upcoming.slice(0, 3);
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
  const resultBadge = predictionResultBadge(match, prediction);
  const predictionMeta = predictionMetaText(match, prediction);

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
            ? `<div class="locked-score">${predictionScoreText(prediction, ":")}</div>
               ${
                 match.status === "FINISHED"
                   ? `<span class="result-badge">${resultBadge}</span>`
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
      ${!locked ? knockoutPredictionControls(match, prediction, true) : ""}
      ${locked && predictionMeta ? `<div class="knockout-summary compact">${predictionMeta}</div>` : ""}
      ${locked ? `<button class="view-predictions-btn" data-view-predictions="${match.id}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>Ver predicciones</button>` : ""}
    </article>
  `;
}

function renderMatchesPage() {
  renderStageFilters();
  const filtered = state.matches
    .filter((match) => activeStage === "Todos" || match.stage === activeStage)
    .filter((match) => `${match.home} ${match.away} ${teamName(match.home)} ${teamName(match.away)}`.toLowerCase().includes(searchTerm))
    .sort(dayAwareSort);

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
  $$(".score-input[data-match], [data-knockout-field][data-match]").forEach((input) => {
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
      const qualifierInput = container.querySelector('[data-knockout-field="qualifier"]');
      const decisionInput = container.querySelector('[data-knockout-field="decision"]');
      if (homeInput.value === "" || awayInput.value === "") return;

      const home = Number(homeInput.value);
      const away = Number(awayInput.value);
      if (home < 0 || away < 0 || home > 20 || away > 20) {
        showToast("Usa un marcador entre 0 y 20.");
        return;
      }
      const qualifier = qualifierInput?.value || "";
      const decision = decisionInput?.value || "";
      if (isKnockoutMatch(match) && (!qualifier || !decision)) {
        showToast("En eliminatoria elige clasificado y definición.");
        return;
      }

      try {
        const data = await apiRequest(`/api/predictions/${encodeURIComponent(match.id)}`, {
          method: "PUT",
          body: JSON.stringify({ home, away, qualifier, decision }),
        });
        state.predictions[user.id] ||= {};
        state.predictions[user.id][match.id] = {
          home,
          away,
          qualifier,
          decision,
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
    ? `<div class="result-final">Resultado final: <strong>${matchResultSummary(match)}</strong></div>`
    : `<div class="result-pending">Partido en curso o por jugarse</div>`;
  
  $("#predictionsMatchInfo").innerHTML = `
    <div class="match-datetime">${formatDate(match.kickoff, { weekday: "long", day: "numeric", month: "long" })} · ${formatKickoff(match.kickoff)}</div>
    ${resultInfo}
  `;

  const predictionsHtml = state.participants
    .map((person) => {
      const prediction = predictionFor(person.id, matchId);
      const predText = prediction ? predictionScoreText(prediction) : "Sin predicción";
      const predMeta = predictionMetaText(match, prediction);
      
      let pointsEarned = "";
      if (match.status === "FINISHED" && prediction) {
        const scored = scorePrediction(prediction, match);
        const badgeClass = scored.points >= 5 ? "exact" : scored.points > 0 ? "correct" : "wrong";
        pointsEarned = `<span class="points-badge ${badgeClass}">${scored.points ? `+${scored.points}` : "0"} pts</span>`;
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
          ${predMeta ? `<small class="pred-meta">${predMeta}</small>` : ""}
          ${
            match.status === "FINISHED" && prediction
              ? `<small class="pred-breakdown">${scorePrediction(prediction, match).details.join(" · ") || "Sin puntos"}</small>`
              : ""
          }
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
    const meta = predictionMetaText(match, prediction);
    return `
      <div class="group-prediction-private">
        <strong>Tu pronóstico: ${prediction ? predictionScoreText(prediction, "-") : "Pendiente"}</strong>
        ${meta ? `<small>${meta}</small>` : ""}
        <span>Los pronósticos se revelan 30 minutos antes del partido.</span>
      </div>
    `;
  }

  return state.participants
    .map((person) => {
      const prediction = predictionFor(person.id, match.id);
      const score = prediction ? predictionScoreText(prediction, "-") : "Sin pronóstico";
      const meta = predictionMetaText(match, prediction);
      return `
        <div class="group-prediction-row ${person.id === state.currentUserId ? "current-user" : ""}">
          ${participantAvatar(person, "pred-avatar")}
          <strong>${escapeHtml(displayName(person))}</strong>
          <span class="group-prediction-score">${score}${meta ? `<small>${meta}</small>` : ""}</span>
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
    .filter((match) => isKnockoutMatch(match))
    .filter((match) => !dates || dates.includes(bogotaDateKey(match.kickoff)))
    .sort(dayAwareSort);
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
  const todayMatches = state.matches
    .filter(isLiveDashboardMatch)
    .sort(dayAwareSort);
  
  if (todayMatches.length > 0) {
    const hasLiveMatches = todayMatches.some((m) => m.status === "IN_PLAY" || m.status === "PAUSED");
    $("#todayMatches").innerHTML = `
      <div class="today-matches-header">
        <span class="today-icon">${hasLiveMatches ? "🔴" : "📅"}</span>
        <span class="today-title">Partidos de hoy y ayer</span>
        ${hasLiveMatches ? '<span class="live-indicator">EN VIVO</span>' : ""}
      </div>
      <div class="today-matches-grid">
        ${todayMatches.map((match) => {
          const statusClass = match.status === "IN_PLAY" || match.status === "PAUSED" ? "live" : 
                              match.status === "FINISHED" ? "finished" : "scheduled";
          const scoreText = match.homeScore != null && match.awayScore != null 
            ? `${match.homeScore} - ${match.awayScore}` 
            : formatKickoff(match.kickoff);
          const statusText = matchStatusLabel(match);
          const canOpenPredictions = isLocked(match);
          const predictionAction = canOpenPredictions
            ? `role="button" tabindex="0" data-ranking-match-predictions="${match.id}" aria-label="Ver pronósticos de ${teamName(match.home)} vs ${teamName(match.away)}"`
            : "";
          const statusActionText = match.status === "FINISHED" ? " - Ver puntos" :
                                   canOpenPredictions ? " - Ver pronósticos" : "";
          return `
            <div class="today-match ${statusClass}" ${predictionAction}>
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
              ${statusText ? `<span class="today-status">${statusText}${statusActionText}</span>` : ""}
              ${watchChannelsMarkup(match)}
            </div>
          `;
        }).join("")}
      </div>
    `;
  } else {
    $("#todayMatches").innerHTML = "";
  }

  $$("[data-ranking-match-predictions]").forEach((card) => {
    const openPredictions = () => openPredictionsDialog(card.dataset.rankingMatchPredictions);
    card.addEventListener("click", openPredictions);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openPredictions();
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

function standingsGroupsFromData(data) {
  return (data?.standings || [])
    .filter((standing) => standing.type === "TOTAL")
    .sort((a, b) => String(a.group || a.stage || "").localeCompare(String(b.group || b.stage || ""), "es", { numeric: true }));
}

function groupShortName(group, index) {
  const raw = String(group.group || group.stage || `Grupo ${String.fromCharCode(65 + index)}`);
  return raw.replace("GROUP_", "Grupo ");
}

function standingTeamSlot(team, groupLabel, seed) {
  if (!team) return null;
  return {
    name: teamName(team.team.name),
    rawName: team.team.name,
    group: groupLabel,
    seed,
    points: team.points ?? 0,
    gd: team.goalDifference ?? 0,
    gf: team.goalsFor ?? 0,
    position: team.position ?? seed,
  };
}

function projectedQualifiersFromStandings(data) {
  const groups = standingsGroupsFromData(data);
  if (!groups.length) return null;
  const winners = [];
  const runners = [];
  const thirds = [];

  groups.forEach((group, index) => {
    const label = groupShortName(group, index);
    const table = [...(group.table || [])].sort((a, b) => (a.position ?? 99) - (b.position ?? 99));
    const winner = standingTeamSlot(table[0], label, "1º");
    const runner = standingTeamSlot(table[1], label, "2º");
    const third = standingTeamSlot(table[2], label, "3º");
    if (winner) winners.push(winner);
    if (runner) runners.push(runner);
    if (third) thirds.push(third);
  });

  const bestThirds = thirds
    .sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf || a.name.localeCompare(b.name))
    .slice(0, Math.max(0, 32 - winners.length - runners.length))
    .map((team) => ({ ...team, seed: "3º*" }));

  const qualifiers = [...winners, ...runners, ...bestThirds].slice(0, 32);
  return {
    groups,
    winners,
    runners,
    bestThirds,
    qualifiers,
  };
}

function projectedRoundOf32Matches(projection) {
  if (!projection?.qualifiers?.length) return KNOCKOUT_ROUNDS[0].matches;
  const qualifiers = projection.qualifiers;
  const left = qualifiers.slice(0, 16);
  const right = qualifiers.slice(16, 32).reverse();
  return Array.from({ length: 16 }, (_, index) => ({
    code: `P${73 + index}`,
    home: left[index] || null,
    away: right[index] || null,
  }));
}

function applyRoundOf32Projection(projection) {
  if (!projection?.qualifiers?.length) return false;
  const projectedMatches = projectedRoundOf32Matches(projection);
  let changed = false;
  state.matches = state.matches.map((match) => {
    const projected = projectedMatches.find((item) => `wc26-${item.code.toLowerCase()}` === match.id);
    if (!projected) return match;
    const home = projected.home?.rawName || projected.home?.name || match.home;
    const away = projected.away?.rawName || projected.away?.name || match.away;
    if (home === match.home && away === match.away) return match;
    changed = true;
    return {
      ...match,
      home,
      away,
      projectedHomeSeed: projected.home?.seed || "",
      projectedAwaySeed: projected.away?.seed || "",
    };
  });
  return changed;
}

async function refreshKnockoutFixturesFromStandings() {
  if (!state.api?.tokenConfigured) return false;
  const officialApplied = await refreshKnockoutFixturesFromApi();
  if (officialApplied) return true;
  const standings = await fetchStandings();
  const projection = projectedQualifiersFromStandings(standings);
  return applyRoundOf32Projection(projection);
}

async function fetchApiMatches() {
  if (!state.api?.tokenConfigured) return [];
  const response = await fetch("/api/football-proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resource: "matches" }),
  });
  if (!response.ok) return [];
  return normalizeApiMatches(await response.json());
}

function applyOfficialKnockoutFixtures(apiMatches) {
  const officialByStage = new Map();
  apiMatches
    .filter((match) => isKnockoutMatch(match))
    .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff))
    .forEach((match) => {
      const list = officialByStage.get(match.stage) || [];
      list.push(match);
      officialByStage.set(match.stage, list);
    });

  let changed = false;
  state.matches = state.matches.map((match) => {
    const round = KNOCKOUT_ROUNDS.find((item) => item.name === match.stage);
    if (!round || !match.code) return match;
    const slotIndex = round.matches.findIndex((slot) => slot.code === match.code);
    const official = officialByStage.get(round.name)?.[slotIndex];
    if (!official) return match;
    const next = {
      ...match,
      home: official.home,
      away: official.away,
      kickoff: official.kickoff,
      venue: official.venue,
      status: official.status,
      homeScore: official.homeScore,
      awayScore: official.awayScore,
      liveMinute: official.liveMinute,
      winner: official.winner,
      decision: official.decision,
      apiMatchId: official.id,
      source: "official-api",
    };
    const changedFields = ["home", "away", "kickoff", "venue", "status", "homeScore", "awayScore", "liveMinute", "winner", "decision", "apiMatchId"]
      .some((field) => next[field] !== match[field]);
    changed ||= changedFields;
    return changedFields ? next : match;
  });
  return changed;
}

async function refreshKnockoutFixturesFromApi() {
  const apiMatches = await fetchApiMatches();
  if (!apiMatches.length) return false;
  return applyOfficialKnockoutFixtures(apiMatches);
}

function legacyKnockoutTeamMarkup(team, fallback) {
  if (!team) {
    return `
      <div class="knockout-team pending">
        <span class="knockout-team-main">${escapeHtml(fallback)}</span>
        <small>Por definir</small>
      </div>
    `;
  }
  return `
    <div class="knockout-team projected">
      <span class="knockout-team-main">
        <span class="mini-flag">${flagMarkup(team.rawName, "small")}</span>
        ${escapeHtml(team.name)}
      </span>
      <small>${escapeHtml(team.seed)} ${escapeHtml(team.group)} · ${team.points} pts</small>
    </div>
  `;
}

function isPendingKnockoutLabel(value) {
  return /clasificado|ganador|perdedor|grupo|definir/i.test(String(value || ""));
}

function knockoutTeamMarkup(team, fallback) {
  if (!team) {
    if (!isPendingKnockoutLabel(fallback)) {
      return `
        <div class="knockout-team projected">
          <span class="knockout-team-main">
            <span class="mini-flag">${flagMarkup(fallback, "small")}</span>
            ${escapeHtml(teamName(fallback))}
          </span>
          <small>Oficial FIFA</small>
        </div>
      `;
    }
    return `
      <div class="knockout-team pending">
        <span class="knockout-team-main">${escapeHtml(fallback)}</span>
        <small>Por definir</small>
      </div>
    `;
  }
  const meta = team.seed
    ? `${escapeHtml(team.seed)} ${escapeHtml(team.group)} · ${team.points} pts`
    : "Oficial FIFA";
  return `
    <div class="knockout-team projected">
      <span class="knockout-team-main">
        <span class="mini-flag">${flagMarkup(team.rawName, "small")}</span>
        ${escapeHtml(team.name)}
      </span>
      <small>${meta}</small>
    </div>
  `;
}

function knockoutRoundMatches(round, projection) {
  const officialMatches = round.matches.map((slot, index) => {
    const current = state.matches.find((match) => match.code === slot.code);
    if (!current || current.source !== "official-api") return null;
    return {
      code: slot.code,
      home: current.home,
      away: current.away,
      kickoff: current.kickoff,
      status: current.status,
      homeScore: current.homeScore,
      awayScore: current.awayScore,
    };
  });
  if (officialMatches.some(Boolean)) {
    return round.matches.map((slot, index) => officialMatches[index] || slot);
  }
  if (round.name === "Ronda de 32") return projectedRoundOf32Matches(projection);
  return round.matches;
}

async function renderKnockoutBracket() {
  const container = $("#knockoutBracket");
  if (!container) return;
  container.innerHTML = '<div class="standings-loading">Armando llaves con posiciones actuales...</div>';
  await refreshKnockoutFixturesFromApi().catch(console.error);
  const standings = await fetchStandings();
  const projection = projectedQualifiersFromStandings(standings);
  if (!state.matches.some((match) => match.source === "official-api")) {
    applyRoundOf32Projection(projection);
  }
  const qualifierCount = projection?.qualifiers.length || 0;
  const bestThirdCount = projection?.bestThirds.length || 0;
  const hasOfficialKnockouts = state.matches.some((match) => match.source === "official-api");

  container.innerHTML = `
    <div class="knockout-summary">
      <img src="assets/icons/world-cup-2026.png" alt="" />
      <div>
        <span class="eyebrow">COPA MUNDIAL 2026</span>
        <strong>Llaves de eliminacion directa</strong>
        <small>${hasOfficialKnockouts ? "Cruces oficiales cargados desde la API de partidos FIFA." : projection ? `${qualifierCount} clasificados proyectados desde Posiciones, incluyendo ${bestThirdCount} mejores terceros.` : "Activa la API de posiciones para proyectar los cruces desde la tabla actual."}</small>
      </div>
    </div>
    ${projection ? `
      <div class="knockout-qualifier-strip" aria-label="Resumen de clasificados proyectados">
        <div><strong>${projection.winners.length}</strong><span>Primeros</span></div>
        <div><strong>${projection.runners.length}</strong><span>Segundos</span></div>
        <div><strong>${projection.bestThirds.length}</strong><span>Mejores terceros</span></div>
      </div>
      <div class="knockout-qualifier-rail" aria-label="Clasificados proyectados">
        ${projection.qualifiers.map((team, index) => `
          <span class="knockout-qualifier-chip">
            <span class="knockout-seed">${index + 1}</span>
            <span class="mini-flag">${flagMarkup(team.rawName, "small")}</span>
            <strong>${escapeHtml(team.name)}</strong>
            <small>${escapeHtml(team.seed)} ${escapeHtml(team.group)}</small>
          </span>
        `).join("")}
      </div>
    ` : ""}
    <div class="knockout-note">
      <span>Proyeccion</span>
      <p>Los cruces se llenan con la tabla actual. Cuando FIFA confirme emparejamientos oficiales, esta vista queda lista para conectar esos datos.</p>
    </div>
    <div class="knockout-mobile-road" aria-label="Ruta de eliminacion directa">
      ${KNOCKOUT_ROUNDS.map((round, roundIndex) => {
        const matches = knockoutRoundMatches(round, projection);
        return `
          <section class="knockout-stage-card">
            <div class="knockout-stage-head">
              <span class="knockout-stage-number">${roundIndex + 1}</span>
              <div>
                <strong>${escapeHtml(round.name)}</strong>
                <small>${escapeHtml(round.dates)}</small>
              </div>
            </div>
            <div class="knockout-stage-matches">
              ${matches.map((match, matchIndex) => `
                <article class="knockout-match">
                  <div class="knockout-code">${escapeHtml(match.code)}</div>
                  ${knockoutTeamMarkup(match.home && typeof match.home === "object" ? match.home : null, typeof match.home === "string" ? match.home : `Clasificado ${matchIndex * 2 + 1}`)}
                  ${knockoutTeamMarkup(match.away && typeof match.away === "object" ? match.away : null, typeof match.away === "string" ? match.away : `Clasificado ${matchIndex * 2 + 2}`)}
                </article>
              `).join("")}
            </div>
            <p>${escapeHtml(round.note)}</p>
          </section>
        `;
      }).join("")}
    </div>
    <div class="knockout-desktop-board">
      <div class="knockout-poster-bg" aria-hidden="true">
        <img src="assets/icons/world-cup-2026.png" alt="" />
      </div>
      <div class="knockout-board-title">
        <span>Fase final</span>
        <strong>Camino al campeon</strong>
      </div>
      <div class="knockout-scroll" aria-label="Llaves de eliminacion directa en columnas">
        <div class="knockout-rounds">
          ${KNOCKOUT_ROUNDS.map((round, roundIndex) => {
            const matches = knockoutRoundMatches(round, projection);
            return `
            <section class="knockout-round">
              <div class="knockout-round-head">
                <strong>${escapeHtml(round.name)}</strong>
                <span>${escapeHtml(round.dates)}</span>
              </div>
              <div class="knockout-matches">
                ${matches.map((match, matchIndex) => `
                  <article class="knockout-match">
                    <div class="knockout-code">${escapeHtml(match.code)}</div>
                    ${knockoutTeamMarkup(match.home && typeof match.home === "object" ? match.home : null, typeof match.home === "string" ? match.home : `Clasificado ${matchIndex * 2 + 1}`)}
                    ${knockoutTeamMarkup(match.away && typeof match.away === "object" ? match.away : null, typeof match.away === "string" ? match.away : `Clasificado ${matchIndex * 2 + 2}`)}
                  </article>
                `).join("")}
              </div>
              <p>${escapeHtml(round.note)}</p>
            </section>`;
          }).join("")}
        </div>
      </div>
    </div>
  `;
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
  const firstDay = history[0];
  const lastDay = history.at(-1);
  const positionFor = (day, personId) => day.ranking.findIndex((item) => item.id === personId) + 1;
  const trendFor = (person) => {
    const start = positionFor(firstDay, person.id);
    const end = positionFor(lastDay, person.id);
    const delta = start - end;
    return {
      start,
      end,
      delta,
      label: delta > 0 ? `Subió ${delta}` : delta < 0 ? `Bajó ${Math.abs(delta)}` : "Igual",
      tone: delta > 0 ? "up" : delta < 0 ? "down" : "same",
    };
  };
  const leader = lastDay.ranking[0];
  const biggestClimber = state.participants
    .map((person) => ({ person, ...trendFor(person) }))
    .sort((a, b) => b.delta - a.delta || a.end - b.end)[0];

  const width = Math.max(880, resultDates.length * 118 + 130);
  const height = Math.max(430, state.participants.length * 46 + 126);
  const left = 54;
  const right = 72;
  const top = 58;
  const bottom = 78;
  const x = (index) => resultDates.length === 1
    ? width / 2
    : left + index * ((width - left - right) / (resultDates.length - 1));
  const y = (position) => state.participants.length === 1
    ? height / 2
    : top + (position - 1) * ((height - top - bottom) / (state.participants.length - 1));

  const dayBands = resultDates.map((date, index) => {
    const bandWidth = resultDates.length === 1 ? width - left - right : (width - left - right) / Math.max(1, resultDates.length - 1);
    const bandX = index === 0 ? left : x(index) - bandWidth / 2;
    const label = formatDate(`${date}T12:00:00-05:00`, { day: "numeric", month: "short" });
    return `
      <rect x="${Math.max(left, bandX)}" y="${top - 28}" width="${Math.min(bandWidth, width - right - Math.max(left, bandX))}" height="${height - top - bottom + 54}" class="chart-day-band ${index % 2 ? "alt" : ""}"/>
      <line x1="${x(index)}" y1="${top - 18}" x2="${x(index)}" y2="${height - bottom + 24}" class="chart-day-line"/>
      <text x="${x(index)}" y="${top - 32}" text-anchor="middle" class="chart-date-top">${label}</text>
      <text x="${x(index)}" y="${height - 26}" text-anchor="middle" class="chart-date">${label}</text>`;
  }).join("");

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
    const trend = trendFor(person);
    const lastLabelX = Math.min(width - 28, last.x + 22);
    const lastLabelAnchor = lastLabelX > width - 80 ? "end" : "start";
    return `<g class="chart-person-path" style="--participant-color:${participantColor(person)}">
      <path d="${path}" fill="none" stroke="${participantColor(person)}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" class="chart-path-shadow"/>
      <path d="${path}" fill="none" stroke="${participantColor(person)}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="chart-path"/>
      ${points.map((point, index) => `<g>
        <circle cx="${point.x}" cy="${point.y}" r="${index === points.length - 1 ? 6.5 : 4.4}" fill="${participantColor(person)}" stroke="#090909" stroke-width="2.2" class="chart-point"><title>${escapeHtml(displayName(person))}: puesto ${point.position}</title></circle>
        ${index === points.length - 1 ? `<text x="${lastLabelX}" y="${point.y + 4}" text-anchor="${lastLabelAnchor}" class="chart-end-label">${escapeHtml(displayName(person))} · #${point.position}</text>` : ""}
      </g>`).join("")}
      ${marker}
      <title>${escapeHtml(displayName(person))}: termina #${trend.end}. ${trend.label} desde el primer día.</title>
    </g>`;
  }).join("");

  const dayCards = history.map((day) => `
    <article class="statistics-day-card">
      <span>${formatDate(`${day.date}T12:00:00-05:00`, { day: "numeric", month: "short" })}</span>
      <div>
        ${day.ranking.slice(0, 3).map((person, index) => `
          <strong style="--participant-color:${participantColor(person)}">
            <small>#${index + 1}</small>
            ${participantAvatar(person, "statistics-day-avatar")}
            <em>${escapeHtml(displayName(person))}</em>
          </strong>`).join("")}
      </div>
    </article>`).join("");

  container.innerHTML = `
    <div class="statistics-summary">
      <article>
        <span>Días con resultados</span>
        <strong>${resultDates.length}</strong>
        <small>Jornadas comparadas</small>
      </article>
      <article>
        <span>Líder actual</span>
        <strong>${escapeHtml(displayName(leader))}</strong>
        <small>#1 con ${leader.points} pts</small>
      </article>
      <article>
        <span>Mayor subida</span>
        <strong>${escapeHtml(displayName(biggestClimber.person))}</strong>
        <small>${biggestClimber.label}</small>
      </article>
    </div>
    <div class="statistics-legend">
      ${state.participants.map((person) => `
        <div class="legend-person trend-${trendFor(person).tone}" style="--participant-color:${participantColor(person)}">
          ${participantAvatar(person, "legend-avatar")}
          <span>${escapeHtml(displayName(person))}</span>
          <small>#${trendFor(person).end} · ${trendFor(person).label}</small>
        </div>`).join("")}
    </div>
    <div class="statistics-day-rail" aria-label="Resumen día a día del top 3">
      ${dayCards}
    </div>
    <div class="history-chart-scroll">
      <svg class="history-chart" style="width:${width}px" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Evolución diaria de posiciones">
        <rect x="0" y="0" width="${width}" height="${height}" class="chart-bg"/>
        ${dayBands}
        ${state.participants.map((_, index) => `
          <line x1="${left}" y1="${y(index + 1)}" x2="${width - right}" y2="${y(index + 1)}" class="chart-grid-line"/>
          <text x="22" y="${y(index + 1) + 5}" class="chart-rank">#${index + 1}</text>`).join("")}
        <text x="${left}" y="${height - 8}" class="chart-axis-hint">Desliza para ver la evolución completa por día</text>
        ${paths}
      </svg>
    </div>
    <p class="statistics-note">Cada línea muestra cómo cambia el puesto de un participante. Arriba es mejor posición; abajo, peligro.</p>
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
    navigate("admin", { refresh: false });
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
    .sort(dayAwareSort)
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
            ${
              isKnockoutMatch(match)
                ? `<select data-admin-winner="${match.id}" aria-label="Clasificado">
                    <option value="">Clasificado</option>
                    <option value="home" ${match.winner === "home" ? "selected" : ""}>${teamName(match.home)}</option>
                    <option value="away" ${match.winner === "away" ? "selected" : ""}>${teamName(match.away)}</option>
                  </select>
                  <select data-admin-decision="${match.id}" aria-label="Definición">
                    <option value="">Definición</option>
                    ${Object.entries(DECISION_METHODS).map(([value, label]) => `<option value="${value}" ${match.decision === value ? "selected" : ""}>${label}</option>`).join("")}
                  </select>`
                : ""
            }
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
      const winner = $(`[data-admin-winner="${id}"]`)?.value || "";
      const decision = $(`[data-admin-decision="${id}"]`)?.value || "";
      match.homeScore = homeValue === "" ? null : Number(homeValue);
      match.awayScore = awayValue === "" ? null : Number(awayValue);
      match.status = status;
      match.winner = winner || null;
      match.decision = decision || null;
      if (status === "FINISHED" && (match.homeScore == null || match.awayScore == null)) {
        showToast("Ingresa ambos marcadores para finalizar.");
        return;
      }
      if (status === "FINISHED" && isKnockoutMatch(match) && (!winner || !decision)) {
        showToast("En eliminatoria define clasificado y método.");
        return;
      }
      try {
        await apiRequest(`/api/results/${encodeURIComponent(id)}`, {
          method: "PUT",
          body: JSON.stringify({
            homeScore: match.homeScore,
            awayScore: match.awayScore,
            status: match.status,
            winner: match.winner,
            decision: match.decision,
          }),
        });
        saveState();
        renderAll();
        navigate("admin", { refresh: false });
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
    pendingNames.length ? pendingNames.join(" · ") : "Todos ya completaron sus pronósticos.",
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
    const homeScore = match.score?.fullTime?.home ?? match.intHomeScore ?? match.homeScore ?? null;
    const awayScore = match.score?.fullTime?.away ?? match.intAwayScore ?? match.awayScore ?? null;
    const status = normalizeApiStatus(match, { kickoff, homeScore, awayScore });
    const liveMinute = extractLiveMinute(match, { kickoff, status });
    const winner = normalizeApiWinner(match, { homeScore, awayScore, status });
    const decision = normalizeApiDecision(match);
    return {
      id: String(match.id || match.idEvent || `api-${index}-${kickoff}`),
      stage: normalizeApiStage(match.group || match.stage || match.strGroup || "Mundial 2026"),
      home,
      away,
      kickoff,
      venue: match.venue || match.strVenue || "Por confirmar",
      status,
      homeScore: homeScore == null ? null : Number(homeScore),
      awayScore: awayScore == null ? null : Number(awayScore),
      liveMinute,
      winner,
      decision,
    };
  }).filter((match) => match.home && match.away && match.kickoff);
}

function normalizeApiStage(stage) {
  const raw = String(stage || "").trim();
  const key = raw.toUpperCase().replace(/[\s-]+/g, "_");
  const stageMap = {
    LAST_32: "Ronda de 32",
    ROUND_OF_32: "Ronda de 32",
    ROUND_32: "Ronda de 32",
    LAST_16: "Octavos de final",
    ROUND_OF_16: "Octavos de final",
    ROUND_16: "Octavos de final",
    QUARTER_FINALS: "Cuartos de final",
    QUARTERFINAL: "Cuartos de final",
    QUARTER_FINAL: "Cuartos de final",
    SEMI_FINALS: "Semifinales",
    SEMIFINALS: "Semifinales",
    SEMI_FINAL: "Semifinales",
    THIRD_PLACE: "Tercer puesto",
    THIRD_PLACE_PLAYOFF: "Tercer puesto",
    FINAL: "Final",
  };
  return stageMap[key] || raw.replace("GROUP_", "Grupo ");
}

function normalizeApiWinner(match, { homeScore, awayScore, status }) {
  const rawWinner = String(match.score?.winner || match.winner || match.fixture?.winner || "").toUpperCase();
  if (rawWinner.includes("HOME")) return "home";
  if (rawWinner.includes("AWAY")) return "away";
  if (status === "FINISHED" && homeScore != null && awayScore != null && homeScore !== awayScore) {
    return Number(homeScore) > Number(awayScore) ? "home" : "away";
  }
  return null;
}

function normalizeApiDecision(match) {
  const raw = String(
    match.score?.duration ||
    match.duration ||
    match.status?.long ||
    match.status?.short ||
    match.status ||
    "",
  ).toUpperCase().replace(/[\s-]+/g, "_");
  if (raw.includes("PENAL")) return "PENALTIES";
  if (raw.includes("EXTRA") || raw === "AET" || raw === "ET") return "EXTRA_TIME";
  if (raw.includes("REGULAR") || raw === "FT" || raw === "FINISHED") return "REGULAR";
  return null;
}

function normalizeApiStatus(match, { kickoff, homeScore, awayScore }) {
  const rawStatus = String(
    match.status?.short ||
    match.status?.long ||
    match.fixture?.status?.short ||
    match.fixture?.status?.long ||
    match.strStatus ||
    match.status ||
    "",
  ).trim();
  const key = rawStatus.toUpperCase().replace(/[\s-]+/g, "_");
  const statusMap = {
    TIMED: "SCHEDULED",
    SCHEDULED: "SCHEDULED",
    NOT_STARTED: "SCHEDULED",
    NS: "SCHEDULED",
    TBD: "SCHEDULED",
    LIVE: "IN_PLAY",
    INPLAY: "IN_PLAY",
    IN_PLAY: "IN_PLAY",
    PLAYING: "IN_PLAY",
    FIRST_HALF: "IN_PLAY",
    SECOND_HALF: "IN_PLAY",
    "1H": "IN_PLAY",
    "2H": "IN_PLAY",
    H1: "IN_PLAY",
    H2: "IN_PLAY",
    ET: "IN_PLAY",
    EXTRA_TIME: "IN_PLAY",
    PENALTY_SHOOTOUT: "IN_PLAY",
    PEN_LIVE: "IN_PLAY",
    PAUSED: "PAUSED",
    HALF_TIME: "PAUSED",
    HALFTIME: "PAUSED",
    HT: "PAUSED",
    BREAK: "PAUSED",
    BREAK_TIME: "PAUSED",
    FINISHED: "FINISHED",
    MATCH_FINISHED: "FINISHED",
    FT: "FINISHED",
    AET: "FINISHED",
    PEN: "FINISHED",
    AWARDED: "FINISHED",
    SUSPENDED: "SCHEDULED",
    POSTPONED: "SCHEDULED",
    CANCELLED: "SCHEDULED",
  };
  if (statusMap[key]) return statusMap[key];

  const hasScore = homeScore != null && awayScore != null;
  const kickoffDate = new Date(kickoff);
  if (hasScore && !Number.isNaN(kickoffDate.getTime())) {
    const now = new Date();
    const twoHoursAfterKickoff = new Date(kickoffDate.getTime() + 2 * 60 * 60_000);
    if (now >= kickoffDate && now < twoHoursAfterKickoff) return "IN_PLAY";
  }
  return hasScore ? "FINISHED" : "SCHEDULED";
}

function extractLiveMinute(match, { kickoff, status }) {
  const candidates = [
    match.minute,
    match.elapsed,
    match.time?.elapsed,
    match.status?.elapsed,
    match.fixture?.status?.elapsed,
    match.liveMinute,
  ];
  const value = candidates.map(Number).find((candidate) => Number.isFinite(candidate) && candidate >= 0);
  if (value != null) return Math.floor(value);
  if (status !== "IN_PLAY") return null;
  const kickoffDate = new Date(kickoff);
  if (Number.isNaN(kickoffDate.getTime())) return null;
  const elapsed = Math.floor((Date.now() - kickoffDate.getTime()) / 60_000);
  return elapsed >= 0 && elapsed <= 130 ? elapsed : null;
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
  const liveMinuteChanged = existingMatch.liveMinute !== apiMatch.liveMinute;
  const winnerChanged = apiMatch.winner != null && existingMatch.winner !== apiMatch.winner;
  const decisionChanged = apiMatch.decision != null && existingMatch.decision !== apiMatch.decision;

  if (!statusChanged && !scoresChanged && !kickoffChanged && !liveMinuteChanged && !winnerChanged && !decisionChanged) return false;

  existingMatch.status = apiMatch.status;
  if (hasValidScores) {
    existingMatch.homeScore = apiMatch.homeScore;
    existingMatch.awayScore = apiMatch.awayScore;
  }
  if (apiMatch.kickoff) existingMatch.kickoff = apiMatch.kickoff;
  existingMatch.liveMinute = ["IN_PLAY", "PAUSED"].includes(apiMatch.status) ? apiMatch.liveMinute : null;
  existingMatch.winner = apiMatch.winner || existingMatch.winner || null;
  existingMatch.decision = apiMatch.decision || existingMatch.decision || null;
  return true;
}

async function persistSyncedResult(match) {
  if (!isAdmin()) return;
  try {
    await apiRequest(`/api/results/${encodeURIComponent(match.id)}`, {
      method: "PUT",
      body: JSON.stringify({
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        status: match.status,
        winner: match.winner,
        decision: match.decision,
      }),
    });
  } catch (error) {
    console.error("No fue posible persistir resultado sincronizado", match.id, error);
  }
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
    const changedMatches = [];
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
        if (updateMatchFromApi(existingMatch, apiMatch)) {
          updatedCount++;
          changedMatches.push(existingMatch);
        }
      }
    });
    
    await Promise.all(changedMatches.map(persistSyncedResult));
    saveState();
    renderAll();
    navigate("admin", { refresh: false });
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
    const changedMatches = [];
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
          changedMatches.push(existingMatch);
        }
      } else {
        console.log("silentSync: partido no encontrado localmente", apiMatch.home, "vs", apiMatch.away);
      }
    });
    
    console.log("silentSync: cambios detectados:", changed);
    if (changed) {
      await Promise.all(changedMatches.map(persistSyncedResult));
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
    "🏆 *Ranking*",
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
  renderKnockoutBracket();
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
        navigate("inicio", { refresh: false });
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
  if (["inicio", "partidos", "pronosticos", "ranking", "estadisticas", "grupos", "llaves", "admin"].includes(view)) navigate(view);
});

async function initializeApp() {
  await loadBroadcastSchedule();
  const authenticated = await restoreSession();
  if (authenticated) await refreshKnockoutFixturesFromStandings().catch(console.error);
  if (authenticated && isAdmin()) {
    await loadAdminUsers().catch(console.error);
  }
  renderAll();
  const initialView = window.location.hash.slice(1);
  if (["inicio", "partidos", "pronosticos", "ranking", "estadisticas", "grupos", "llaves", "admin"].includes(initialView)) {
    navigate(initialView, { refresh: false });
  } else {
    navigate("ranking", { refresh: false });
  }
  if (!authenticated) setTimeout(() => $("#authDialog").showModal(), 300);
  
  // Sync inicial si hay partidos en ventana viva: desde kickoff hasta 2 horas despues.
  if (state.api.tokenConfigured && liveSyncWindowMatches().length) {
    setTimeout(() => autoSyncLiveMatches("inicio"), 2000);
  }
}

initializeApp();

// Auto-refresh cada minuto
setInterval(() => {
  renderHome();
  // Siempre actualizar ranking si está visible
  if ($("#ranking").classList.contains("active-view")) renderRanking();
}, 60_000);

// Auto-sync con API cada 10 minutos durante la ventana viva de cada partido:
// desde la hora de inicio hasta 2 horas despues.
setInterval(() => {
  autoSyncLiveMatches("cada 10 minutos");
}, 600_000);
