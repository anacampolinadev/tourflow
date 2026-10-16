# TourFlow
Plataforma B2B para operações de turismo, construída como monólito modular em Next.js e TypeScript.

## Estado desta branch
O Sprint 00 está entregue e validado em main. Esta branch local contém o **rascunho dos Sprints 01 — Auth/Multi-tenant e 02 — Admin**. Ainda não está pronto para produção: faltam instalação, atualização do lockfile, geração Prisma, validação completa dos tipos/build, PostgreSQL e fluxo real de login.

33 testes unitários e lint passaram. Esses resultados não validam autenticação e persistência de ponta a ponta. Ver [pendências e retomada](docs/SPRINT_01_02.md). Não usar npm ci antes de regenerar e revisar package-lock.json.

## Escopo preparado
- Autenticação por link de e-mail com Auth.js/Nodemailer, sessões no PostgreSQL, contas previamente cadastradas.
- Papéis por organização e papel global SUPER_ADMIN, autorização no servidor e revogação por conta/vínculo inativo.
- Admin de operadores: listagem, pesquisa, filtro, cadastro, edição, transições iniciais, versionamento e auditoria transacional.
- Schema Prisma 7, migração SQL, bootstrap de primeiro admin e Compose para PostgreSQL/Mailpit locais.

Compliance, geração de white-label, reservas, dispatch e entrada em produção estão fora destes sprints.

## Configuração local após liberar a instalação
Pré-requisitos: Node.js 24 LTS (26 aceito), npm, Docker em execução. Usar banco local vazio.

```sh
npm install
cp .env.example .env
```

No PowerShell, usar `Copy-Item .env.example .env`. Gerar AUTH_SECRET conforme o comentário no exemplo, sem publicar o valor. As credenciais do exemplo destinam-se somente ao desenvolvimento local.

```sh
docker compose up -d
npm run db:generate
npm run db:migrate
npm run db:bootstrap -- email-real-do-admin
npm run dev
```

Abrir http://localhost:3000/login. O bootstrap exige um endereço explícito e só é permitido antes de existir um SUPER_ADMIN. Nenhum e-mail é enviado pelo bootstrap. O Mailpit mostra os links locais em http://localhost:8025 sem enviar mensagens externas.

Produção exige PostgreSQL e SMTP reais, HTTPS, segredo forte e limite de abuso na borda. Não há deploy nesta entrega.

## Verificar depois de atualizar o lockfile
```sh
npm ci
npm run check
```

`check` executa lint, geração de tipos/TypeScript, testes unitários e build. `npm run test:watch` ativa modo interativo; `npm start` serve um build já gerado.

Integração exige banco dedicado com nome terminado em `_test`: configurar DATABASE_URL para esse banco, executar `npm run db:migrate` e `npm run test:integration`. Os testes recusam execução contra um banco sem esse sufixo e limpam apenas suas próprias fixtures. A CI está preparada para PostgreSQL, mas ainda não foi executada com os novos arquivos.

## Estrutura e contexto
```text
src/app/          Páginas, layouts e handlers
src/modules/      Auth, tenants e nove fronteiras futuras
src/components/   Formulários compartilhados
src/lib/          Configuração e acesso ao banco
src/generated/    Cliente Prisma gerado, fora do Git
prisma/           Schema e migrations
scripts/          Bootstrap administrativo explícito
tests/            Unitários e integração
docs/             Contexto persistente e pendências
```

Ler [regras](docs/CODEX_RULES.md), [produto](docs/PRODUCT.md), [arquitetura](docs/ARCHITECTURE.md), [modelo de dados](docs/DATA_MODEL.md) e [estado dos sprints](docs/SPRINT_01_02.md).
