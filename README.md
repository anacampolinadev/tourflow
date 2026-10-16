# TourFlow
Fundação do TourFlow Fleet, plataforma B2B para operações de turismo.

## Estado
Sprint 00: Next.js App Router + TypeScript strict, monólito modular, documentação persistente, ESLint, Vitest e CI. A página inicial apenas identifica o projeto.
Nenhuma funcionalidade de negócio, autenticação, banco de dados ou integração foi implementada.

## Executar localmente
Pré-requisitos: Node.js 24 LTS e npm (Node 26 também é aceito).
```sh
npm ci
npm run dev
```
Abrir http://localhost:3000. Não são necessárias variáveis de ambiente ou PostgreSQL. .env.example registra esse estado; não colocar segredos no Git.

## Verificar
```sh
npm run lint
npm run typecheck
npm test
npm run build
```
Ou `npm run check` para executar tudo. O typecheck gera os tipos de rotas antes de executar TypeScript, inclusive em checkout limpo.
`npm run test:watch` ativa modo interativo. Os testes atuais verificam contratos estruturais; não comprovam isolamento de tenants ou funcionalidades futuras.
Para servir a versão de produção após o build: `npm start`.
CI executa as mesmas verificações em pushes e pull requests.

## Estrutura e contexto
```text
src/app/          Páginas e layouts
src/modules/      11 módulos reservados, sem implementação
src/components/   UI compartilhada futura
src/lib/          Infraestrutura transversal futura
src/types/        Tipos compartilhados futuros
prisma/           Persistência futura
tests/            Testes da fundação
docs/             Decisões e escopo persistentes
```
Ler [regras](docs/CODEX_RULES.md), [produto](docs/PRODUCT.md), [arquitetura](docs/ARCHITECTURE.md) e [modelo conceitual](docs/DATA_MODEL.md).
PostgreSQL, Prisma, Auth.js, Tailwind/shadcn, Zod e Playwright serão adotados nos sprints correspondentes. Não há deploy ou conexão com Vercel nesta entrega.

## Próxima etapa
Sprint 01 — Auth/Multi-tenant, em tarefa própria após revisão desta fundação.
