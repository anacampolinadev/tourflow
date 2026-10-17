# Sprint 09 — Portal/PWA do motorista

## Escopo
Portal privado e móvel em /driver/[organizationId], com conta ativada explicitamente pelo responsável no cadastro do motorista. Lista apenas atribuições próprias de teste, contacto mínimo do grupo, horário local, encontro/recolha, veículo e ligação ao mapa externo. Separação entre por realizar e concluídos, paginação de 20, atualização manual e saída da sessão. Manifesto e ícones para instalação pelo navegador; service worker de navegação com resposta genérica sem ligação.

## Identidade e privacidade
Driver.userId opcional; único por organização/conta, FK User. Cadastro de contacto nunca concede acesso. O responsável autoriza a conta para o e-mail canónico visível no cadastro; pode criar User e membership DRIVER na mesma transação. Utilizador existente deve estar ativo, ser USER e não possuir outro papel/vínculo inativo nesse operador. Não substitui papéis nem reativa identidades. Sem envio automático de convite. Alterar o contacto não muda a identidade ou o e-mail de login associado. Transferência/reassociação de conta não faz parte desta entrega.

O portal exige User ativo, membership ativo DRIVER e Driver ACTIVE associado. Revalida os três no servidor, também dentro das transações. OWNER, DISPATCHER, VIEWER e SUPER_ADMIN sem o vínculo próprio não entram no portal. Driver não lê o painel do operador, outros motoristas ou ocupações provisórias CONFIRMED. Não expõe preço, e-mail do cliente, documentos ou notas privadas do operador.

## Estados e concorrência
ASSIGNED → ACCEPT → DRIVER_ACCEPTED → ARRIVE → ARRIVED → START → IN_PROGRESS → COMPLETE → COMPLETED. Alternativa: ASSIGNED → DECLINE → DRIVER_DECLINED. Cada etapa usa domínio puro, versão esperada, chave UUID/hash do pedido com ator/reserva, lock OperatorProfile → recurso, CAS, BookingEvent, DriverAction e AuditLog atómicos. Replay retorna a ação original; chave com outros dados falha. Revalida a própria ocupação ativa na organização; atribuição/cancelamento concorrentes não podem executar uma página antiga.

Chegada a partir de duas horas antes da saída; início somente à hora de saída ou depois. Aceite/chegada/início/recusa após o fim previsto são recusados, para o operador resolver a exceção. Conclusão posterior ao fim continua possível. Aceite/chegada/início exigem gates SANDBOX válidos agora e até ao fim e serviço/veículo ativos. Recusa e conclusão podem fechar pendências sob suspensão, mas continuam exigindo identidade/motorista ativos. LIVE continua bloqueado. Não existe execução automática nem relógio editável na aplicação; os testes usam horários de fixtures para cobrir etapas presentes/futuras.

O operador pode cancelar CONFIRMED, ASSIGNED, DRIVER_DECLINED, DRIVER_ACCEPTED e ARRIVED. Não pode cancelar IN_PROGRESS ou COMPLETED. Após aceite, não pode redistribuir silenciosamente; antes do início pode cancelar. Recusa não cancela nem libera o intervalo: gera alerta no painel e exige redistribuição/cancelamento do operador. Dispatch exclui todos os motoristas que recusaram essa reserva, inclusive na escolha manual. Se não houver alternativa, preserva a ocupação e regista NO_CANDIDATE. Não há reoferta ao mesmo motorista nesta versão.

O intervalo integral e buffers ficam ocupados mesmo em recusa ou conclusão antecipada; não há libertação prematura. Um motorista não pode iniciar outro serviço enquanto tiver um IN_PROGRESS próprio, mesmo após o fim previsto. Fairness passa a contar atribuições aceites, chegadas, em curso e concluídas na mesma janela anterior. Painel/filtros/relatório entendem os novos estados; atribuições agregadas incluem etapas de execução e pendências incluem recusas. Totais são apresentados como reservas não canceladas, incluindo concluídas. Valores continuam previstos, sem receita/pagamento real.

## PWA e limites
Instalação via menu do navegador, HTTPS em ambiente real e localhost nos testes. Sem push, GPS, rastreamento, execução offline, sincronização de ações ou indicador manual de disponibilidade. Janelas continuam geridas pelo operador. Service worker restrito a /driver/: só tenta rede para navegações GET; fallback 503 genérico não contém dados pessoais. Sem Cache Storage, IndexedDB, localStorage ou cache de respostas privadas. Falha em POST não é tratada como sucesso. Atualização após reconexão busca o estado do servidor. Rotas privadas dinâmicas e cabeçalho private/no-store. Não foi feito teste de instalação em dispositivo iOS/Android físico.

## Validação
Check local (lint/tipos/84 unitários/build) aprovado. A CI executa migration+drift PostgreSQL, check e as suítes completas: 84 unitários, 88 testes PostgreSQL e 17 Chromium. Os novos testes cobrem vínculo explícito, papéis, isolamento, dados mínimos, replay/concorrência, versão antiga, recusa/redistribuição, horários, gates, preservação de buffers, serviço anterior ainda em curso, rollback e jornada real por login no Mailpit. E2E inclui viewport 390 px, entrada instalada, manifesto/cabeçalhos, worker ativo sem cache privado, navegação offline genérica e logout seguido de bloqueio do portal. As capturas ocultam somente a barra de desenvolvimento; o logout é verificado em largura desktop para evitar que a barra fixa intercepte o toque no rodapé móvel. Resultados finais, commit/CI e capturas no relatório de entrega e no PR.

## Fora do escopo
White-label, Alana, notificações, operação pública, aptidão documental individual, pagamentos, geolocalização, no-show e transferência de contas. Sem merge ou deploy. Sprint 10 apenas após novo pedido.

PR [#8](https://github.com/anacampolinadev/tourflow/pull/8), empilhado sobre Sprint 08/PR #7. Não exige configuração ou alteração de Docker/WSL/Windows; PostgreSQL e Mailpit descartáveis são executados na CI.
