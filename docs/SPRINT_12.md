# Sprint 12 — Alana Tools

## Entrega
Seis ferramentas executáveis no servidor, exercitáveis pelo responsável em Assistente Alana → Ferramentas de teste. Operação interna SANDBOX, sem modelo de IA, telefonia, WhatsApp, chaves externas ou endpoint público. A interface apresenta formulários e resultados reais, não uma conversa simulada. Somente o responsável ativo que iniciou a sessão pode executá-la; SUPER_ADMIN, outros responsáveis da organização e papéis operacionais não herdam a sessão.

## Contratos
`executeAssistantTool(organizationId, conversationId, callId, request)` é composição server-only. A organização, a sessão e o identificador de repetição pertencem ao contexto do adapter autenticado; nunca aos argumentos de uma ferramenta propostos por um modelo. A única entrada de ferramenta é `{tool,input}`, validada por união discriminada Zod estrita. Preço, recursos, ator, tenant, SQL, cancelamento e ferramentas desconhecidas são recusados.

| Ferramenta | Entrada | Resultado |
| --- | --- | --- |
| get_services | page opcional, 25 itens | Catálogo ativo paginado com nome, referência, versão, preço, moeda, regra por pessoa/grupo e idiomas. Sem copiar descrições extensas para todas as consultas. |
| get_service_details | serviceId | Detalhes atuais do serviço ativo do tenant, incluindo condições, recolha, capacidade e versão. |
| check_availability | serviceId, date/time locais, passengers, language | Resultado determinístico com motivo, instantes/fuso e alternativas. Não revela nomes/IDs de veículos ou motoristas, não ocupa recursos e retorna reservationConfirmed=false. |
| create_booking | Mesma consulta, serviceVersion e contacto do cliente; pickup opcional | Revalida versão do serviço, idioma configurado, documentos até à data do serviço, preço e disponibilidade; cria reserva/cliente/ocupação/evento, grant da sessão e audit atomicamente. Origem ASSISTANT_SANDBOX. |
| get_booking | bookingId | Recibo e estado atuais apenas de reserva criada pela própria sessão; sem contactos do cliente, notas, atribuições ou credenciais. Não basta adivinhar uma referência nem pertencer ao mesmo operador. |
| handoff_to_human | reason de 3–500 caracteres | Um pedido OPEN por sessão na fila privada do operador; notificationSent=false. Não envia email/WhatsApp, não diz que uma pessoa foi contactada e não muda o estado de uma reserva. |

`success=true` indica execução da ferramenta. Em disponibilidade, `available` pode ser falso; nenhuma consulta é confirmação de reserva. Falhas devolvem success=false e código/mensagem segura, sem dados de reserva parciais ou detalhes internos de banco. Falhas de autenticação continuam a recusar acesso. Um replay de criação consulta o estado atual da reserva: CANCELLED/COMPLETED não são uma nova confirmação.

## Sessões, versões e gates
Sessão privada com UUID, organização, autor, versão da assistente e validade de 24 horas. Limite persistente de 500 sessões por operador, sem exclusão automática. Até 100 pedidos de escrita por sessão; leituras não geram histórico/audit nem guardam os argumentos/resultados. Catálogo paginado e fila mostra os últimos 50 pedidos; não há transcrições de conversas ou cache partilhado.

Playbook novo `alana-tools-1` descreve as ferramentas e distingue registar atendimento de notificar alguém. Versões antigas do Sprint 11 continuam intactas; o responsável deve guardar explicitamente a configuração para gerar uma versão atual antes de testar. Não existe migração silenciosa do conteúdo antigo. Mudança de configuração invalida consultas operacionais/criação da sessão anterior e exige nova sessão; os recibos próprios e o pedido de ajuda continuam acessíveis até a sessão expirar.

Iniciar sessão, consultar catálogo/disponibilidade e criar reserva exigem aprovação documental válida em APPROVED/SANDBOX/CLIENT_REVIEW. LIVE não é liberado. Após suspensão/expiração documental, get_booking e handoff permanecem permitidos à identidade ativa da sessão para consultar os próprios pedidos e pedir ajuda. Expiração da sessão ou revogação da conta/membership bloqueia todas as ferramentas. O painel normal de reservas permanece a via autorizada para consultar reservas antigas.

## Transações e isolamento
Autenticar owner → lock OperatorProfile → revalidar User/membership → verificar sessão/TTL/versão/gates → executar. Ordem raiz → recursos preservada. API pública de bookings acrescenta createBookingInTransaction e projeção mínima de recibo, de uso interno no servidor; services fornece projeção de catálogo. Alana não recebe acesso direto ao banco nem expõe estes helpers ao cliente/modelo.

O caso de uso de booking existente foi extraído para composição transacional, conservando cálculo de preço, idempotência e locks, com revalidação de membership sob o lock. A criação via ferramenta inclui booking, ocupação, evento, vínculo de consulta e audit na mesma transação. Falha de persistência devolve erro e desfaz tudo, sem reserva órfã. A mesma proteção aplica-se à fila de atendimento.

callId UUID estável para retries, único por sessão, e hash SHA-256 do pedido normalizado; mesma chave/dados repete sem duplicar, payload diferente é rejeitado. O servidor gera a chave interna de booking dentro da transação; modelos não a escolhem. Replays são permitidos depois do limite de chamadas, mas não ultrapassam TTL, identidade ou gates de execução. Um novo callId é um novo pedido, não um retry: o futuro adapter de canal deve preservar o identificador original após falha de rede. O painel mantém o identificador até Novo pedido/recarregar.

serviceVersion é uma precondição de concorrência das condições consultadas, nunca uma forma de impor preço. Se o catálogo mudar, a criação devolve SERVICE_CHANGED antes de gravar. A UI vincula as versões do catálogo apresentado no servidor; é necessário atualizar os dados antes de aceitar as condições novas. A confirmação humana nesta etapa é o envio explícito do formulário interno. Um canal futuro terá de obter consentimento real do turista e não pode transformar notas ou uma afirmação do modelo em consentimento.

## Modelo físico
AssistantConversation referencia AssistantVersion por organização/versão e User; AssistantToolCall referencia conversa e booking pelo mesmo tenant e guarda apenas tool/hash/chave/referência; AssistantHandoff referencia conversa pelo mesmo tenant e preserva motivo privado. FKs RESTRICT, unicidade de callId por conversa e de handoff por conversa. CHECKs de validade da sessão, tipo de chamada/coerência de booking/hash e tamanho do motivo. Audit guarda IDs/versões/metadados, sem contactos ou motivo do cliente.

## Validação e aceite
Unitários: whitelist, entrada estrita, datas/idioma/contactos, limites e proibição de override. PostgreSQL: catálogo ativo/paginação/isolamento, sessão/owner/revogação, replay concorrente e payload alterado, último recurso, ausência de grant para reservas externas, recibo atual após cancelamento, alteração de condições/configuração, TTL, gates, limite e rollback de booking/handoff. Chromium/Mailpit: login real → sessão → catálogo/detalhes → disponibilidade sem reserva → reserva com preço real → retry sem duplicação → consulta própria → disponibilidade ocupada → fila interna; desktop/móvel e acesso estrangeiro.

Executar npm run check e CI com PostgreSQL/Chromium, incluindo regressões de booking após a extração transacional. Evidência final no relatório de entrega e PR. Sem deploy, alterações no Windows/WSL ou produção. Sprint 13 — Sandbox/QA exige novo pedido; integração de modelo/canais e avaliações reais continuam posteriores. As regras do prompt não constituem garantia contra prompt injection.
