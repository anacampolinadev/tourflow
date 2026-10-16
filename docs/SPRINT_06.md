# Sprint 06 — Booking Engine

## Escopo autorizado
Reservas transacionais internas, clientes, preço e condições imutáveis, ocupação de recursos, idempotência, cancelamento e histórico. Interface autenticada em /operator/[organizationId]/bookings. Não avançar ao Sprint 07 sem novo pedido.

## Contrato e gates
- createBooking recebe serviceId, data/hora locais, passageiros, idioma opcional, cliente (nome/e-mail/telefone), recolha/notas opcionais, origem OPERATOR/PHONE/EMAIL e UUID de idempotência. Rejeita campos extra: preço, estado, tenant e atribuições não vêm do cliente. Organização exige vínculo atual; owner/dispatcher escrevem, viewer lê, driver não acede.
- O único modo implementado é SANDBOX, visível na UI e imposto por CHECK no banco. Permite APPROVED/SANDBOX/CLIENT_REVIEW com marcadores da aprovação humana e todos os documentos atuais aprovados, válidos agora e até ao fim do serviço. APPROVED permite testar o motor antes da geração do ambiente. LIVE é recusado nesta fase: validação do cliente e GO LIVE continuam para os sprints próprios. Não alterar estados para contornar o gate.
- Cada reserva é de um grupo inteiro, com um veículo e um motorista dedicados. Não vende lugares partilhados. Passageiros são uma contagem; sem manifesto nominal ou BookingPassenger nesta etapa.
- Estados implementados: CONFIRMED e CANCELLED. Os restantes estados planeados pertencem à distribuição/execução futura. Confirmação significa apenas confirmação interna de teste, sem cobrança ou mensagem a cliente/motorista.

## Transação e concorrência
Ordem: autorização → lock da raiz OperatorProfile → chave de idempotência → gates/documentos → disponibilidade recalculada na mesma transação → preço do serviço → Customer → Booking → BookingOccupancy → BookingEvent → auditoria → commit. Isolamento ReadCommitted: após esperar pelo lock, ler a ocupação já comprometida pelo pedido anterior. Falha desfaz todas as escritas. Os escritores existentes de calendário/cadastro e compliance partilham a mesma raiz.
BookingOccupancy segura o intervalo com buffers; a consulta da agenda já desconta ocupações ativas. Seleção determinística do primeiro par elegível por id serve apenas para garantir capacidade interna, sem Fair Dispatch, score, atribuição operacional ou aviso. Sprint 07 deverá substituir/revalidar a ocupação atomicamente ao distribuir.
PostgreSQL usa btree_gist e constraints EXCLUDE independentes para motorista e veículo, com intervalos semiabertos [início,fim) e releasedAt nulo. Também há CHECKs de valores e intervalos e FKs compostas por tenant. A migration requer permissão para CREATE EXTENSION btree_gist (extensão distribuída com PostgreSQL); não instala software no Windows.
Unicidade (organizationId,idempotencyKey) e SHA-256 do payload normalizado garantem replay sem novos efeitos; mudar dados com a mesma chave falha. Replay após cancelamento devolve a reserva cancelada, sem reativar; vínculo e permissões são sempre revalidados. Nenhum PII, chave ou hash é colocado em audit log.

## Cancelamento e compromissos
cancelBooking exige permissão, tenant e versão; CONFIRMED → CANCELLED libera ocupação na mesma transação e cria um único evento/audit. Repetição é inofensiva. Permitido mesmo com operador suspenso ou documentos expirados. Sem eliminação física.
Proteção conservadora: enquanto houver ocupações futuras não liberadas, alterações de calendário e cadastros são recusadas com orientação para cancelar antes. Abrange inclusive adições e alterações sem impacto: replaneamento seletivo e gestão de exceções ficam para a distribuição. Mudanças administrativas/compliance podem suspender a operação, preservando compromissos para análise/cancelamento, sem liberar silenciosamente recursos.
Snapshots incluem nome do serviço, duração por instantes, fuso, preço unitário/tipo/total em cêntimos, moeda, encontro e regras de recolha. Preço PER_PERSON × passageiros ou PER_GROUP uma vez; overflow rejeitado. Customer é snapshot por reserva, sem deduplicação automática por e-mail; contactos podem ser partilhados por pessoas diferentes. Listagem paginada em blocos de 20. Dados de clientes privados, disponíveis apenas aos papéis com leitura da organização.

## Verificação
Local: lint, typecheck, 71 unitários e build aprovados. CI [38983858493](https://github.com/anacampolinadev/tourflow/actions/runs/38983858493), commit 82c9acb672e8a4c703e90a1e5c9dc8178a3a8333, aprovada: 71 unitários + 55 de integração PostgreSQL + 10 Chromium = 136 testes. npm ci, geração Prisma, migration, verificação de drift, lint, tipos e build aprovados. Capturas desktop 1280px e mobile 390px inspecionadas, sem corte horizontal. Testes cobrem gates, RBAC, isolamento, replay concorrente, disputa do último par, buffers, limites semiabertos, cancelamento suspenso, preços/snapshots, constraints SQL e rollback após falha injetada no evento. E2E usa login real por SMTP/Mailpit e UI → ação → PostgreSQL → UI; verifica conflito, preservação de campos após recusa, cancelamento, capacidade libertada, privacidade, desktop e mobile. ResourceForm aceita preserveOnError explicitamente no formulário de reserva; os dados ficam apenas no estado do navegador.

## Limites
Sem dispatch, pagamentos, API pública, expiração de holds temporários, remarcação, edição de reservas, manifesto nominal, publicação, notificações ou aptidão documental individual de veículos/motoristas. Holds confirmados permanecem até cancelamento; o tempo decorrido elimina o conflito com períodos futuros. Não houve deploy nem instalação de WSL.

PR [#5](https://github.com/anacampolinadev/tourflow/pull/5), empilhado sobre Sprint 05/PR #4. Sem merge ou deploy.
