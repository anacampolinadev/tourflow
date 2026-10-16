# Arquitetura
## Estado do trabalho
Sprint 00 validado. Sprints 01/02 acrescentam schema Prisma 7, autenticação Auth.js por e-mail e Admin. Instalação, tipos, testes unitários e build foram validados; PostgreSQL e E2E são verificados pela CI. Consulte [SPRINT_01_02.md](SPRINT_01_02.md) para os resultados atuais. Produção requer configuração de PostgreSQL/SMTP e deploy em tarefa própria.
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
Rotas atuais: /login, /workspace, /operator/[organizationId], /admin/operators e API Auth.js. /driver e /onboarding continuam para sprints futuros.

## Stack e adoção
Ativos: Next.js, React, TypeScript strict, ESLint, Vitest, PostgreSQL/Prisma 7, Auth.js, Nodemailer e Zod; Playwright para fluxo real de login/Admin. npm com lockfile, Node 24 como versão de referência.
Planejados: Tailwind/shadcn quando a UI operacional exigir; PWA no Sprint 09. Vercel é o destino previsto, sem deploy nesta entrega.
Retell, WhatsApp, n8n e email ficam atrás de adapters futuros. Não existe integração configurada agora.

## Invariantes para os próximos sprints
Derivar organização de identidade validada no servidor; nunca confiar isoladamente em organizationId enviado pelo cliente. Toda consulta operacional exige contexto do tenant e RBAC. Exceções SUPER_ADMIN devem ser explícitas e auditadas.
Reservas e recursos serão gravados em transação, com proteção contra concorrência e idempotência nas ações críticas.
Disponibilidade e dispatch são determinísticos; Alana não acessa banco diretamente. n8n orquestra integrações e não contém a lógica crítica.
White-label usa configuração por tenant e não cópias do código.

## Compliance — Sprint 03
Módulo compliance ativo com domínio puro e casos de uso transacionais. Páginas e server actions compõem esses casos; permissões são verificadas também no serviço. Bytes privados em PostgreSQL, limite de 2 MiB por ficheiro/25 MiB por operador, histórico limitado a 50 versões; sem filesystem público ou efémero. Downloads autenticados como anexo. Decisão temporária adequada ao MVP limitado; migrar para object storage privado e acrescentar análise de malware quando o volume/garantias exigirem. Não há análise de malware nesta entrega.
Escritas de compliance e edição administrativa partilham OperatorProfile.version. Atualização condicional da raiz serializa alterações e audit log na transação; gates de submissão e aprovação verificam checklist completo, versão atual e validade. canGenerateWorkspace é contrato puro para uma etapa futura e exige aprovação humana válida; não existe ação de geração. Ver [Sprint 03](SPRINT_03.md).
