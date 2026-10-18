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
Rotas atuais: /login, /workspace, /operator/[organizationId], /admin/operators e API Auth.js. /driver está implementado no Sprint 09; /onboarding continua para sprint futuro.

## Stack e adoção
Ativos: Next.js, React, TypeScript strict, ESLint, Vitest, PostgreSQL/Prisma 7, Auth.js, Nodemailer e Zod; Playwright para fluxo real de login/Admin. npm com lockfile, Node 24 como versão de referência.
Planejados: Tailwind/shadcn quando a UI operacional exigir; PWA no Sprint 09. Vercel é o destino previsto, sem deploy nesta entrega.
Retell ganha adapter de preflight e eventos na preparação 15A; conexão real exige configuração e prova por ambiente. WhatsApp, n8n e email de atendimento continuam futuros. SMTP atual serve login.

## Invariantes para os próximos sprints
Derivar organização de identidade validada no servidor; nunca confiar isoladamente em organizationId enviado pelo cliente. Toda consulta operacional exige contexto do tenant e RBAC. Exceções SUPER_ADMIN devem ser explícitas e auditadas.
Reservas e recursos serão gravados em transação, com proteção contra concorrência e idempotência nas ações críticas.
Disponibilidade e dispatch são determinísticos; Alana não acessa banco diretamente. n8n orquestra integrações e não contém a lógica crítica.
White-label usa configuração por tenant e não cópias do código.

## Compliance — Sprint 03
Módulo compliance ativo com domínio puro e casos de uso transacionais. Páginas e server actions compõem esses casos; permissões são verificadas também no serviço. Bytes privados em PostgreSQL, limite de 2 MiB por ficheiro/25 MiB por operador, histórico limitado a 50 versões; sem filesystem público ou efémero. Downloads autenticados como anexo. Decisão temporária adequada ao MVP limitado; migrar para object storage privado e acrescentar análise de malware quando o volume/garantias exigirem. Não há análise de malware nesta entrega.
Escritas de compliance e edição administrativa partilham OperatorProfile.version. Atualização condicional da raiz serializa alterações e audit log na transação; gates de submissão e aprovação verificam checklist completo, versão atual e validade. canGenerateWorkspace é contrato puro para uma etapa futura e exige aprovação humana válida; não existe ação de geração. Ver [Sprint 03](SPRINT_03.md).

## Operator Core — Sprint 04
services, vehicles e drivers expõem APIs próprias de criação/leitura/edição. Domain schemas Zod controlam entradas e normalização; drivers contém máquina de estados. Listagens paginadas e consultas usam sempre organizationId validado por auth. A UI partilha composição de páginas em /operator/[organizationId]/[resource], com resource validado contra services/vehicles/drivers; rotas estáticas de documentos permanecem prioritárias. Não existe CRUD genérico de persistência nem ligação entre veículos/motoristas/serviços antes do sprint de disponibilidade.
A API pública de tenants expõe bloqueio da raiz para preparação do cadastro: SELECT FOR UPDATE parametrizado, seguido de validação do estado. Recursos usam version para compare-and-swap e audit log na mesma transação. Ordem de bloqueio raiz → recurso; coordena com suspensão/compliance sem modificar a versão documental ou aprovação. Não exige serviço externo ou variável de ambiente nova.

## Availability — Sprint 05
availability/domain.ts valida entradas, fusos e intervalos; engine.ts é puro e determinístico; service.ts monta snapshots RepeatableRead e escreve calendário em transações que bloqueiam a raiz do operador. API pública via index.ts. A leitura não escolhe recursos nem reserva; PLANNING/checkedAt distinguem a consulta do resultado transacional de booking futuro. Sprint 06 precisa acrescentar ocupações reais e revalidar todos os gates na transação, sem reaproveitar disponibilidade antiga.
Datas de saída e janelas são interpretadas no fuso IANA da Organization. @js-temporal/polyfill 0.5.1 fica no servidor; rejeita DST ambíguo/inexistente. UI reaproveita formulários para entradas date/time/datetime-local, sem levar regras ou dados do banco ao cliente. CalendarVersion separado da versão documental protege alterações de calendário sem invalidar a aprovação de compliance. Ordem de bloqueio raiz → recursos continua obrigatória.

## Booking — Sprint 06
bookings expõe createBooking/cancelBooking/readBookings por index.ts. Disponibilidade expõe availabilityInTransaction para composição confiável no servidor, após autorização e lock da raiz; não é endpoint público. Compliance expõe assertSandboxBookingApproval para verificar aprovação humana e documentos na mesma transação. ReadCommitted com lock da raiz serializa confirmação e mutações existentes; EXCLUDE PostgreSQL defende intervalos de veículo/motorista. Calendário/cadastros recusam mutações enquanto houver compromissos futuros; cancelamento funciona mesmo sob suspensão. UI compõe casos de uso e reutiliza ResourceForm, sem dados/DB no cliente. Ver [Sprint 06](SPRINT_06.md).

## Dispatch — Sprint 07
dispatch expõe dispatchBooking/readDispatch por index.ts; domínio puro rankCandidates/scoreCandidate e schema discriminado AUTO/MANUAL. availabilityInTransaction aceita opção interna de excluir apenas a reserva revalidada pelo chamador; não é endpoint. Dispatch bloqueia a raiz, revalida gates/intervalos e troca a ocupação na mesma transação. ReadCommitted, chave/hash e CAS de versão mantêm idempotência/concorrência; NO_CANDIDATE não libera recursos. Ranking separável evita produto cartesiano. UI em /operator/[organizationId]/dispatch/[bookingId]; booking mantém ASSIGNED/cancelamento e exposição de nomes dos recursos. Ver [Sprint 07](SPRINT_07.md).

