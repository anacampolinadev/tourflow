# Modelo de dados — conceitual
Nenhuma tabela, enum de domínio, migration ou banco foi implementado no Sprint 00. Este documento orienta os próximos sprints e não representa um schema executável.

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
