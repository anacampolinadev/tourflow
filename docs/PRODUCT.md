# TourFlow Fleet — produto
## Objetivo
Plataforma B2B de gestão operacional para operadores de tours terrestres com vários veículos e motoristas. TourFlow Managed combina software com atendimento remoto e gestão administrativa. O operador define preços, vende ao turista, executa o serviço e recebe diretamente os pagamentos.

## Escopo do MVP futuro
Admin TourFlow, onboarding, revisão documental, serviços, veículos, motoristas, disponibilidade determinística, reservas transacionais, dispatch interno, painel do operador, PWA do motorista, white-label por configuração, Alana e operação por exceção.
Uma única aplicação atende todos os operadores com isolamento por organização.
Três gates humanos: admin aprova documentos; cliente valida preços, políticas e configuração; admin autoriza GO LIVE.

## Limites
Sem marketplace, distribuição entre empresas, tours próprios, split de pagamentos, comissões ou motoristas independentes ao público. Stripe, faturação automatizada e Network ficam para depois.
A IA consulta ferramentas; o backend decide disponibilidade e confirma reservas.

## Entrega validada: Sprint 00
Somente fundação: Next.js/TypeScript, módulos vazios documentados, contexto persistente, lint, tipos, testes básicos, CI e página inicial neutra. Não há autenticação, RBAC, banco, CRUD, reservas, dispatch, documentos enviados ou integrações.

## Trabalho em curso: Sprints 01 e 02
Autorizados pelo utilizador após a entrega inicial. Rascunho local de autenticação/multi-tenancy e Admin preparado, mas ainda não concluído: faltam instalar dependências, atualizar lockfile e validar persistência/build. Ver [estado e sequência de retomada](SPRINT_01_02.md). O Sprint 03 (Compliance) permanece fora do escopo.

## Sequência aprovada
00 Foundation; 01 Auth/Multi-tenant; 02 Admin; 03 Compliance; 04 Operator Core; 05 Availability; 06 Booking; 07 Dispatch; 08 Operator UI; 09 Driver PWA; 10 White Label; 11 Alana Core; 12 Alana Tools; 13 Sandbox/QA; 14 Managed Ops; 15 Pilot.
Cada sprint exige critérios de aceite e verificações antes de avançar. O MVP completo só estará pronto após o fluxo real de onboarding → aprovação → cadastro de recursos → atendimento → disponibilidade → reserva → dispatch → aceite → execução → relatório.
