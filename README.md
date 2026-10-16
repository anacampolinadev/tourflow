# TourFlow
Plataforma B2B de operações para turismo, em monólito modular Next.js/TypeScript.

## Estado
Sprints 01 (Auth/Multi-tenant) e 02 (Admin): autenticação por e-mail, isolamento por organização, papéis e gestão administrativa de operadores. Schema Prisma/PostgreSQL, migração, auditoria e testes incluídos. CI aprovada com 33 testes unitários, 7 de integração e 3 de navegador; ver [evidências e limites](docs/SPRINT_01_02.md).
Sprint 03 acrescenta checklist documental, envio privado versionado, revisão, correções e aprovação humana. Ver [escopo e verificações](docs/SPRINT_03.md). White-label, reservas, dispatch e publicação ficam para as próximas etapas. Sem deploy nesta entrega.

## Executar localmente
Node 24 LTS (26 aceito), npm e Docker Desktop em execução.
```sh
npm ci
cp .env.example .env
docker compose up -d
npm run db:generate
npm run db:migrate
npm run db:bootstrap -- email-real-do-admin
npm run dev
```
No PowerShell, usar Copy-Item para copiar o exemplo. Preencher AUTH_SECRET com um segredo gerado conforme .env.example antes de iniciar. Credenciais do exemplo são apenas locais. O bootstrap é de uso único e não envia e-mail.
Abrir http://localhost:3000/login. Links locais aparecem no Mailpit em http://localhost:8025; nenhum destinatário externo é contactado. Contas operadoras são cadastradas pelo Admin, sem registo público.
Produção exige PostgreSQL e SMTP reais, HTTPS, limites de abuso e segredos próprios.

## Verificar
```sh
npm run check
```
Executa lint, geração de tipos, TypeScript, unitários e build. Para servir o build: npm start. Para testes interativos: npm run test:watch.

Integração: configurar DATABASE_URL de banco dedicado com nome terminado em _test, executar npm run db:migrate e npm run test:integration. Navegador: instalar Chromium com npx playwright install chromium, manter Mailpit local disponível e executar npm run test:e2e. Playwright inicia um servidor de teste na porta 3100. Os testes recusam outro nome de banco e limpam apenas suas fixtures. CI prepara PostgreSQL/Mailpit descartáveis e executa a mesma sequência.

## Estrutura
- src/app: páginas, layouts e API de autenticação.
- src/modules: auth, tenants e compliance; oito fronteiras futuras.
- src/components: formulários reutilizáveis.
- src/lib: configuração validada e conexão ao banco.
- src/generated: cliente Prisma gerado, fora do Git.
- prisma: schema e migrations; scripts: bootstrap administrativo.
- tests: unitários, integração e navegador; docs: contexto persistente.

## Contexto para a próxima tarefa
Ler [regras](docs/CODEX_RULES.md), [produto](docs/PRODUCT.md), [arquitetura](docs/ARCHITECTURE.md), [modelo de dados](docs/DATA_MODEL.md) e [estado dos sprints](docs/SPRINT_01_02.md).


## Documentação do operador
No Admin, crie o operador e avance até Em configuração. Abra Rever documentação, defina os requisitos e indique se exigem validade. O responsável entra pelo próprio e-mail, abre Documentação do operador e envia os ficheiros. Após o envio para análise, o Admin revê cada versão atual e dá a aprovação final separadamente; rejeições pedem substituição. PDF/PNG/JPEG até 2 MiB, arquivo de 25 MiB/50 versões, 12 requisitos por operador. Os documentos ficam no PostgreSQL privado e são descarregados apenas com autorização. Não há antivírus integrado. Aprovação não publica o operador nem gera ambiente.
