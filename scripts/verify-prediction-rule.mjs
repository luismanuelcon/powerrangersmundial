function outcome(home, away) {
  if (home === away) return "DRAW";
  return home > away ? "HOME" : "AWAY";
}

function scorePrediction(prediction, result) {
  if (!prediction || prediction.automatic) {
    return { applies: false, exact: 0, correct: 0, points: 0 };
  }
  if (prediction.home === result.home && prediction.away === result.away) {
    return { applies: true, exact: 1, correct: 0, points: 2 };
  }
  if (outcome(prediction.home, prediction.away) === outcome(result.home, result.away)) {
    return { applies: true, exact: 0, correct: 1, points: 1 };
  }
  return { applies: true, exact: 0, correct: 0, points: 0 };
}

const cases = [
  {
    name: "sin registro",
    actual: scorePrediction(null, { home: 0, away: 0 }),
    expected: { applies: false, exact: 0, correct: 0, points: 0 },
  },
  {
    name: "automático heredado",
    actual: scorePrediction({ home: 0, away: 0, automatic: true }, { home: 0, away: 0 }),
    expected: { applies: false, exact: 0, correct: 0, points: 0 },
  },
  {
    name: "0-0 manual",
    actual: scorePrediction({ home: 0, away: 0, automatic: false }, { home: 0, away: 0 }),
    expected: { applies: true, exact: 1, correct: 0, points: 2 },
  },
];

for (const testCase of cases) {
  const actual = JSON.stringify(testCase.actual);
  const expected = JSON.stringify(testCase.expected);
  if (actual !== expected) {
    throw new Error(`${testCase.name}: esperado ${expected}, recibido ${actual}`);
  }
  console.log(`OK ${testCase.name}: ${actual}`);
}
