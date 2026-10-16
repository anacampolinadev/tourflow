# Sprints 01 e 02 — rascunho em validação

## Autorização e estado
O utilizador autorizou continuar autonomamente os Sprints 01 (Auth/Multi-tenant) e 02 (Admin), com acesso ao GitHub deste projeto. Não autorizou avançar ao Sprint 03. A implementação está numa branch local `sprint-01-02-auth-admin`. A entrega validada em main continua sendo o Sprint 00.

Não considerar estes sprints concluídos: a sessão atual bloqueia a rede dos comandos, rejeita pedidos de execução fora do sandbox e impede a resolução do caminho do Next.js no Windows. Docker está instalado, mas o daemon não está disponível. Não há PostgreSQL ou SMTP configurados. Não houve qualquer deploy ou envio de e-mail real.

## Código preparado
- Prisma 7 com adapter PostgreSQL, schema e SQL da migração inicial. Cliente gerado ignorado no Git; precisa de `npm run db:generate`.
- Auth.js com Nodemailer e sessões no banco. Links válidos por 15 minutos, uso único via adapter; sessões de 8 horas. Somente contas ativas previamente cadastradas recebem links. Resposta genérica para endereço desconhecido.
- Normalização estrita de e-mail, configuração de origem e TLS em produção, limite atômico de três envios por e-mail a cada 15 minutos. Isso não substitui limite por IP/volume na borda antes de exposição pública.
- SUPER_ADMIN global, separado de OPERATOR_OWNER, OPERATOR_DISPATCHER, OPERATOR_VIEWER e DRIVER por organização. Papéis e ativação são consultados novamente no servidor. Não há registo público, senha padrão, bootstrap por variável de e-mail em runtime ou autenticação simulada.
- Bootstrap administrativo explícito de uso único por CLI, com lock transacional e auditoria. Exige endereço real fornecido pelo administrador; nenhum endereço foi presumido.
- /login, /workspace e página mínima da organização com controle de acesso. Motorista ainda não possui painel de atribuições.
- /admin/operators com pesquisa, filtro, paginação, criação, detalhe, edição, controle de concorrência e transições limitadas. Cadastro inicial vincula o responsável como OPERATOR_OWNER; mudar contato não transfere a titularidade.
- Atualizações e eventos de auditoria na mesma transação. LEAD → CONTRACTED → ONBOARDING; suspensão disponível apenas nestas fases. Nenhuma aprovação documental, publicação, reativação ou geração de white-label nesta etapa.
- Compose local para PostgreSQL/Mailpit, CI com PostgreSQL dedicado e testes de integração preparados.

## Verificações executadas nesta sessão
- `npm test`: 33 testes unitários passaram (incluindo os 3 da fundação).
- `npm run lint`: passou, sem warnings, após corrigir a composição de JSX.
- `git diff --check`: passou.
- Typecheck e build completos: bloqueados. Next.js apresentou acesso negado no sandbox; Prisma/Auth.js e respectivos tipos ainda não estão instalados. Uma execução direta de TypeScript confirmou os imports ausentes; não usar declarações artificiais para ocultá-los.
- Integração: não executou testes; falhou no carregamento das dependências ainda ausentes. PostgreSQL local também não está disponível.

O `package.json` foi preparado, mas o `package-lock.json` ainda é o do Sprint 00. **É obrigatório executar npm install e revisar o lockfile antes de publicar esta branch ou usar npm ci/CI.** Não criar manualmente hashes ou entradas fictícias de lockfile.

## Retomada após resolver o acesso
1. Conferir o estado da branch, instalar as dependências com `npm install` e resolver eventuais incompatibilidades reais. Fixar Auth.js beta à versão exata resolvida e manter versões do Prisma e adapter alinhadas. Não usar legacy-peer-deps.
2. Executar `npm run db:generate` e `prisma validate`; corrigir schema/tipos e revisar SQL/migration drift.
3. Criar `.env` a partir de `.env.example` e gerar AUTH_SECRET local sem imprimir o segredo. Iniciar `docker compose up -d`. Aplicar `npm run db:migrate` no banco local vazio.
4. Criar banco dedicado com nome terminado em `_test`; executar migrations e `npm run test:integration` com DATABASE_URL desse banco. Os testes recusam limpeza de banco sem esse sufixo e removem somente fixtures da própria execução.
5. Executar `npm ci`, lint, typecheck, unitários e build; verificar novamente audit de produção/desenvolvimento. Os alertas anteriores de lint continuam documentados em VALIDATION.md e precisam ser reavaliados com o novo lockfile.
6. Validar login de ponta a ponta com Mailpit local: conta cadastrada, conta desconhecida, link expirado/reutilizado, logout, revogação de conta/sessão; testar formulário Admin e tentativa de acesso por outro tenant. Adicionar teste E2E do fluxo real antes de declarar a entrega concluída.
7. Revisar React Best Practices e atualizar README/arquitetura/modelo de dados para o estado validado. Somente então publicar branch, abrir PR e confirmar CI. Não avançar ao Compliance.

## Configuração prevista após validação
`cp .env.example .env` (ou Copy-Item no PowerShell), preencher AUTH_SECRET e iniciar Compose local. O Mailpit recebe os e-mails em http://localhost:8025 sem enviar para destinatários externos. Configurar o primeiro admin com `npm run db:bootstrap -- email-real-do-admin`. Produção exige PostgreSQL e SMTP reais, HTTPS e gestão de segredos; não usar as credenciais de exemplo.

Referências técnicas consultadas: [instalação Auth.js](https://authjs.dev/getting-started/installation), [Nodemailer](https://authjs.dev/getting-started/providers/nodemailer), [adapter Prisma](https://authjs.dev/getting-started/adapters/prisma), [geração Prisma 7](https://www.prisma.io/docs/orm/v7/prisma-schema/overview/generators).
