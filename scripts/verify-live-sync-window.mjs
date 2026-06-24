const APP_TIME_ZONE = "America/Bogota";

function isMatchInLiveSyncWindow(match, now = new Date()) {
  if (match.status === "FINISHED") return false;
  const kickoff = new Date(match.kickoff);
  if (Number.isNaN(kickoff.getTime())) return false;
  const syncWindowEnds = new Date(kickoff.getTime() + 2 * 60 * 60_000);
  return now >= kickoff && now < syncWindowEnds;
}

const match = {
  kickoff: "2026-06-24T19:00:00.000Z", // 2:00 p. m. America/Bogota
  status: "SCHEDULED",
};

const cases = [
  ["antes del inicio", "2026-06-24T18:59:59.000Z", false],
  ["en el inicio", "2026-06-24T19:00:00.000Z", true],
  ["durante el partido", "2026-06-24T20:10:00.000Z", true],
  ["ultimo minuto de ventana", "2026-06-24T20:59:59.000Z", true],
  ["fin de ventana", "2026-06-24T21:00:00.000Z", false],
  ["finalizado no sincroniza", "2026-06-24T20:00:00.000Z", false, "FINISHED"],
];

for (const [label, now, expected, status = "SCHEDULED"] of cases) {
  const actual = isMatchInLiveSyncWindow({ ...match, status }, new Date(now));
  if (actual !== expected) {
    throw new Error(`${label}: esperado ${expected}, recibido ${actual}`);
  }
  console.log(`OK ${label}: ${actual}`);
}

console.log(`Ventana validada en zona ${APP_TIME_ZONE}: inicio incluido, fin excluido.`);
