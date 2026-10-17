# Sprint 11 — Alana Core

## Entrega
Configuração privada por operador em Configurações → Assistente Alana: nome do operador no atendimento, nome externo da assistente, tom fechado, idiomas PT/EN/ES/DE, horário de atendimento, políticas, FAQs e contactos internos de encaminhamento. Apenas OPERATOR_OWNER ativo da própria organização pode consultar ou alterar; SUPER_ADMIN sem membership não tem acesso implícito. Contactos podem ficar vazios durante a preparação; indicar responsável exige pelo menos telefone ou e-mail.

Inicialização explícita e repetível cria perfil e versão 1, usando a marca atual (ou nome da organização), Alana, tom acolhedor e idioma principal do operador. Nova chamada não sobrescreve personalizações. Leituras não criam dados. Alterações da marca posteriores não modificam silenciosamente as versões da assistente.

## Núcleo e conhecimento
Playbook central `alana-core-1` versionado em código: isolamento, idiomas, proibição de inventar dados, preços ou disponibilidade, confirmação só após `create_booking success=true`, encaminhamento somente após sucesso real e preservação dos três gates humanos. O operador não recebe um campo de instruções livres para alterar o playbook. Políticas e FAQs são dados de referência de menor confiança serializados como JSON, nunca código/HTML executado. Os contactos internos ficam no snapshot privado de configuração, fora das instruções destinadas ao modelo e dos metadados de auditoria.

Catálogo, preços, recolhas, disponibilidade, veículos, motoristas e reservas não são copiados para o prompt. A fonte operacional permanece nos módulos existentes e será consultada por ferramentas no Sprint 12. Notas contraditórias não conferem autoridade para modificar preços/condições.

Este sprint compõe e pré-visualiza instruções; não executa inferência ou conversas simuladas. Não há AI SDK, modelo, credencial, cobrança, ferramentas, endpoint público de chat, Retell, WhatsApp ou mensagens enviadas. A separação de confiança no prompt é preparação arquitetural, não evidência de resistência de um modelo a prompt injection: avaliações reais dependem da integração e do QA posteriores.

## Persistência e concorrência
AssistantProfile por organização, com versão atual. AssistantVersion guarda snapshot de configuração, instruções, versão do playbook e data. PK composta por organização/versão e FK RESTRICT; versões são imutáveis pela API, consultáveis e não têm edição/restauro/exclusão. Limite de 100 versões, sem apagar histórico automaticamente. CHECKs limitam versões, formato JSON e bytes; schemas Zod estritos limitam campos e rejeitam chaves extras. Nenhuma alteração de schema anterior é destrutiva.

Escritas: autorizar owner → lock OperatorProfile → revalidar membership/User → gate documental existente → CAS de versão → snapshot + audit na mesma transação ReadCommitted. A inicialização concorrente cria uma só configuração. Falha de audit desfaz perfil e snapshot. Atualização de contacto ou notas não modifica serviços, reservas, compromissos, status ou versão documental da raiz. Consultas de histórico usam RepeatableRead, sem cache partilhado.

Escritas exigem APPROVED/SANDBOX/CLIENT_REVIEW com aprovação/documentação válida; suspensão, restrição, expiração e LIVE são recusados. Ler versões permanece possível ao responsável durante preparação/revisão, sem habilitar operação pública. Criar configuração não marca assistente treinada, não confirma validação do cliente e não autoriza GO LIVE.

## Aceite e verificação
- Owner prepara, personaliza, corrige formulário inválido sem perder rascunho e consulta versões antigas em leitura; outro operador mantém configuração independente.
- Acesso anónimo, estrangeiro, viewer, dispatcher, motorista, conta desativada e membership revogada são recusados nos casos de uso.
- Testes PostgreSQL cobrem geração concorrente/repetida, CAS, isolamento, gates, limite, ausência de escrita em leitura, snapshots, redação de contactos e rollback de audit.
- Unitários verificam entradas inválidas e serialização do conhecimento sem promoção ao playbook. Chromium cobre login por e-mail real, persistência, histórico, acesso e layout desktop/móvel sem erros de consola.
- `npm run check`: lint, tipos, unitários e build. CI aplica migrations, verifica drift, executa check, integração PostgreSQL e E2E Chromium/Mailpit. Evidência final e contagens ficam no relatório de entrega do sprint e no PR.

## Próximo sprint
Sprint 12 — Alana Tools exige nova autorização. Deve consumir contexto do servidor, nunca organizationId livre do modelo; ferramentas com validação, RBAC, gates e idempotência permanecem autoridade. Não reutilizar snapshots de instruções como autorização nem expor contactos internos a turistas. Novas versões do playbook precisam de revalidação explícita; snapshots antigos não se atualizam silenciosamente.
