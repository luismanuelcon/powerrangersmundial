function normalizeApiMainScore(match) {
  const duration = String(match.score?.duration || match.duration || "").toUpperCase();
  const regular = match.score?.regularTime;
  const extra = match.score?.extraTime;
  if (duration.includes("PENAL") && regular?.home != null && regular?.away != null) {
    return {
      home: Number(regular.home) + Number(extra?.home || 0),
      away: Number(regular.away) + Number(extra?.away || 0),
    };
  }
  return {
    home: match.score?.fullTime?.home ?? match.intHomeScore ?? match.homeScore ?? null,
    away: match.score?.fullTime?.away ?? match.intAwayScore ?? match.awayScore ?? null,
  };
}

function normalizeApiDecision(match) {
  const raw = String(match.score?.duration || match.duration || match.status || "")
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  if (raw.includes("PENAL")) return "PENALTIES";
  if (raw.includes("EXTRA") || raw === "AET" || raw === "ET") return "EXTRA_TIME";
  if (raw.includes("REGULAR") || raw === "FT" || raw === "FINISHED") return "REGULAR";
  return null;
}

function normalizeApiWinner(match, { homeScore, awayScore, status }) {
  const rawWinner = String(match.score?.winner || match.winner || "").toUpperCase();
  if (rawWinner.includes("HOME")) return "home";
  if (rawWinner.includes("AWAY")) return "away";
  if (normalizeApiDecision(match) === "PENALTIES") {
    const penaltyHome = match.score?.penalties?.home;
    const penaltyAway = match.score?.penalties?.away;
    if (penaltyHome != null && penaltyAway != null && penaltyHome !== penaltyAway) {
      return Number(penaltyHome) > Number(penaltyAway) ? "home" : "away";
    }
    const fullHome = match.score?.fullTime?.home;
    const fullAway = match.score?.fullTime?.away;
    if (fullHome != null && fullAway != null && fullHome !== fullAway) {
      return Number(fullHome) > Number(fullAway) ? "home" : "away";
    }
  }
  if (status === "FINISHED" && homeScore != null && awayScore != null && homeScore !== awayScore) {
    return Number(homeScore) > Number(awayScore) ? "home" : "away";
  }
  return null;
}

const germanyParaguay = {
  status: "FINISHED",
  score: {
    duration: "PENALTY_SHOOTOUT",
    fullTime: { home: 4, away: 5 },
    regularTime: { home: 1, away: 1 },
    extraTime: { home: 0, away: 0 },
    penalties: { home: 4, away: 4 },
  },
};

const score = normalizeApiMainScore(germanyParaguay);
const winner = normalizeApiWinner(germanyParaguay, {
  homeScore: score.home,
  awayScore: score.away,
  status: "FINISHED",
});
const decision = normalizeApiDecision(germanyParaguay);

const expected = { home: 1, away: 1, winner: "away", decision: "PENALTIES" };
const actual = { ...score, winner, decision };

if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  throw new Error(`Penales mal normalizado: ${JSON.stringify(actual)} esperado ${JSON.stringify(expected)}`);
}

console.log(`OK penales: marcador ${actual.home}-${actual.away}, ganador ${actual.winner}, decision ${actual.decision}`);
