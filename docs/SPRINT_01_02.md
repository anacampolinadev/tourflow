# Sprints 01 e 02 — autenticação, multi-tenancy e Admin

## Escopo autorizado
Sprints 01 (Auth/Multi-tenant) e 02 (Admin), com acesso ao GitHub do TourFlow. Sprint 03 (Compliance) fora do escopo. Branch: sprint-01-02-auth-admin.

## Implementação
- Prisma 7.10.1/PostgreSQL, migração inicial, cliente gerado fora do Git e bootstrap explícito do primeiro admin, com bloqueio transacional de concorrência.
- Auth.js 5.0.0-beta.32, sessões de 8h no banco e links de e-mail de uso único/15 minutos. Contas precisam de cadastro prévio. Endereços desconhecidos/inativos não recebem link; mesma resposta pública.
- Limite atômico de três envios por e-mail a cada 15 minutos. Sem senha padrão, registo público, identidade de teste em runtime ou promoção automática por variável de e-mail.
- SUPER_ADMIN global separado dos quatro papéis de organização. Conta e vínculo ativo revalidados por pedido. Tenant enviado na URL só seleciona o contexto depois da autorização no servidor.
- /login, /workspace e página mínima da organização. Painel do motorista fica para Sprint 09.
- /admin/operators: pesquisa, estado, paginação, criação, edição, concorrência otimista e auditoria transacional. Responsável inicial recebe OPERATOR_OWNER. Mudar contacto não transfere titularidade.
- Transições disponíveis: LEAD → CONTRACTED → ONBOARDING e suspensão nestas fases. Sem aprovação documental, reativação, geração de ambiente ou GO LIVE.
- Compose de PostgreSQL/Mailpit locais; CI usa serviços descartáveis e apenas dados fictícios.

## Evidências locais
- npm install e npm ci: instalação concluída com lockfile atualizado.
- npm run check: lint, typecheck, 33 testes unitários e build de produção passaram.
- prisma validate: schema válido.
- Auditoria de produção: zero vulnerabilidades. Cinco alertas high remanescentes são da cadeia de ferramentas de lint, conforme VALIDATION.md.
- CI aprovada: 33 testes unitários, 7 de integração PostgreSQL e 3 de navegador Chromium. Migração aplicada e comparação banco/schema sem diferenças. Evidência final: https://github.com/anacampolinadev/tourflow/actions/runs/38970643586 (implementação 1319434, incluindo verificação de largura para nomes longos).
- Docker local não iniciou porque falta o WSL no Windows. A execução remota acima validou os serviços sem instalar componentes do Windows. Os Sprints 01 e 02 estão implementados e validados na proposta de alteração; main permanece aguardando revisão/merge.

## Testes adicionados
Unitários: isolamento de contexto, rejeição de utilizador/vínculo inativo, papéis, elevação de privilégios, validação estrita, dinheiro e gates de estado.
Integração PostgreSQL: acesso anônimo, persistência com vínculo/auditoria, isolamento entre utilizadores, revogação, rollback de criação duplicada, concorrência e bloqueio de publicação.
E2E Chromium: login real por e-mail no Mailpit, endereço desconhecido, cadastro/edição/estado de operador, logout, link reutilizado/expirado, acesso entre organizações e conta desativada. Sem mocks de autenticação nos testes de navegador.

## Decisão de dependência
Auth.js ainda declara peer Nodemailer 7/8, com alertas conhecidos. Dois overrides restritos (next-auth e @auth/core) usam a mesma dependência direta Nodemailer 10.1.2 corrigida, sem legacy-peer-deps. O provider customiza o envio SMTP com dados validados; CI deve validar o envio real no Mailpit. Retirar overrides quando o upstream ampliar a faixa suportada. O beta Auth.js e as versões do Prisma estão fixados para evitar resolução inesperada.

## Configurar ambiente local
Pré-requisitos: Node 24 LTS, npm e Docker Desktop em execução.
1. npm ci; copiar .env.example para .env e gerar AUTH_SECRET conforme o exemplo, sem o publicar.
2. docker compose up -d; npm run db:generate; npm run db:migrate.
3. npm run db:bootstrap -- email-real-do-admin (uso único, nenhum e-mail enviado).
4. npm run dev; abrir http://localhost:3000/login. E-mails locais em http://localhost:8025.
5. Para integração/E2E, apontar DATABASE_URL a banco dedicado terminado em _test, aplicar migração, executar npm run test:integration e npm run test:e2e. Os testes limpam somente suas fixtures; não usar produção.

## Limites
Não houve deploy nem configuração de PostgreSQL/SMTP de produção. Antes de exposição pública, configurar HTTPS, segredos e limites por IP/volume na borda; o limite por e-mail não substitui isso. Não há gestão visual de membros/roles, recuperação de titularidade ou reativação de operadores neste escopo. Suspensão bloqueia o avanço de estado; funcionalidades operacionais futuras precisam verificar os gates próprios. Nunca declarar o MVP completo com base apenas nestes dois sprints.

Referências: https://authjs.dev/getting-started/installation e https://www.prisma.io/docs/orm/v7/prisma-schema/overview/generators.
