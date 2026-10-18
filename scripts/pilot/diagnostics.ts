import { Pool } from "pg";
import { createTransport } from "nodemailer";
export type MigrationExpectation = { name: string; checksum: string };
export function compareMigrations(expected: MigrationExpectation[], rows: Array<{ migration_name: string; checksum: string; finished_at: Date | null }>) {
  const wanted = new Map(expected.map(row => [row.name, row.checksum])), finished = rows.filter(row => row.finished_at), applied = new Map(finished.map(row => [row.migration_name, row.checksum]));
  const pendingCount = expected.filter(row => !applied.has(row.name)).length;
  const changedCount = expected.filter(row => applied.has(row.name) && applied.get(row.name) !== row.checksum).length;
  const unexpectedCount = finished.filter(row => !wanted.has(row.migration_name)).length;
  const unfinishedCount = rows.length - finished.length, duplicateCount = finished.length - applied.size;
  return { ready: pendingCount === 0 && changedCount === 0 && unexpectedCount === 0 && unfinishedCount === 0 && duplicateCount === 0, pendingCount, changedCount, unexpectedCount, unfinishedCount, duplicateCount };
}
export async function inspectPilotDatabase(connectionString: string, expected: MigrationExpectation[]) {
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 4000, query_timeout: 4000, statement_timeout: 3000 });
  pool.on("error", () => {});
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN READ ONLY");
      const transport = await client.query<{ ssl: boolean }>("SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()");
      const extension = await client.query<{ present: boolean }>("SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'btree_gist') AS present");
      const table = await client.query<{ present: boolean }>("SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS present");
      if (!table.rows[0]?.present) { await client.query("ROLLBACK"); return { ready: false, code: "MIGRATIONS_MISSING", tlsActive: transport.rows[0]?.ssl === true, extensionReady: extension.rows[0]?.present === true }; }
      const rows = await client.query<{ migration_name: string; checksum: string; finished_at: Date | null }>('SELECT migration_name, checksum, finished_at FROM public."_prisma_migrations" WHERE rolled_back_at IS NULL');
      const migrations = compareMigrations(expected, rows.rows);
      const admin = migrations.ready ? await client.query<{ present: boolean }>('SELECT EXISTS (SELECT 1 FROM public."User" WHERE "platformRole" = \'SUPER_ADMIN\' AND active = true) AS present') : null;
      await client.query("ROLLBACK");
      const tlsActive = transport.rows[0]?.ssl === true, extensionReady = extension.rows[0]?.present === true, adminReady = admin?.rows[0]?.present === true;
      return { ready: tlsActive && extensionReady && migrations.ready && adminReady, code: "DATABASE_INSPECTED", tlsActive, extensionReady, migrations, adminReady };
    // Destroy the diagnostic connection even after an interrupted query, so an
    // open read-only transaction is never returned to the pool.
    } finally { client.release(true); }
  } catch { return { ready: false, code: "DATABASE_UNAVAILABLE_OR_SCHEMA_UNREADABLE" }; }
  finally { await pool.end(); }
}
export async function inspectPilotSmtp(env: Record<string, string | undefined>) {
  const transport = createTransport({ host: env.EMAIL_SERVER_HOST, port: Number(env.EMAIL_SERVER_PORT), secure: env.EMAIL_SERVER_PORT === "465", requireTLS: true, auth: { user: env.EMAIL_SERVER_USER, pass: env.EMAIL_SERVER_PASSWORD }, tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" }, connectionTimeout: 4000, greetingTimeout: 4000, socketTimeout: 4000, logger: false, debug: false });
  try { await transport.verify(); return { ready: true, code: "SMTP_AUTHENTICATED", messageSent: false, senderAccepted: false }; }
  catch { return { ready: false, code: "SMTP_UNAVAILABLE_OR_AUTH_FAILED", messageSent: false, senderAccepted: false }; }
  finally { transport.close(); }
}
