# Modelo de dados — conceitual
Nenhuma tabela, enum de domínio, migration ou banco foi implementado no Sprint 00. Os Sprints 01/02 acrescentam schema e migração em prisma/, aplicados e validados em PostgreSQL descartável pela CI. A especificação conceitual abaixo continua orientando os sprints futuros.

## Modelo físico 01/02
User (global, active e platformRole), Account, Session e VerificationToken compatíveis com Auth.js; LoginThrottle (janela atômica por e-mail com chave HMAC, sem e-mail em claro); Organization; OrganizationMember (role e active, único por organização/utilizador); OperatorProfile (contatos, plano, mensalidade em cêntimos, estado e version para concorrência); AuditLog (ator obrigatório e organização opcional apenas para eventos de plataforma).
Organização não é criada implicitamente no login. SUPER_ADMIN é papel global separado dos quatro papéis de vínculo. O responsável inicial recebe vínculo OPERATOR_OWNER no cadastro administrativo; editar contacto não transfere acesso. Referências operacionais restantes serão adicionadas nos respectivos sprints. Sessões expiram em 8h; links em 15 minutos, token de uso único gerido pelo adapter Auth.js. As verificações de utilizador/vínculo ativo são feitas novamente no servidor por pedido.

## Identidade
User: identidade global.
Organization: raiz do tenant.
OrganizationMember: vínculo User ↔ Organization, com unicidade por par e papel dentro da organização.
Papéis previstos: SUPER_ADMIN (escopo de plataforma), OPERATOR_OWNER, OPERATOR_DISPATCHER, OPERATOR_VIEWER e DRIVER. A modelagem exata da permissão global será definida no Sprint 01.

## Entidades previstas por módulo
| Módulo | Entidades e relações principais |
| --- | --- |
| tenants | Organization → OperatorProfile, BrandProfile |
| compliance | Organization → ComplianceDocument → ComplianceReview |
| services | Organization → Service → ServiceSchedule |
| drivers | Organization → Driver → DriverDocument, DriverAvailability; vínculo futuro com identidade |
| vehicles | Organization → Vehicle → VehicleDocument |
| availability | Consulta agendas, serviços, recursos e reservas; estratégia de bloqueio definida no Sprint 05 |
| bookings | Organization → Customer, Booking; Booking → BookingPassenger, BookingEvent; referências a serviço, cliente, motorista e veículo |
| dispatch | Booking → DispatchDecision, com motorista, fatores, score e justificativa |
| assistants | Organization → AssistantProfile → AssistantVersion; Conversation → Handoff; Integration e HealthCheck |
| audit | Organization → AuditLog; eventos de plataforma terão escopo explícito |

## Regras de persistência futuras
Toda entidade operacional carrega organizationId, inclusive filhos e eventos. User é global; Organization é a raiz. Garantir que referências pertençam ao mesmo tenant por validação de domínio e constraints compostas quando aplicável. Consultas por id isolado são proibidas.
Datas persistidas em UTC; fuso da organização para horários locais e recorrências. Valores monetários em unidades menores inteiras com moeda explícita. Não armazenar segredos ou documentos sensíveis em logs.
Ações críticas precisam de chave de idempotência com unicidade no tenant. Schema, índices, retenção e concorrência devem ser especificados e testados no sprint responsável.

## Estados previstos, sem implementação
Operator: LEAD, CONTRACTED, ONBOARDING, DOCS_PENDING, UNDER_REVIEW, APPROVED, GENERATING, ASSISTANT_TRAINING, SANDBOX, CLIENT_REVIEW, LIVE, RESTRICTED, SUSPENDED.
Booking: DRAFT, PENDING, CONFIRMED, DISPATCHING, ASSIGNED, DRIVER_ACCEPTED, IN_PROGRESS, COMPLETED, CANCELLED, NO_SHOW.
Driver: INVITED, PENDING, ACTIVE, INACTIVE, SUSPENDED.
Document: PENDING, UNDER_REVIEW, APPROVED, REJECTED, EXPIRING, EXPIRED.
As transições e precondições serão definidas como funções de domínio no sprint responsável, nunca como atualizações arbitrárias.

## Fora desta fase
Subscription, UsageRecord, Invoice e entidades de Network/marketplace (Affiliate, Referral, Transaction, Payout, Commission).

## Modelo físico 03
ComplianceRequirement pertence à organização; título, exigência de validade, ativo. Desativação preserva histórico. ComplianceDocument referencia (requirementId, organizationId), tem revisão única por requisito, metadados, SHA-256 e bytes privados; limites de arquivo impostos dentro da transação que bloqueia a raiz do operador. ComplianceReview referencia (documentId, organizationId), revisor e decisão imutável por versão, com observação privada quando rejeitado. FKs compostas impedem associação entre tenants. Não são criados requisitos legais predefinidos.
OperatorProfile acrescenta approvedAt, approvedById e complianceNote. Aprovação explícita só após revisão de todos os documentos atuais; reabertura limpa marcadores atuais, preservando eventos auditados. expiresOn é DATE inclusivo em UTC. Expirado é apresentação calculada e precondição dos gates; não há job que altere o estado persistido automaticamente. Regras completas em [SPRINT_03.md](SPRINT_03.md).

