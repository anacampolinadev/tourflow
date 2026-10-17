# Sprint 07 — Fair Dispatch v1 interno

## Escopo
Distribuição automática determinística e escolha manual justificada por reserva de teste, com decisão persistida, concorrência, idempotência e histórico. Entrada pela reserva → Ver distribuição. Sem Sprint 08, publicação, mensagens, app de motorista ou execução de viagem.

## Elegibilidade antes da pontuação
Vínculo ativo e permissões atuais; owner/dispatcher escrevem, viewer lê, driver não acede. Reserva CONFIRMED ou ASSIGNED, modo SANDBOX, ocupação ativa, aprovação humana e documentos do operador válidos agora e até ao fim do serviço. LIVE permanece recusado.
O módulo availability revalida serviço/estado, horário, associação de veículo, capacidades, idioma, janelas completas com pausas, bloqueios e ocupações de outras reservas. Apenas a própria ocupação da reserva é excluída por contrato interno de servidor; nenhuma rota pública aceita essa exclusão. Intervalos devem coincidir exatamente com os snapshots da reserva e da ocupação; mudanças incompatíveis exigem revisão, sem remarcação implícita.
Documentos individuais de veículo/motorista ainda não existem no cadastro: não se presume validade ou aptidão. A decisão guarda resourceDocuments=NOT_IMPLEMENTED_SANDBOX e a UI identifica o limite. O gate individual é obrigatório antes de qualquer distribuição operacional em produção; esta entrega testa apenas a mecânica interna com os recursos cadastrados.

## Pontuação e desempates
Fatores inteiros de 0 a 10000, pesos percentuais: disponibilidade 25, proximidade 20, equilíbrio de carga 20, capacidade adequada 15, avaliação 10, idioma 5, aceitação 5. Pontuação final também de 0 a 10000 (UI divide por 100 para pontos de 0 a 100), arredondada uma vez após a soma ponderada.
- Disponibilidade: 10000 após filtros; idioma pedido: 10000 após compatibilidade. Sem preferência, idioma usa 5000.
- Proximidade, avaliação e aceitação: 5000 neutros, marcados explicitamente, sem inventar GPS, avaliações ou histórico de aceite.
- Carga: contagem de outras reservas ASSIGNED não canceladas, com ocupação não liberada, cuja saída está no intervalo UTC [saída atual − 30 dias, saída atual + 24 horas). Não mede viagens realizadas ou receitas. Fator round(10000 / (1 + contagem)). Reatribuir a mesma reserva não conta como trabalho adicional; canceladas não contam.
- Capacidade: round(passageiros × 10000 / capacidade). Escolhe o veículo elegível com menor capacidade suficiente, depois id. Todos os fatores restantes são independentes do veículo; assim o melhor veículo por motorista preserva o máximo global sem produto cartesiano.
- Ranking: pontuação decrescente, menor carga, id do motorista e id do veículo em ordem estável. Desempates são reprodutíveis, sem aleatoriedade.

## Contratos e transação
dispatchBooking(organizationId, bookingId, input) aceita modo AUTO ou MANUAL, expectedVersion e UUID de idempotência; MANUAL exige driverId, vehicleId e justificação de 5–500 caracteres. Campos extra e pontuação fornecida pelo cliente são recusados. Manual pode escolher qualquer par elegível, mas não ultrapassa filtros. Justificação privada não deve conter dados pessoais.
Ordem: autorização → lock OperatorProfile → replay da chave/hash normalizado incluindo bookingId → versão/estado → gates e snapshot → ranking → troca da ocupação existente → evento ASSIGNED → versão/estado → decisão e auditoria → commit. ReadCommitted e a mesma raiz dos restantes escritores; constraints EXCLUDE por cada recurso permanecem ativas. Nada libera a ocupação entre a escolha e a gravação.
CONFIRMED → ASSIGNED; ASSIGNED permite reatribuição. Aceite, recusa, execução e conclusão do motorista ficam para Sprint 09. Cancelamento de ASSIGNED usa o caso de uso de bookings, libera a ocupação e preserva decisões. BookingEvent usa ASSIGNED também para reatribuição; a decisão explica a escolha.
Sem candidatos: grava NO_CANDIDATE, incrementa a versão, preserva estado e ocupação anteriores e não cria evento de atribuição. Falha de permissão, versão, gate ou escolha manual inválida não gera decisão parcial. Falha de persistência desfaz ocupação/evento/versão/decisão/audit na mesma transação.
Unicidade (organizationId,idempotencyKey); payload diferente com a mesma chave é recusado, inclusive noutra reserva. Replay devolve a decisão histórica, sem reatribuir após cancelamento; o estado atual deve ser consultado separadamente. Vínculo e permissão são sempre verificados. Nova tentativa após NO_CANDIDATE usa nova chave e versão atual.

## Persistência e interface
DispatchDecision guarda tenant, reserva, ator, modo, resultado, versão resultante, recursos selecionados, score, motivo e snapshot JSON com pesos, fatores neutros, janela de carga, candidatos elegíveis, ranking, escolha e recursos anteriores. FKs compostas defendem isolamento; CHECK exige par/score apenas para resultado ASSIGNED e versão positiva. Audit regista ids/resultado/modo/versão, sem motivo privado, dados de cliente, chaves ou hashes.
Prévia é leitura consistente, sem efeitos; o comando recalcula tudo. UI mostra recursos provisórios/atribuídos, critérios, carga/pontos dos candidatos, escolha automática/manual e últimas 20 decisões. História completa permanece no banco. Formulários manuais preservam dados quando há erro. Sem dependência externa ou variável nova.

## Verificação
Local: lint, tipos, 77 unitários e build aprovados. Novos testes PostgreSQL e Chromium cobrem carga/capacidade, filtros e manual, tenant/RBAC, replay, concorrência, cancelamento, falha injetada na decisão e rollback. Fluxo real de login SMTP/Mailpit → automática → manual → histórico → cancelamento; viewer e outro utilizador. CI de implementação [38985970211](https://github.com/anacampolinadev/tourflow/actions/runs/38985970211), commit aca65e4d2e4420880699d8aa44153a792bd2b0de: aprovada, 77 unitários + 68 PostgreSQL + 12 Chromium = 157 testes. Instalação por lockfile, migration, drift, lint, tipos e build aprovados. A captura usa caret=initial para não alterar estilos de textarea durante hidratação; o E2E também verifica erros de console. Resultado da última verificação acompanha o PR e o relatório de entrega.

## Limites
Somente simulação interna SANDBOX. Não assegura validade documental individual, proximidade real, avaliação ou taxa de aceitação. Sem notificação, GPS, aceite/recusa, remarcação, replaneamento seletivo, gestão de exceções ou operação pública. Cadastros/calendário continuam conservadoramente bloqueados enquanto existirem ocupações futuras. Não houve merge, deploy ou alteração ao WSL/Windows.

PR [#6](https://github.com/anacampolinadev/tourflow/pull/6), empilhado sobre Sprint 06/PR #5. Sem merge ou deploy.
