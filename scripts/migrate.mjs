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

const client = await pool.connect();
try {
  await client.query("begin");
  await client.query(`
    create table if not exists prm_users (
      id text primary key,
      name text not null,
      nickname text not null,
      phone_hash text not null unique,
      phone_cipher text not null,
      document_hash text not null unique,
      document_cipher text not null,
      role text not null check (role in ('Administrador', 'Participante')),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists prm_sessions (
      token_hash text primary key,
      user_id text not null references prm_users(id) on delete cascade,
      expires_at timestamptz not null,
      created_at timestamptz not null default now()
    );

    create table if not exists prm_predictions (
      user_id text not null references prm_users(id) on delete cascade,
      match_id text not null,
      home_score integer not null check (home_score between 0 and 20),
      away_score integer not null check (away_score between 0 and 20),
      automatic boolean not null default false,
      saved_at timestamptz not null default now(),
      primary key (user_id, match_id)
    );

    create table if not exists prm_match_results (
      match_id text primary key,
      home_score integer,
      away_score integer,
      status text not null default 'SCHEDULED',
      updated_at timestamptz not null default now()
    );

    create index if not exists prm_sessions_user_id_idx on prm_sessions(user_id);
    create index if not exists prm_sessions_expires_at_idx on prm_sessions(expires_at);
  `);

  for (const person of participants) {
    const phone = String(person.phone || "").replace(/\D/g, "");
    const document = String(person.document || "").replace(/\D/g, "");
    if (!/^\d{10}$/.test(phone) || !/^\d{6,10}$/.test(document)) {
      throw new Error(`Credenciales inválidas para ${person.id}`);
    }

    await client.query(
      `
        insert into prm_users (
          id, name, nickname, phone_hash, phone_cipher,
          document_hash, document_cipher, role
        ) values ($1,$2,$3,$4,$5,$6,$7,$8)
        on conflict (id) do update set
          name = excluded.name,
          nickname = excluded.nickname,
          phone_hash = excluded.phone_hash,
          phone_cipher = excluded.phone_cipher,
          document_hash = excluded.document_hash,
          document_cipher = excluded.document_cipher,
          role = excluded.role,
          updated_at = now()
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
  }

  await client.query("commit");
  console.log(`Migración completa: ${participants.length} usuarios protegidos.`);
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  client.release();
  await pool.end();
}
