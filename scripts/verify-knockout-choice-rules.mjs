const DECISION_METHODS = {
  REGULAR: "90 minutos",
  EXTRA_TIME: "Tiempo extra",
  PENALTIES: "Penales",
};

function predictedOutcomeSide(home, away) {
  if (home == null || away == null || home === "" || away === "") return "";
  const homeScore = Number(home);
  const awayScore = Number(away);
  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return "";
  if (homeScore > awayScore) return "home";
  if (awayScore > homeScore) return "away";
  return "draw";
}

function allowedQualifierOptions(prediction) {
  const side = predictedOutcomeSide(prediction?.home, prediction?.away);
  if (side === "home" || side === "away") return [side];
  return ["home", "away"];
}

function allowedDecisionOptions(prediction) {
  const side = predictedOutcomeSide(prediction?.home, prediction?.away);
  if (side === "home" || side === "away") return ["REGULAR", "EXTRA_TIME"];
  if (side === "draw") return ["PENALTIES"];
  return Object.keys(DECISION_METHODS);
}

const cases = [
  {
    name: "marcador local ganador limita clasificado y definicion",
    qualifier: allowedQualifierOptions({ home: 2, away: 0 }),
    decision: allowedDecisionOptions({ home: 2, away: 0 }),
    expectedQualifier: ["home"],
    expectedDecision: ["REGULAR", "EXTRA_TIME"],
  },
  {
    name: "marcador visitante ganador limita clasificado y definicion",
    qualifier: allowedQualifierOptions({ home: 0, away: 2 }),
    decision: allowedDecisionOptions({ home: 0, away: 2 }),
    expectedQualifier: ["away"],
    expectedDecision: ["REGULAR", "EXTRA_TIME"],
  },
  {
    name: "marcador empatado solo permite penales",
    qualifier: allowedQualifierOptions({ home: 1, away: 1 }),
    decision: allowedDecisionOptions({ home: 1, away: 1 }),
    expectedQualifier: ["home", "away"],
    expectedDecision: ["PENALTIES"],
  },
];

for (const testCase of cases) {
  if (JSON.stringify(testCase.qualifier) !== JSON.stringify(testCase.expectedQualifier)) {
    throw new Error(`${testCase.name}: clasificado ${JSON.stringify(testCase.qualifier)} esperado ${JSON.stringify(testCase.expectedQualifier)}`);
  }
  if (JSON.stringify(testCase.decision) !== JSON.stringify(testCase.expectedDecision)) {
    throw new Error(`${testCase.name}: definicion ${JSON.stringify(testCase.decision)} esperado ${JSON.stringify(testCase.expectedDecision)}`);
  }
  console.log(`OK ${testCase.name}`);
}
