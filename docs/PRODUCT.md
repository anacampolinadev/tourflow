# TourFlow Fleet — produto
## Objetivo
Plataforma B2B de gestão operacional para operadores de tours terrestres com vários veículos e motoristas. TourFlow Managed combina software com atendimento remoto e gestão administrativa. O operador define preços, vende ao turista, executa o serviço e recebe diretamente os pagamentos.

Preparação atual 15B: diagnóstico técnico de banco/SMTP e teste do build, com projeto de testes no Vercel ainda sem publicação. Não há integração operacional nem aprovação de produção. Ver [estado e próximos requisitos](SPRINT_15B.md).

## Escopo do MVP futuro
Admin TourFlow, onboarding, revisão documental, serviços, veículos, motoristas, disponibilidade determinística, reservas transacionais, dispatch interno, painel do operador, PWA do motorista, white-label por configuração, Alana e operação por exceção.
Uma única aplicação atende todos os operadores com isolamento por organização.
Três gates humanos: admin aprova documentos; cliente valida preços, políticas e configuração; admin autoriza GO LIVE.

## Limites
Sem marketplace, distribuição entre empresas, tours próprios, split de pagamentos, comissões ou motoristas independentes ao público. Stripe, faturação automatizada e Network ficam para depois.
A IA consulta ferramentas; o backend decide disponibilidade e confirma reservas.

## Entrega validada: Sprint 00
Somente fundação: Next.js/TypeScript, módulos vazios documentados, contexto persistente, lint, tipos, testes básicos, CI e página inicial neutra. Não há autenticação, RBAC, banco, CRUD, reservas, dispatch, documentos enviados ou integrações.

## Sprints 01 e 02 — implementados e validados em PR
Autorizados pelo utilizador após a entrega inicial. Autenticação/multi-tenancy e Admin implementados; instalação pelo lockfile, lint, tipos, unitários e build validados. Persistência PostgreSQL, concorrência, isolamento e fluxo real de login/Admin passaram na CI. Ver [estado e verificações](SPRINT_01_02.md). O Sprint 03 foi autorizado depois; ver [Compliance](SPRINT_03.md). Não houve deploy de produção.

## Sequência aprovada
00 Foundation; 01 Auth/Multi-tenant; 02 Admin; 03 Compliance; 04 Operator Core; 05 Availability; 06 Booking; 07 Dispatch; 08 Operator UI; 09 Driver PWA; 10 White Label; 11 Alana Core; 12 Alana Tools; 13 Sandbox/QA; 14 Managed Ops; 15 Pilot.
Cada sprint exige critérios de aceite e verificações antes de avançar. O MVP completo só estará pronto após o fluxo real de onboarding → aprovação → cadastro de recursos → atendimento → disponibilidade → reserva → dispatch → aceite → execução → relatório.

## Sprint 03 — Compliance
Checklist privado por operador, documentos versionados, correções, revisão e aprovação humana. O responsável envia; o Admin determina requisitos e decide a aprovação final. Documentos expirados impedem a liberação para geração. Sem geração de ambiente, cadastro operacional ou publicação. Ver [contratos e limites](SPRINT_03.md).

## Sprint 04 — Operator Core
Cadastros de serviços (preços, duração, capacidade, encontro/recolha e idiomas), veículos e motoristas, isolados por organização. Responsável gere todos; dispatcher gere recursos; viewer lê. Estados e desativação preservam histórico. Cadastro de motorista não concede conta de acesso. Não há agenda, reservas, dispatch ou publicação nesta entrega. Ver [contratos e verificações](SPRINT_04.md).

## Sprint 05 — Agenda e disponibilidade
Saídas semanais no fuso do operador, associações serviço/veículo, janelas dos motoristas, bloqueios, pausas e consulta determinística com motivos e alternativas. Modo interno de planeamento, sem criar/confirmar reservas ou conceder aptidão documental. Reservas e distribuição continuam para as próximas etapas. Ver [contratos e verificações](SPRINT_05.md).

## Sprint 06 — Reservas internas
Motor transacional em SANDBOX, preço/condições preservados, ocupação integral de veículo/motorista, idempotência, cancelamento e histórico. Exige aprovação documental válida; não publica nem vende ao público. Ver [contratos e limites](SPRINT_06.md).

## Sprint 07 — Distribuição interna
Escolha automática por elegibilidade, carga e capacidade; atribuição manual justificada; decisão explicável e histórico. Somente reservas SANDBOX, sem comunicação ao motorista ou publicação. Fatores sem observações ficam neutros. Documentos individuais de recursos não estão implementados e não se presume aptidão. Ver [contratos e limites](SPRINT_07.md).

## Sprint 08 — Painel do operador
Visão diária de reservas/atribuições/janelas, próximas saídas, ações necessárias, navegação por papel e filtros. Consulta de contactos preservados, relatório por saídas locais e configurações em leitura. Indicadores de teste, sem afirmar receita, disponibilidade operacional ou execução. Ver [contratos e limites](SPRINT_08.md).

## Sprint 09 — Motorista
Portal móvel privado com vínculo explícito, atribuições próprias, aceite/recusa/chegada/início/conclusão e histórico de teste. PWA com manifesto e fallback offline genérico, sem guardar passageiros nem ações offline. Recusas exigem intervenção do operador. Ver [contratos e limites](SPRINT_09.md).

## Sprint 10 — White-label
Identidade por configuração: nome de apresentação, cores/logótipo e ícones aplicados ao painel e portal/PWA do motorista. Factory repetível sob gate documental, sem duplicar recursos nem publicar. Configuração privada por organização; domínios, site público, comunicação da assistente e GO LIVE continuam posteriores. Ver [contratos e limites](SPRINT_10.md).

## Sprint 11 — Alana Core
Configuração privada e versões da assistente por operador: nome, tom, idiomas, horário de atendimento, políticas, FAQs e contactos internos. Playbook central separado e pré-visualização de instruções, sem inferência, ferramentas ou canais externos. Preparação não publica nem altera os gates humanos. Ver [contratos e limites](SPRINT_11.md).

## Sprint 12 — Alana Tools
Seis ferramentas de servidor em sessões privadas de teste: catálogo/detalhes, disponibilidade, criar/consultar reserva própria e registar ajuda humana. Preço e ocupação calculados pelo backend; fila interna sem mensagens enviadas. Painel manual, sem modelo ou canal de turistas. Ver [contratos e limites](SPRINT_12.md).

## Sprint 13 — Sandbox/QA
Bateria por operador com 33 verificações internas e uma pendência explícita de conversação. Testa ferramentas reais em rollback, guarda relatório privado e revisões humanas de falha/impedimento. Dados fictícios não ficam na operação. A primeira execução entra em SANDBOX; conversas, validação do cliente e produção continuam bloqueadas. Ver [contratos e limites](SPRINT_13.md).

## Sprint 14 — Managed Ops
Central por exceção para owner/admin: assumir, devolver, concluir e reabrir pedidos humanos com histórico privado; saúde de documentos, recusas e execução/distribuição pendente. Canais externos aparecem não integrados; nenhuma notificação ou produção presumida. Ver [contratos e limites](SPRINT_14.md).

## Preparação 15A — Telefonia antes do piloto
Associação administrativa de agente Retell, consulta verificável à API e recepção autenticada de eventos de ciclo, sem dados de conversa ou chamadas iniciadas pela aplicação. Evidência expira, segredos ficam no servidor e a ausência de conexão real continua explícita. Não executa piloto nem confirma conversas/reservas/produção. Ver [contratos e próximos passos](SPRINT_15A.md).
