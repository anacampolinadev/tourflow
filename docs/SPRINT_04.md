# Sprint 04 — Operator Core

## Escopo
Cadastro interno de serviços, veículos e motoristas do mesmo operador. Inclui criação, leitura, edição, pesquisa, filtro ativo/não ativo e paginação de 25 registos. Não há exclusão física: serviços/veículos são desativados; motoristas passam por estados explícitos. Não implementa agenda, reservas, dispatch, white-label, IA ou o Sprint 05. Não publica operadores.

## Dados e contratos
- Service: nome, descrição, duração inteira de 1 a 1440 minutos, preço por pessoa ou grupo em cêntimos EUR (0 a 100000000), capacidade de 1 a 100 passageiros, encontro, recolha e regras, idiomas PT/EN/ES/DE e ativo. Recolha requer regras. Inativo por defeito; ativação é escolha explícita do gestor. Não existe cálculo de preço de reserva nesta etapa.
- Vehicle: nome, tipo (jipe, automóvel, carrinha, minibus, autocarro), matrícula normalizada, capacidade de passageiros sem motorista (1 a 100), até 10 características distintas e ativo. Inativo por defeito. Normalização remove espaços/hífens e converte matrícula para maiúsculas, sem afirmar validação legal de um formato nacional. Matrícula única no operador, reutilizável em outro operador.
- Driver: nome, telefone, e-mail normalizado e único no operador, idiomas e estado. Cadastro começa PENDING; não cria User, vínculo, convite ou envio de e-mail. INVITED é reservado para uma etapa futura. Edição de contactos não aceita status; uma ação separada usa a máquina de estados. PENDING pode passar a ACTIVE/INACTIVE/SUSPENDED; ACTIVE a INACTIVE/SUSPENDED; INACTIVE a PENDING/ACTIVE/SUSPENDED; SUSPENDED só volta a PENDING. Recuperação de suspensão não ativa diretamente.
- Todos os registos têm organizationId, version, createdAt/updatedAt e chave composta (id, organizationId), preparada para referências futuras no mesmo tenant. Identificadores nunca são consultados isoladamente no domínio operacional.

## Acesso e transações
Responsável: gere os três cadastros. Dispatcher: lê serviços e gere veículos/motoristas; não altera preços ou serviços. Viewer: consulta cadastros, incluindo contactos de motoristas, sem escrita. DRIVER: sem acesso às listas gerais. SUPER_ADMIN não recebe acesso implícito às rotas do operador: necessita de vínculo explícito. Conta e vínculo ativo são verificados no servidor em cada pedido/ação.
Preparação permitida desde ONBOARDING. Escrita bloqueada em LEAD, CONTRACTED, RESTRICTED e SUSPENDED; leitura autorizada continua disponível. Cadastro ativo não confirma disponibilidade, documentos ou habilitação para executar um serviço. Gates documentais e de publicação permanecem separados e obrigatórios.
Cada escrita bloqueia a linha OperatorProfile com SELECT FOR UPDATE parametrizado, verifica o estado do operador, faz atualização condicional da versão do recurso e grava audit log na mesma transação. Ordem de bloqueio: raiz do operador → recurso. Conflito, duplicidade ou falha reverte toda a transação. O bloqueio não incrementa a versão documental nem altera aprovação/compliance. Assim uma suspensão e uma escrita de cadastro não passam uma pela outra durante a transação.
Audit metadata contém identificadores, versões e transições, sem preços, contactos, descrições, regras de recolha ou dados dos documentos.

## Interface
/operator/[organizationId]/services, /vehicles e /drivers: lista, filtros e páginas new/[resourceId]. Um segmento dinâmico validado partilha apenas a composição da interface e dos formulários; os casos de uso e schemas permanecem em services, vehicles e drivers, com APIs públicas separadas. Documents mantém sua rota estática e seu fluxo próprio. Formulários têm labels, estado pendente e mensagens de erro, e as permissões são novamente verificadas pelos serviços.

## Verificação
Local: lint sem avisos, tipos, 51 unitários e build passaram. Integração PostgreSQL e Chromium são executados pela CI em serviços descartáveis. Testes novos cobrem dinheiro, idiomas, capacidades, recolha, estados, tenant, papéis, duplicidade, revogação, concorrência, auditoria e paginação. Navegador: login real por e-mail, cadastro/edição dos três recursos, filtros, estados, modo de leitura, dispatcher, acesso indevido e largura mobile.
Aprovado na [CI 38976279662](https://github.com/anacampolinadev/tourflow/actions/runs/38976279662), implementação cee3d83: instalação limpa, migrações incrementais, comparação banco/schema sem diferenças, lint, tipos, build, 51 testes unitários, 30 de integração PostgreSQL e 6 de navegador Chromium. Os 87 testes incluem os sprints anteriores. Artefacto browser-test-results: operator-core.png e operator-core-mobile.png; o cenário do responsável também verifica ausência de erros JavaScript no navegador. Sem deploy ou componentes novos no Windows; Docker local continua indisponível por ausência de WSL.

PR #3 baseado no PR #2, ambos para revisão. Integrar os PRs #1 e #2 antes deste PR. O Sprint 05 requer nova autorização; esta entrega não fez merge ou deploy.
