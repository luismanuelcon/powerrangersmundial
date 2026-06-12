import { readFileSync } from "node:fs";
import vm from "node:vm";
import { pool } from "../lib/db.mjs";
import { encrypt, lookupHash } from "../lib/security.mjs";

const secret = process.env.SESSION_SECRET;
if (!secret) throw new Error("SESSION_SECRET no está configurada");

const context = { window: {} };
vm.runInNewContext(readFileSync("users.local.js", "utf8"), context);
const participants = context.window.PRIVATE_PARTICIPANTS || [];

if (!participants.length) {
  throw new Error("No hay participantes en users.local.js");
}

let inserted = 0;
const client = await pool.connect();
try {
  await client.query("begin");
  for (const person of participants) {
    const phone = String(person.phone || "").replace(/\D/g, "");
    const document = String(person.document || "").replace(/\D/g, "");
    if (!/^\d{10}$/.test(phone) || !/^\d{6,10}$/.test(document)) {
      throw new Error(`Credenciales inválidas para ${person.id}`);
    }

    const result = await client.query(
      `
        insert into prm_users (
          id, name, nickname, phone_hash, phone_cipher,
          document_hash, document_cipher, role
        ) values ($1,$2,$3,$4,$5,$6,$7,$8)
        on conflict (id) do nothing
      `,
      [
        person.id,
        person.name,
        person.nickname,
        lookupHash(phone, secret),
        encrypt(phone, secret),
        lookupHash(document, secret),
        encrypt(document, secret),
        person.role,
      ],
    );
    inserted += result.rowCount;
  }

  await client.query("commit");
  console.log(`Carga inicial completa: ${inserted} usuarios nuevos; existentes sin cambios.`);
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  client.release();
  await pool.end();
}
