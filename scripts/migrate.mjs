import { pool } from "../lib/db.mjs";

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
      qualifier text check (qualifier in ('home', 'away')),
      decision text check (decision in ('REGULAR', 'EXTRA_TIME', 'PENALTIES')),
      automatic boolean not null default false,
      saved_at timestamptz not null default now(),
      primary key (user_id, match_id)
    );

    create table if not exists prm_match_results (
      match_id text primary key,
      home_score integer,
      away_score integer,
      status text not null default 'SCHEDULED',
      winner text check (winner in ('home', 'away')),
      decision text check (decision in ('REGULAR', 'EXTRA_TIME', 'PENALTIES')),
      updated_at timestamptz not null default now()
    );

    create table if not exists prm_settings (
      key text primary key,
      value_cipher text not null,
      updated_at timestamptz not null default now()
    );

    create index if not exists prm_sessions_user_id_idx on prm_sessions(user_id);
    create index if not exists prm_sessions_expires_at_idx on prm_sessions(expires_at);
  `);
  await client.query(`
    alter table prm_predictions
      add column if not exists qualifier text check (qualifier in ('home', 'away')),
      add column if not exists decision text check (decision in ('REGULAR', 'EXTRA_TIME', 'PENALTIES'));

    alter table prm_match_results
      add column if not exists winner text check (winner in ('home', 'away')),
      add column if not exists decision text check (decision in ('REGULAR', 'EXTRA_TIME', 'PENALTIES'));
  `);
  const deletedAutomatic = await client.query(
    "delete from prm_predictions where automatic = true",
  );

  await client.query("commit");
  console.log(
    `Migración completa. Se eliminaron ${deletedAutomatic.rowCount} pronósticos automáticos.`,
  );
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  client.release();
  await pool.end();
}
