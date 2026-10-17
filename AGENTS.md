# TourFlow — instruções para agentes

Leia primeiro docs/CODEX_RULES.md, docs/PRODUCT.md e docs/ARCHITECTURE.md. Consulte docs/DATA_MODEL.md quando a tarefa envolver persistência. Sprints 01–12 implementados em PRs empilhados. Última entrega: Sprint 12 — Alana Tools. Não avançar ao Sprint 13 sem novo pedido. Consulte docs/SPRINT_12.md e os resultados de validação no relatório de entrega.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
