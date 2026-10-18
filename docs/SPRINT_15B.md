# Preparação 15B — Ambiente do piloto

## Escopo implementado

Diagnóstico de preparação do ambiente e teste do build em modo de produção. Sem alteração de schema, regras de negócio, autenticação ou autorização. O piloto real continua pendente; reservas permanecem SANDBOX e os três gates humanos continuam obrigatórios.

- `npm run pilot:check -- --config-only`: valida formato e requisitos mínimos, sem ligar a serviços. Falha com configuração incompleta e não imprime valores.
- `npm run pilot:check`: exige configuração válida, verifica PostgreSQL em transação READ ONLY, TLS, btree_gist, histórico/checksums exatos das migrations e existência de SUPER_ADMIN ativo. Só depois autentica no SMTP com TLS obrigatório, usando verify(), sem enviar mensagem. Não aplica migrations nem cria utilizadores.
- `npm run pilot:smoke`: depois do build, inicia next start numa porta loopback temporária com credenciais descartáveis e banco inacessível. Verifica páginas públicas, origem canónica da autenticação, recusa da origem incorreta, redirecionamento privado e webhook fechado. Encerra o processo. A normalização de loopback para localhost é comportamento do NextURL; não altera o guard da aplicação.

## Configuração do piloto

Usar Node 24 e recursos próprios do piloto. `TOURFLOW_ENVIRONMENT=pilot` é uma declaração explícita, não prova que o banco esteja isolado: confirmar conta/projeto/base antes de executar migrations ou bootstrap.

| Variável | Requisito |
|---|---|
| AUTH_URL | Origem HTTPS pública estável, sem caminho/query/credenciais/porta |
| AUTH_SECRET | Gerado criptograficamente, próprio deste ambiente, pelo menos 32 caracteres |
| DATABASE_URL | PostgreSQL dedicado, autenticação e sslmode=verify-full; sem opções para enfraquecer TLS |
| EMAIL_SERVER_HOST/PORT | SMTP público, TLS 465 ou STARTTLS 587 |
| EMAIL_SERVER_USER/PASSWORD | Credenciais próprias, guardadas no gestor de segredos |
| EMAIL_FROM | Endereço cujo domínio/remetente serão validados no fornecedor |
| RETELL_INGRESS_ENABLED | false nesta publicação inicial |

O diagnóstico carrega `.env` por dotenv e respeita variáveis já injetadas. Para outro ficheiro privado no Node 24, usar `node --env-file=.env.pilot --import tsx scripts/pilot/check.ts`. Não passar segredos como argumentos, não versionar ficheiros privados e não copiar valores para relatórios. Uma futura ligação do Vercel deve manter esses valores apenas no ambiente preview do projeto de piloto.

As conexões exigem validação de certificados; o teste não reduz TLS para aprovar fixtures locais. PostgreSQL local sem TLS e Mailpit sem STARTTLS são deliberadamente considerados inadequados para o piloto. Diagnósticos só devolvem códigos/contagens; falhas do fornecedor não são impressas.

## Ordem de preparação real

1. Instalar/ligar PostgreSQL e SMTP reais, confirmar isolamento e condições do fornecedor. Manter a arquitetura Prisma/pg existente; não trocar ORM/autenticação por instalar um serviço.
2. Fixar a origem HTTPS canónica e guardar segredos no ambiente preview. Confirmar acesso protegido para o grupo de testes. Não usar o URL de um deployment efémero sem estabilizar AUTH_URL.
3. Executar primeiro config-only. Confirmar explicitamente o destino antes de aplicar migrations existentes e executar o bootstrap administrativo de uso único. Esses comandos escrevem; pilot:check não os executa.
4. Executar o diagnóstico completo. Um resultado deploymentReady=true prova apenas os requisitos inspecionados; não aprova remetente, entrega, proxy HTTPS, login no navegador ou produção.
5. Publicar um preview protegido do commit revisto. Testar a cadeia real navegador → API → banco → e-mail → login, incluindo expiração/reutilização do link. Não expor um diagnóstico com informação de infraestrutura por HTTP.
6. Somente numa etapa posterior validar telefonia real, ferramentas, consentimento e QA conversacional. API/eventos Retell não autorizam GO LIVE.

## Estado externo observado

Projeto de testes `tourflow-pilot` criado no Vercel, Node 24, proteção de preview ativada, sem deployment/domínio e sem ligação Git automática. Build configurado como `npm run pilot:check && npm run build`, para falhar antes de publicar configuração incompleta. Flags preview pilot/telefonia fechada criadas. Não existem PostgreSQL/SMTP ligados; não foram geradas credenciais nem aplicadas migrations remotas. Identificadores privados e provas externas ficam no relatório de entrega, fora do repositório público.

Provisionamento e testes reais estão pendentes; não apresentar mocks, CI descartável, formato válido ou configuração do painel como integração operacional. Previews protegidos também bloqueiam callbacks externos sem configuração própria — não abrir o webhook público nem remover proteção automaticamente.

## Verificação

CI mantém PostgreSQL/Mailpit descartáveis, migrations/drift, lint/tipos/unitários/build, integração e navegador. Acrescenta smoke do build. Testes novos verificam configuração insegura, redação de segredos, migrations alteradas/ausentes e diagnósticos sem escrita ou envio. Resultados exatos constam no relatório; nenhuma suite substitui o ensaio real do ambiente.
