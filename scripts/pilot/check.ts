import "dotenv/config";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { inspectPilotEnvironment } from "./environment";
import { inspectPilotDatabase, inspectPilotSmtp } from "./diagnostics";
const flags = process.argv.slice(2), configOnly = flags.includes("--config-only");
if (flags.some(flag => flag !== "--config-only") || new Set(flags).size !== flags.length) { console.error("Use pilot:check ou pilot:check -- --config-only. Não passe segredos como argumentos."); process.exitCode = 1; }
else {
  const configuration = inspectPilotEnvironment(process.env);
  if (!configuration.configurationReady || configOnly) {
    console.log(JSON.stringify({ ...configuration, database: "NOT_RUN", smtp: "NOT_RUN", deploymentReady: false }, null, 2));
    process.exitCode = configuration.configurationReady ? 0 : 1;
  } else {
    try {
      const folder = resolve(import.meta.dirname, "../../prisma/migrations");
      const expected = readdirSync(folder, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => ({ name: entry.name, checksum: createHash("sha256").update(readFileSync(resolve(folder, entry.name, "migration.sql"))).digest("hex") }));
      const database = await inspectPilotDatabase(process.env.DATABASE_URL!, expected);
      // Avoid transmitting SMTP credentials when the selected database is not ready.
      const smtp = database.ready ? await inspectPilotSmtp(process.env) : { ready: false, code: "NOT_RUN_DATABASE_NOT_READY", messageSent: false, senderAccepted: false };
      const deploymentReady = database.ready && smtp.ready;
      console.log(JSON.stringify({ ...configuration, database, smtp, deploymentReady, note: "Diagnóstico apenas; não publica, migra, cria administração nem envia mensagens. Entrega do remetente e GO LIVE não foram aprovados." }, null, 2));
      process.exitCode = deploymentReady ? 0 : 1;
    } catch { console.error("Não foi possível concluir o diagnóstico. Nenhum detalhe privado foi registado."); process.exitCode = 1; }
  }
}
