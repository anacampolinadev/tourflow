# Sprint 15A — Preparação do piloto: Retell

## Escopo entregue
Ligação inicial de telefonia para preparar o piloto, não execução do piloto ou atendimento público. Administração associa um agente Retell dedicado ao operador, ativa/desativa a recepção de eventos e consulta a API para verificar o agente e o destino do webhook. Responsável consulta apenas a sua organização; outros papéis não recebem detalhes. Central Managed aponta para Ligação de telefonia e apresenta o estado observado sem chamar o fornecedor durante uma leitura.

Sem chave real, URL pública ou ativação no servidor, a ligação continua bloqueada. API verificada, evento recebido, conversação avaliada e autorização de produção são evidências diferentes. Não há botão para marcar manualmente uma ligação como saudável. A aplicação não inicia chamadas, envia mensagens, cria/publica agentes ou altera configurações remotas. Um rascunho de demonstração pode ser preparado separadamente na conta autorizada; isso não o liga automaticamente a um operador ou à API TourFlow.

## Contratos e segurança
- retell-sdk 6.2.8 fixado no lockfile. O adapter usa apenas GET do agente e verificação oficial da assinatura; API com timeout de 4s, sem retries automáticos e destino fixo do SDK. Não aceita baseURL, credencial ou endpoint do modelo/formulário.
- RETELL_INGRESS_ENABLED=false por defeito. RETELL_API_KEY apenas no servidor; usar a chave designada pelo fornecedor para assinaturas. RETELL_WEBHOOK_URL é HTTPS e caminho exato /api/webhooks/retell, sem credenciais/query/hash/porta. Não se deriva de Host nem se inventa URL pública.
- Associação agentId → organização é única e permanente pela API operacional, mesmo se desativada. Um agente não pode ser movido para outra empresa nem substituído silenciosamente. Evita que eventos antigos sejam atribuídos a outro tenant. Um só workspace/chave Retell por instalação nesta preparação; multi-workspace exige extensão própria.
- Configuração SUPER_ADMIN explícita, root lock, identidade revalidada, versão esperada, auditoria atómica. Corrida pelo mesmo agente em tenants diferentes é defendida pela unicidade SQL. Mudança de configuração invalida provas anteriores.
- Verificação em duas fases: lock/autorização/cooldown de 60s/bilhete persistido → consulta externa fora da transação → novo lock/revalidação e CAS do bilhete/versão → resultado/audit. Configuração alterada ou admin revogado durante a consulta nunca instala sucesso antigo. Interrupção deixa CHECKING sem prova, nunca API_OK.
- API_OK exige agente esperado, webhook_url exato e subscrição dos três eventos de ciclo (ou defaults documentados). A prova expira em 24h e liga-se a hash da chave+URL. Rotação de chave/URL invalida a prova imediatamente nas leituras e no ingresso; fingerprint não é devolvido à UI. Verificar uma ligação desativada não a ativa.

## Ingresso público de eventos
POST /api/webhooks/retell, runtime Node, sem sessão de browser ou tenant em argumentos. Endpoint fechado com 503 enquanto configuração global faltar/desativada. Content-Type JSON, limite real de 1 MiB mesmo sem Content-Length; assinatura x-retell-signature sobre bytes originais UTF-8 antes de interpretar JSON. SDK rejeita assinatura inválida, corpo alterado e timestamp fora da janela de cinco minutos. Respostas sem corpo/detalhes e no-store; nenhum log de payload ou erro privado.

Somente call_started/call_ended/call_analyzed são guardados. Outros eventos assinados são ignorados com 204, sem guardar transcrições incrementais. Payload conhecido inválido recebe 400; assinatura inválida 401; media inválida 415; excesso 413; falha temporária de banco/quota 503 para retry do fornecedor.

AgentId assinado resolve o tenant por associação persistida. organizationId/metadata/consent do payload não autorizam nada. Sob lock raiz, revalida enabled, prova fresca e fingerprint autenticado. Agente desconhecido, desativado ou não verificado é ignorado com 204 sem revelar vínculo. Eventos não são comandos operacionais e podem ser observados sob suspensão para diagnóstico; não concedem acesso ao owner ou às ferramentas.

Persiste apenas tipo, data de recepção e hash SHA-256 de agente+callId, nunca callId original, números, transcrição, recording_url, análise ou metadata. Chave única tenant/hash/tipo evita duplicados e corridas. Replay não atualiza lastEventAt. Eventos fora de ordem não regridem um estado de chamada porque nenhum estado de chamada é inferido. Recibo e lastEventAt são atómicos. Limite de 5000 recibos por operador; duplicados continuam a receber 204 no limite, novos recebem 503. UI alerta a administração para rever retenção; sem exclusão automática ou alegação de retenção de produção pronta.

Recibos não usam ator humano inventado no AuditLog. Configuração, verificações e leituras administrativas usam User/audit reais; notas, credenciais e respostas da API não entram em metadata. Leituras owner não escrevem.

## Preparação para conexão real
1. Usar um agente de voz de teste dedicado, em rascunho, sem número nem publicação. Instruções devem explicar SANDBOX e não afirmar operações enquanto as ferramentas estiverem desligadas. Nenhum teste pago é executado automaticamente.
2. Preparar um ambiente HTTPS e servidor PostgreSQL/SMTP em tarefa de deploy; esta entrega não faz deploy nem escolhe uma URL fictícia.
3. Guardar a chave designada pelo Retell e o destino HTTPS no gestor de segredos do ambiente. Nunca enviar chave em chat, Git, browser localStorage, query ou formulário do operador. Ativar a recepção global conscientemente nesse ambiente.
4. No agente Retell, configurar o destino exato e eventos de ciclo. Na administração TourFlow, associar o identificador, ativar recepção de teste e guardar; depois Verificar ligação à API.
5. Verificação da API não produz um evento. Uma chamada interna, com autorização de custos e privacidade própria, deverá produzir evento assinado; só então observar recepção real. Nenhum dado fictício é usado para marcar conexão real na instalação do utilizador.
6. Antes de turistas: ligar ferramentas com consentimento e identidade confiáveis, sincronizar/configurar Alana por operador, avaliar conversas reais, validar cliente, cumprir gates de documentação/GO LIVE e rever privacidade/retensão no fornecedor. Sem PASS de QA conversacional nesta entrega.

## Verificação técnica
Unitários exercitam SDK real de assinatura e transporte HTTP simulado: bytes exatos, timestamp, alteração/chave, tamanho/media/JSON, configuração e GET do agente. PostgreSQL exercita ingresso com assinatura real de fixture, tenancy, deduplicação concorrente, invalidação/TTL, cooldown, disputa de agente, revogação/admin, rollback e quota. Resposta do fornecedor é simulada nos testes de banco; não se apresenta essa fixture como conexão real. Chromium/Mailpit testa login → admin associa → credencial ausente continua bloqueada → owner lê sem escrita → conta estrangeira recusada, desktop/390px. Suite completa e resultados no relatório do PR.

## Fontes de implementação
- [Retell: webhook overview](https://docs.retellai.com/features/webhook-overview)
- [Retell: Get Voice Agent](https://docs.retellai.com/api-references/get-agent)
- [SDK oficial](https://github.com/RetellAI/retell-typescript-sdk)

Piloto real, WhatsApp/n8n, notificações, ferramentas externas de reserva, sincronização de prompt, onboarding público, publicação e GO LIVE permanecem pendentes. Probes QA existentes não chamam este adapter e continuam rollback-only; seus contratos não foram alterados.