## Operator UI — Sprint 08
operator é um módulo de composição de leituras privadas (shell, dia, contactos, relatório), sem alterações de schema ou dependências dos módulos de negócio de volta para ele. APIs públicas em index.ts, auth/compliance por contratos públicos e agregações SQL parametrizadas/Prisma em RepeatableRead. Layout comum e navegação cliente mínima; páginas usam casos de uso autorizados, não dependem apenas do layout. Reservas mantêm filtros no servidor; relatórios usam fuso local e bigint para cêntimos. Não há cache partilhado nem escrita nas leituras. Ver [Sprint 08](SPRINT_08.md).

## Driver PWA — Sprint 09
drivers/portal-domain.ts contém transições/tempos puros; portal.ts compõe identidade, vínculo explícito e ações transacionais. API pública em drivers/index.ts. UI em /driver e server actions autorizadas; nenhuma regra de negócio no cliente. Service worker restrito a navegação, sem cache/filas privadas, manifesto e ícones locais. Bookings e dispatch entendem as etapas e recusas; operator agrega novos estados. Ver [Sprint 09](SPRINT_09.md).

## White-label — Sprint 10
branding é um módulo independente (auth/compliance/tenants por APIs públicas), evitando ciclo com compliance. Factory e edição usam root lock, gate de aprovação, versão própria e audit atómico; nenhuma duplicação de workspaces/dados. BrandProfile/ativos privados em PostgreSQL. sharp explícito normaliza PNG e produz ícones; CSS apenas hex com contraste calculado e escopo de tenant. Metadados/autenticação de manifesto por organização; React cache restrito ao pedido. Sem resolução por Host/DNS nem publicação. Ver [Sprint 10](SPRINT_10.md).

## Alana Core — Sprint 11
Módulo assistants expõe initializeAssistant/updateAssistant/readAssistant; domínio puro valida dados e compõe instruções, service server-only autoriza owner e persiste snapshots sob lock da raiz e gate documental. Perfil atual, histórico por tenant e auditoria atómicos; RepeatableRead nas consultas. Playbook em código, dados de referência JSON de menor confiança, contactos internos excluídos do prompt. Sem inferência/SDK/adapters ou ferramentas: operação fica para os sprints seguintes. Ver [Sprint 11](SPRINT_11.md).

## Alana Tools — Sprint 12
assistants/tools.ts compõe contratos públicos de services/availability/bookings na mesma transação sob root lock. tools-domain.ts define whitelist/DTOs/entradas estritas. Sessões vinculam tenant/autor/versão/TTL; escritas com chave/hash e grant de consulta próprio. Booking expõe caso de uso transacional compartilhado e recibo mínimo; não há endpoint de banco ou inferência. Playbook alana-tools-1 exige atualização explícita de versões antigas. Ver [Sprint 12](SPRINT_12.md).

## Sandbox/QA — Sprint 13
Novo módulo qa compõe APIs transacionais públicas de assistants. Probes reais e audit temporário são sempre revertidos; segunda transação persiste relatório somente se identidade, gates e hash de configuração se mantiverem. Snapshot privado, evidência limitada e freshness de até 24h. UI owner/admin separada e revisões humanas imutáveis; nenhum endpoint público ou modelo inferido. Ver [Sprint 13](SPRINT_13.md).

## Managed Ops — Sprint 14
managed-ops gere o ciclo de AssistantHandoff sob lock raiz/CAS/evento/audit e compõe projeções de saúde atuais em RepeatableRead. API pública em index.ts; sem dependência inversa de assistants nem efeitos externos. Páginas owner/admin partilham componente de servidor; formulários recebem só dados mínimos e ações vinculadas, com autorização independente no serviço. Central administrativa limitada a 20 operadores por página; filas de 20 com totais completos e histórico até 100 eventos por pedido. Leituras owner não escrevem; admin explícito auditado. Canais não integrados permanecem pendentes, sem falsa telemetria. Ver [Sprint 14](SPRINT_14.md).

## Retell preflight — Preparação 15A
integrations contém domínio, adapter Retell server-only, casos de uso e fronteira de webhook; API pública por index.ts. managed-ops consome apenas projeção transacional sem rede. Não há dependência de assistants/bookings/qa, nem efeitos externos nos probes. Consulta real ao fornecedor fora da transação com ticket/CAS/revalidação; route handler autentica bytes e reduz payload antes de persistir. Associação permanente de agente, prova ligada à configuração e recibo idempotente sem PII. Sem transportes de LLM, consentimento de turista ou funções de reserva externas. Ver [15A](SPRINT_15A.md).

## Diagnóstico do ambiente — Preparação 15B

scripts/pilot executa diagnóstico exclusivamente por CLI, sem endpoint público e sem depender de módulos de negócio. Configuração é validada antes de conexões externas; banco READ ONLY verifica TLS/extensão/histórico exato/admin, SMTP verify exige TLS sem envio. Não executa migrations/bootstrap/deploy nem regista valores privados. Smoke inicia o build com fixtures descartáveis e encerra o processo; não comprova infraestrutura remota. Sem alterações de persistência. Ver [15B](SPRINT_15B.md).