## Modelo físico 04
Service, Vehicle e Driver pertencem a Organization, com organizationId obrigatório, FK RESTRICT, unicidade composta (id, organizationId), version e timestamps. Service usa PricingType PER_PERSON/PER_GROUP, basePriceCents inteiro e moeda EUR; inclui encontro, recolha, idiomas e ativo. Vehicle usa VehicleType e matrícula canónica única por organização. Driver usa e-mail canónico único por organização e DriverStatus; não está ligado a User nesta fase e não concede acesso. Nenhum vínculo serviço/veículo/motorista ou ServiceSchedule foi antecipado.
Sem DELETE operacional; desativação e estados mantêm os registos para futuras reservas. Idiomas são arrays limitados a PT/EN/ES/DE. Limites, transições e semântica exata em [SPRINT_04.md](SPRINT_04.md).

## Modelo físico 05
Organization acrescenta timeZone (Europe/Lisbon); OperatorProfile acrescenta calendarVersion. ServiceSchedule referencia serviço no mesmo tenant e guarda dia ISO, minuto de saída, datas inclusivas, pausas e active. ServiceVehicle liga serviço e veículo por FKs compostas, par único por organização e active.
DriverAvailability referencia motorista por (id, organizationId), intervalo UTC TIMESTAMPTZ, active e createdAt. ResourceBlock referencia exatamente um motorista/veículo do tenant, intervalo UTC, motivo privado e active. CHECKs SQL defendem fim posterior ao início, alvo exclusivo e limites do schedule. Cancelamento preserva dados; eventos auditados guardam id e estado, sem motivos privados. Não foi antecipada uma tabela de Booking ou ocupação de reserva. Ver [SPRINT_05.md](SPRINT_05.md).

## Modelo físico 06
Customer é snapshot privado por reserva, associado por tenant. Booking referencia Service/Customer por FKs compostas; unicidade tenant/chave de idempotência, hash do payload, modo SANDBOX, estados CONFIRMED/CANCELLED, versão, passageiros, idioma, instantes/fuso, preço e condições preservados. BookingOccupancy referencia Booking/Vehicle/Driver no mesmo tenant, intervalo com pausas e releasedAt; EXCLUDE com btree_gist impede sobreposição por cada recurso. BookingEvent preserva transições confirmada/cancelada por tenant, sem contactos/notas. CHECKs de intervalo/valores complementam schemas Zod; sem manifesto nominal nesta fase. Ver [Sprint 06](SPRINT_06.md).

## Modelo físico 07
BookingStatus acrescenta ASSIGNED, também usado no BookingEvent. DispatchDecision referencia reserva/veículo/motorista por FKs compostas de tenant e ator User; unicidade tenant/chave, hash, versão resultante, modo AUTO/MANUAL, resultado ASSIGNED/NO_CANDIDATE, score em pontos-base, motivo privado e JSON de fatores/candidatos/janela/seleção. CHECKs defendem resultado/par/score e versão positiva. Occupancy continua única por reserva, atualizada atomicamente sem janela de liberação; decisões anteriores permanecem imutáveis nos casos de uso. Ver [Sprint 07](SPRINT_07.md).

## Projeções 08
Sem novas tabelas, enum, migration ou alteração de dados persistidos. Consultas compõem Booking/Customer/Occupancy/DispatchDecision/DriverAvailability e estado documental existente. Indicadores usam intervalos locais semiabertos e última decisão por versão; relatórios agrupam saída no fuso, excluem canceladas dos valores e mantêm cêntimos bigint. Customer continua snapshot por reserva. Ver [Sprint 08](SPRINT_08.md).

## Modelo físico 09
Driver.userId opcional com FK User e unique(organizationId,userId). DriverAction preserva organização/reserva/motorista/ator, chave/hash, versão, tipo e data, com FKs compostas de tenant para reserva/motorista, unicidade por organização/chave e CHECK versão positiva. BookingStatus/BookingEvent recebem DRIVER_ACCEPTED, DRIVER_DECLINED, ARRIVED, IN_PROGRESS, COMPLETED. Ocupações e decisões anteriores preservadas. Sem dados de localização, notificações ou armazenamento offline. Ver [Sprint 09](SPRINT_09.md).

## Modelo físico 10
BrandProfile tem organizationId como PK/FK Organization RESTRICT, nome/cores, logo opcional/hasLogo, ícones PNG192/512, versão e timestamps. CHECKs de identidade e limites/coerência dos bytes; seleção mínima de campos nas consultas de identidade. Atualização compare-and-swap e auditoria no lock da raiz; geração idempotente por organização. Não modifica status/version de OperatorProfile, identidade User ou snapshots de reserva. Ver [Sprint 10](SPRINT_10.md).

## Modelo físico 11
AssistantProfile: organizationId PK/FK RESTRICT, versão atual, datas. AssistantVersion: PK (organizationId,version), FK RESTRICT para perfil, configuration JSONB, instructions TEXT, playbookVersion e data. Snapshot imutável pela API, sem exclusão/restauro; limite de 100 versões. CHECKs de versão/formato/bytes complementam Zod estrito. Contactos privados no snapshot, nunca em audit/prompt. Nenhuma alteração de status ou versão de OperatorProfile. Ver [Sprint 11](SPRINT_11.md).
