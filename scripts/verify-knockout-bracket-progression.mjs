const state = {
  matches: [
    { code: "P73", home: "Mexico", away: "Belgium", status: "FINISHED", homeScore: 2, awayScore: 0 },
    { code: "P74", home: "Canada", away: "Cape Verde", status: "FINISHED", homeScore: 1, awayScore: 2 },
    { code: "P101", home: "Brazil", away: "France", status: "FINISHED", homeScore: 1, awayScore: 1, winner: "away" },
    { code: "P102", home: "Argentina", away: "Spain", status: "FINISHED", homeScore: 3, awayScore: 2 },
  ],
};

function matchWinnerSide(match) {
  if (match.winner === "home" || match.winner === "away") return match.winner;
  if (match.homeScore == null || match.awayScore == null || match.homeScore === match.awayScore) return null;
  return match.homeScore > match.awayScore ? "home" : "away";
}

function sourceCodeFromLabel(value) {
  const raw = String(value || "");
  const semifinal = raw.match(/semifinal\s*(\d+)/i);
  if (semifinal) return semifinal[1] === "1" ? "P101" : "P102";
  const match = raw.match(/P\d+/i);
  return match ? match[0].toUpperCase() : "";
}

function knockoutWinnerName(match) {
  if (!match || match.status !== "FINISHED") return "";
  const winner = matchWinnerSide(match);
  if (winner === "home") return match.home;
  if (winner === "away") return match.away;
  return "";
}

function knockoutLoserName(match) {
  if (!match || match.status !== "FINISHED") return "";
  const winner = matchWinnerSide(match);
  if (winner === "home") return match.away;
  if (winner === "away") return match.home;
  return "";
}

function knockoutTeamFromSourceLabel(label) {
  const code = sourceCodeFromLabel(label);
  if (!code) return "";
  const sourceMatch = state.matches.find((match) => String(match.code).toUpperCase() === code);
  const wantsLoser = /perdedor/i.test(String(label || ""));
  return (wantsLoser ? knockoutLoserName(sourceMatch) : knockoutWinnerName(sourceMatch)) || label;
}

function resolveKnockoutSlotValue(value) {
  if (value && typeof value === "object") return value;
  if (!sourceCodeFromLabel(value)) return value;
  return knockoutTeamFromSourceLabel(value);
}

const cases = [
  ["Ganador P73", "Mexico"],
  ["Ganador P74", "Cape Verde"],
  ["Ganador semifinal 1", "France"],
  ["Perdedor semifinal 1", "Brazil"],
  ["Ganador semifinal 2", "Argentina"],
];

for (const [label, expected] of cases) {
  const actual = resolveKnockoutSlotValue(label);
  if (actual !== expected) {
    throw new Error(`${label}: esperado ${expected}, recibido ${actual}`);
  }
  console.log(`OK ${label} -> ${actual}`);
}
