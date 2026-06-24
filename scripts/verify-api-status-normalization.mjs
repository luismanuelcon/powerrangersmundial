function normalizeApiStatus(match, { kickoff, homeScore, awayScore, now = new Date() }) {
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
    LIVE: "IN_PLAY",
    INPLAY: "IN_PLAY",
    IN_PLAY: "IN_PLAY",
    PLAYING: "IN_PLAY",
    FIRST_HALF: "IN_PLAY",
    SECOND_HALF: "IN_PLAY",
    "1H": "IN_PLAY",
    "2H": "IN_PLAY",
    HT: "PAUSED",
    HALF_TIME: "PAUSED",
    FT: "FINISHED",
    FINISHED: "FINISHED",
    MATCH_FINISHED: "FINISHED",
  };
  if (statusMap[key]) return statusMap[key];

  const hasScore = homeScore != null && awayScore != null;
  const kickoffDate = new Date(kickoff);
  if (hasScore && !Number.isNaN(kickoffDate.getTime())) {
    const twoHoursAfterKickoff = new Date(kickoffDate.getTime() + 2 * 60 * 60_000);
    if (now >= kickoffDate && now < twoHoursAfterKickoff) return "IN_PLAY";
  }
  return hasScore ? "FINISHED" : "SCHEDULED";
}

const kickoff = "2026-06-24T19:00:00.000Z";
const now = new Date("2026-06-24T20:00:00.000Z");
const cases = [
  ["LIVE string", { status: "LIVE" }, "IN_PLAY"],
  ["1H short", { status: { short: "1H" } }, "IN_PLAY"],
  ["half time", { fixture: { status: { short: "HT" } } }, "PAUSED"],
  ["full time", { strStatus: "FT" }, "FINISHED"],
  ["unknown with score in live window", { status: "Started" }, "IN_PLAY", 0, 2],
  ["scheduled no score", { status: "TIMED" }, "SCHEDULED"],
];

for (const [label, match, expected, homeScore = null, awayScore = null] of cases) {
  const actual = normalizeApiStatus(match, { kickoff, homeScore, awayScore, now });
  if (actual !== expected) throw new Error(`${label}: esperado ${expected}, recibido ${actual}`);
  console.log(`OK ${label}: ${actual}`);
}
