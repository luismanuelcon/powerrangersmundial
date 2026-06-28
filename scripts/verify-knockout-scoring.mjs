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

const KNOCKOUT_STAGES = new Set([
  ...Object.keys(KNOCKOUT_PHASE_BONUS),
  "Tercer puesto",
]);

function outcome(home, away) {
  if (home === away) return "DRAW";
  return home > away ? "HOME" : "AWAY";
}

function isKnockoutMatch(match) {
  return KNOCKOUT_STAGES.has(String(match.stage || "").trim());
}

function matchWinnerSide(match) {
  if (match.winner === "home" || match.winner === "away") return match.winner;
  if (match.homeScore == null || match.awayScore == null || match.homeScore === match.awayScore) return null;
  return match.homeScore > match.awayScore ? "home" : "away";
}

function scorePrediction(prediction, match) {
  const empty = { applies: false, exact: 0, correct: 0, points: 0, details: [] };
  if (!prediction || prediction.automatic) return empty;
  const validStatuses = isKnockoutMatch(match) ? ["FINISHED"] : ["FINISHED", "IN_PLAY", "PAUSED"];
  if (!validStatuses.includes(match.status) || match.homeScore == null || match.awayScore == null) {
    return { ...empty, applies: true };
  }

  const details = [];
  const exactScore = prediction.home === match.homeScore && prediction.away === match.awayScore;
  const resultCorrect = outcome(prediction.home, prediction.away) === outcome(match.homeScore, match.awayScore);
  let exact = 0;
  let correct = 0;
  let points = 0;

  if (!isKnockoutMatch(match)) {
    if (exactScore) return { applies: true, exact: 1, correct: 0, points: 2, details: ["+2 exacto"] };
    if (resultCorrect) return { applies: true, exact: 0, correct: 1, points: 1, details: ["+1 resultado"] };
    return { applies: true, exact: 0, correct: 0, points: 0, details };
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

  const qualifierCorrect = prediction.qualifier === matchWinnerSide(match);
  if (qualifierCorrect) {
    const bonus = KNOCKOUT_PHASE_BONUS[match.stage] || 0;
    points += 4 + bonus;
    details.push(`+4 clasificado${bonus ? ` +${bonus} fase` : ""}`);
  }

  if (match.decision && prediction.decision === match.decision) {
    points += 2;
    details.push("+2 definicion");
  }

  if (exactScore && qualifierCorrect && prediction.decision === match.decision) {
    points += 3;
    details.push("+3 perfecto");
  }

  return { applies: true, exact, correct, points, details };
}

const finalByPenalties = {
  stage: "Final",
  status: "FINISHED",
  homeScore: 1,
  awayScore: 1,
  winner: "away",
  decision: "PENALTIES",
};

const cases = [
  {
    name: "empate exacto + clasificado + penales + bono final + perfecto",
    actual: scorePrediction({ home: 1, away: 1, qualifier: "away", decision: "PENALTIES" }, finalByPenalties).points,
    expected: 19,
  },
  {
    name: "resultado 90 correcto sin exacto + clasificado",
    actual: scorePrediction({ home: 2, away: 2, qualifier: "away", decision: "REGULAR" }, finalByPenalties).points,
    expected: 12,
  },
  {
    name: "sin pronostico no suma",
    actual: scorePrediction(null, finalByPenalties).points,
    expected: 0,
  },
  {
    name: "grupo conserva regla 2/1",
    actual: scorePrediction({ home: 2, away: 0 }, { stage: "Grupo A", status: "FINISHED", homeScore: 1, awayScore: 0 }).points,
    expected: 1,
  },
  {
    name: "stage generico conserva regla actual 2/1",
    actual: scorePrediction({ home: 2, away: 0 }, { stage: "Mundial 2026", status: "FINISHED", homeScore: 1, awayScore: 0 }).points,
    expected: 1,
  },
];

for (const testCase of cases) {
  if (testCase.actual !== testCase.expected) {
    throw new Error(`${testCase.name}: esperado ${testCase.expected}, recibido ${testCase.actual}`);
  }
  console.log(`OK ${testCase.name}: ${testCase.actual}`);
}

console.log(`Metodos validados: ${Object.values(DECISION_METHODS).join(", ")}`);
