# Sprint 05 — Agenda e disponibilidade

## Escopo
Agenda interna e cálculo determinístico para organização + serviço + data/hora local + passageiros + idioma opcional. Configura saídas semanais, veículos compatíveis, janelas de motoristas e bloqueios de recursos. Retorna disponibilidade de planeamento, motivo, intervalo real/bufferizado, candidatos livres e até três alternativas nos sete dias seguintes. Não cria, segura ou confirma reservas, não distribui serviços, não publica operadores e não implementa o Sprint 06.

## Regras de calendário
- Fuso IANA por organização, Europe/Lisbon por defeito. Saídas semanais seguem hora local, dia ISO (segunda=1) e período de datas inclusivo, até 366 dias. A duração vem do serviço cadastrado, sem aceitar duração do cliente.
- Pausas antes/depois de 0 a 240 minutos. Toda a ocupação deve caber nas janelas do motorista e ficar livre de bloqueios. O início da preparação também deve estar no futuro.
- ServiceVehicle associa explicitamente um veículo ao serviço dentro do tenant. Não se presume que qualquer veículo sirva para qualquer tour. Um grupo requer um veículo com capacidade suficiente; não se somam lugares de veículos diferentes.
- DriverAvailability define intervalos concretos, inclusive turnos noturnos. Janelas adjacentes podem cobrir a mesma ocupação; sobreposição de janelas ativas do mesmo motorista é rejeitada. ResourceBlock tem exatamente um motorista ou veículo e impede o uso durante manutenção, folga ou ocupação externa.
- Intervalos semiabertos [início, fim): limites que apenas se tocam não conflitam. Fim deve ser posterior ao início; máximo de 31 dias por janela/bloqueio. Saídas idênticas com períodos sobrepostos são rejeitadas.
- Datas/horas ambíguas ou inexistentes nas mudanças da hora são rejeitadas; o sistema não escolhe uma ocorrência silenciosamente. Instantes persistidos em TIMESTAMPTZ UTC; datas de vigência em DATE. Mudança do fuso conserva instantes de janelas/bloqueios, e passa a interpretar saídas semanais na nova zona.
- Limite de 500 entradas ativas de cada tipo por operador (saídas, associações, janelas e bloqueios). Desativação conserva histórico e liberta a quota; entradas antigas não são apagadas ou desativadas automaticamente.

## Motor e fronteiras
Domínio puro recebe snapshot e instante de consulta explícito. Verifica estado do operador, serviço ativo, capacidade, idioma do serviço, horário futuro/horizonte de 366 dias, saída prevista, veículo associado/ativo/com capacidade/sem bloqueio e motorista ACTIVE/com idioma/cobertura completa/sem bloqueio. Listas ordenadas por id para resultado determinístico; sem scoring, escolha de motorista ou IA.
Consulta usa transação RepeatableRead, organizationId em todas as leituras e snapshot que inclui até dez dias de intervalos para suportar alternativas e duração/buffers. Day view usa limites exatos da data no fuso, incluindo dias de 23/25 horas. Saídas e associações ativas aparecem como configuração; janelas/bloqueios aparecem no dia consultado.
Contrato retorna mode=PLANNING e checkedAt: não é promessa operacional, aptidão legal ou confirmação. Não verifica documentos individuais dos recursos nem cria ocupação de reserva. Aprovação documental/GO LIVE continuam obrigatórios; Sprint 06 deve reconsultar e validar os gates dentro da transação de reserva e incluir as ocupações persistidas, sem confiar num resultado anterior desta consulta.

## Persistência e segurança
Novas tabelas ServiceSchedule, ServiceVehicle, DriverAvailability e ResourceBlock com organizationId, FKs compostas para impedir referências entre tenants e cancelamento por active=false. CHECKs SQL defendem intervalo, alvo único e limites de saída. Não há exclusão física.
Organization.timeZone e OperatorProfile.calendarVersion. Toda alteração bloqueia raiz do operador, verifica o estado e atualiza condicionalmente calendarVersion; auditoria e gravação na mesma transação. Não altera version documental ou aprovação. Papéis: responsável configura tudo; dispatcher gere janelas/bloqueios e consulta; viewer consulta; DRIVER sem acesso geral. SUPER_ADMIN necessita de vínculo explícito. Escrita bloqueada em LEAD/CONTRACTED/RESTRICTED/SUSPENDED; consulta devolve indisponível nesses estados. Não há API anónima.
Audit logs guardam ids, versão e ativação, sem motivo do bloqueio, contactos ou detalhes pessoais. Query não grava audit ou reservas. Biblioteca @js-temporal/polyfill 0.5.1, fixa no lockfile, para fusos e DST; sem fornecedor externo, variável nova ou alteração do Windows.

## Interface e validação
/operator/[organizationId]/calendar: consulta, alternativas, saídas, associações, janelas, bloqueios e fuso. Formulários autenticados usam as mesmas regras dos serviços, com autorização refeita no servidor. Resultado não confirma reserva. Ações com versão desatualizada pedem atualização da página.
Local: lint, tipos, 68 testes unitários e build passaram. Auditoria de produção sem vulnerabilidades; os cinco alertas anteriores de lint continuam documentados. Integração PostgreSQL e Chromium em validação na CI, com serviços descartáveis. Docker local continua sem WSL; nenhum componente foi instalado. Sem merge ou deploy.
