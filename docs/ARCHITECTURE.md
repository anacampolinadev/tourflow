# Arquitetura
## Decisão: monólito modular
Um repositório, uma aplicação Next.js com App Router e um deploy. PostgreSQL será a fonte de verdade; Prisma será adotado no sprint de persistência. Sem microserviços, Kubernetes ou Redis nesta fase.

## Estrutura
- src/app: composição de páginas, layouts e futuros route handlers. Sem regras de negócio.
- src/modules/<nome>: domínio e casos de uso do módulo; infraestrutura e interface serão adicionadas conforme necessário.
- src/components: UI reutilizável, sem acesso a dados.
- src/lib: infraestrutura transversal, sem regras específicas de módulos.
- src/types: tipos realmente compartilhados; tipos de domínio ficam no módulo.
- prisma: reservado para schema e migrations futuros.
- tests: verificações da fundação; testes de domínio serão adicionados ao implementar os casos de uso.
- docs: contexto persistente.

## Fronteiras
Módulos: auth, tenants, compliance, services, vehicles, drivers, availability, bookings, dispatch, assistants, audit.
Cada módulo exporá uma API pública por index.ts quando houver implementação. Não importar arquivos internos de outro módulo. Dependências entre módulos devem ser explícitas e sem ciclos. O acesso a banco e segredos ficará exclusivamente no servidor. Não criar abstrações ou repositórios genéricos antes de existir necessidade concreta.
Futuras áreas /admin, /operator, /driver e /onboarding não possuem rotas neste sprint.

## Stack e adoção
Ativos: Next.js, React, TypeScript strict, ESLint e Vitest; npm com lockfile, Node 24 como versão de referência.
Planejados: PostgreSQL/Prisma e Auth.js no Sprint 01; Zod nas fronteiras de entrada; Tailwind/shadcn quando a UI operacional exigir; Playwright quando existir fluxo navegável de negócio; PWA no Sprint 09. Vercel é o destino previsto, sem deploy nesta entrega.
Retell, WhatsApp, n8n e email ficam atrás de adapters futuros. Não existe integração configurada agora.

## Invariantes para os próximos sprints
Derivar organização de identidade validada no servidor; nunca confiar isoladamente em organizationId enviado pelo cliente. Toda consulta operacional exige contexto do tenant e RBAC. Exceções SUPER_ADMIN devem ser explícitas e auditadas.
Reservas e recursos serão gravados em transação, com proteção contra concorrência e idempotência nas ações críticas.
Disponibilidade e dispatch são determinísticos; Alana não acessa banco diretamente. n8n orquestra integrações e não contém a lógica crítica.
White-label usa configuração por tenant e não cópias do código.
