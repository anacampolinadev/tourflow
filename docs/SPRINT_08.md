# Sprint 08 — Painel do operador

## Escopo autorizado
Visão diária, navegação comum, ações necessárias, filtros de reservas, consulta de contactos, resumo por período e configurações em leitura. Reúne os módulos já implementados; sem Sprint 09, alterações de estados, notificações, publicação, pagamentos ou novas tabelas/migrations/dependências.

## Visão diária
/operator/[organizationId] apresenta nome/estado/fuso, data selecionada (hoje no fuso por omissão), quatro indicadores e próxima saída futura no dia. Conta reservas CONFIRMED/ASSIGNED como ativas; canceladas aparecem na lista, separadas e fora das contagens ativas. Aguardam atribuição = CONFIRMED; atribuídas = ASSIGNED, sem implicar aceite/execução. Lista de 20 por página, contagens independentes da paginação.
Motoristas com janela = motoristas ACTIVE distintos com pelo menos uma janela ativa que intersecta o dia, mesmo que haja várias janelas. Não significa motorista livre agora, disponível para um serviço ou com aptidão documental; a elegibilidade continua a ser decidida pelos motores existentes.
Ações necessárias incluem aprovação/estado que bloqueia novas reservas de teste, requisitos documentais atuais incompletos/rejeitados/expirados, expiração em até 7 dias (DATE inclusivo UTC), reservas sem atribuição, cadastros vazios e última distribuição sem candidatos. Os dados documentais devolvidos são apenas contagens/gate; não incluem nomes, bytes, revisões ou observações de documentos. Apenas responsável recebe links para documentação.
Falhas de distribuição são lidas pela última decisão por versão da reserva, antes de filtrar NO_CANDIDATE; uma falha antiga não aparece após sucesso posterior. Canceladas são excluídas. Mostra primeiras 10 ocorrências e contagem completa. A ocupação anterior continua preservada pelo motor de dispatch.
Próxima saída = primeira não cancelada com início >= agora, dentro do dia selecionado. Não inclui saída já iniciada ou fora desse dia. Atualizar dados usa router.refresh(), mantendo a data/página; não confia no cache de navegação. Formulários GET de data/filtros reiniciam paginação. Não há polling.

## Navegação e permissões
Layout comum em todas as rotas /operator/[organizationId], com organização/papel, mudança de organização, navegação ativa por aria-current e salto para conteúdo. Hoje, Reservas, Agenda, Motoristas, Veículos, Serviços, Clientes, Relatórios e Configurações; Documentação apenas para owner. Atendimento e PWA continuam em sprints próprios, sem links sem destino.
Owner/dispatcher mantêm as ações autorizadas nos casos de uso existentes; viewer consulta e não recebe CTA de criação ou links para documentação. Driver não acede ao painel. SUPER_ADMIN precisa de vínculo como qualquer utilizador nesta área. Identidade e vínculo são novamente lidos no servidor em cada caso de uso; o layout não é usado como única autorização. Novas páginas redirecionam anónimos ao login e devolvem 404 para acesso indevido. Não há cache partilhado de dados de tenant.
UI responsiva: navegação lateral no computador, grelha no telemóvel, indicadores e reservas adaptáveis, tabelas de relatório com deslocamento interno e foco por teclado. CSS limitado ao shell do operador; Admin/login preservam estilo. Pequeno componente cliente apenas para caminho ativo/refresh; regras e consultas ficam no servidor.

## Consultas complementares
Reservas: pesquisa por serviço/nome/e-mail/id exato, estado e data de saída no fuso do operador; paginação preserva filtros. Links das pendências abrem a lista correspondente. ?new=1 abre formulário existente, com autorização e gates originais. Não altera criação/cancelamento.
Clientes: contactos preservados por reserva, com pesquisa nome/e-mail/telefone e páginas de 20. Não deduplica identidades ou cria CRM; a mesma pessoa pode aparecer mais de uma vez. Link abre a reserva exata no mesmo tenant. Sem edição, exclusão ou exportação em massa.
Relatórios: por data de saída local, de/até inclusivos, até 31 dias; omissão últimos 7 dias. Agrega ativas, atribuídas, canceladas, passageiros e valor previsto. Canceladas não entram em passageiros/valor; sem receita recebida ou viagens realizadas. Datas vazias têm linhas de zero. Valores em cêntimos bigint, formatados sem conversão monetária para ponto flutuante; moeda EUR do contrato atual. Tabela por dia e totais. Sem contabilidade/CSV/telemetria.
Configurações: nome, estado, fuso e idioma em leitura, links para agenda e documentação conforme papel. Sem bypass da aprovação, alterações de vínculo ou publicação.

## Arquitetura e modelo
Novo módulo de composição operator, API pública readOperatorShell/readOperatorDashboard/readOperatorCustomers/readOperatorReport em index.ts. Domínio puro valida datas/intervalos/paginação. Leituras agregadas usam RepeatableRead, tenant obrigatório e seleção mínima de campos; SQL parametrizado apenas para última decisão e agregação por dia local. Composição usa auth/compliance por APIs públicas, sem ciclos com os módulos de negócio.
bookings acrescenta filtros de leitura compatíveis com chamadas anteriores. availability expõe dayInterval pelo index.ts para a mesma semântica de dia. Intervalos semiabertos [início,fim), incluindo dias de 23/25 horas e viradas de data/fuso. Schema/migrations/lockfile não são alterados. Todas as consultas são sem efeitos: não geram audit, reservas, decisões ou eventos.

## Verificação
Local: lint, typecheck, 81 unitários e build aprovados. Testes PostgreSQL acrescentados para limites de dia/DST, próxima saída, contagens/paginação, última decisão, valores, canceladas, contactos, papéis, revogação, isolamento e ausência de efeitos. Chromium usa login real SMTP/Mailpit, navegação painel → reservas filtradas → clientes → reserva exata → relatório → refresh, viewport desktop/mobile, filtros inválidos e acesso indevido. Evidência da CI será registada após conclusão.

## Limites
Continua SANDBOX interno. Sem documentos individuais de recursos, aceite/execução do motorista, faturação, integrações de atendimento, relatórios de viagens realizadas ou publicação. Indicadores não concedem aptidão operacional. Sem merge/deploy ou configuração do Docker/WSL/Windows nesta entrega.
