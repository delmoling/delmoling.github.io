# Persistencia de dados da area ENSINO

GitHub Pages hospeda arquivos estaticos. O frontend nao grava dados no servidor por conta propria, entao a coleta depende de um endpoint externo.

## Arquitetura escolhida

1. Frontend estatico (GitHub Pages).
2. Backend de coleta em Supabase/Postgres.
3. Backup local no navegador (CSV/TXT) como fallback.

## Estado atual implementado

- Fluxo de autenticacao com dados demograficos e confirmacao de teclado fisico.
- Bloqueio de elegibilidade para smartphone no experimento.
- Versionamento explicito em sessao e resultados:
	- `protocolVersion`
	- `scoringVersion`
	- `schemaVersion`
- Exportacao local de resultados em `.csv` e `.txt`.
- Payload estruturado para backend com:
	- `session`
	- `summary`
	- `participantMetrics`
	- `blockMetrics`
	- `quality`
	- `trials`
	- `cleanedTrialsForRt`
- Pipeline de escore bruto no frontend:
	- limpeza de trials por RT
	- exclusao de participante por criterios de qualidade
	- calculo de metrica por bloco e interferencia Stroop
- Pipeline normativo dinamico no backend (Supabase Edge Function):
	- estratificacao por idade e escolaridade
	- atualizacao de `normative_stats` a cada nova sessao valida
	- retorno de z-score, percentil e T-score para feedback no frontend

## Configuracao do endpoint

Arquivo: `ensino/common.js`

- `CONFIG.webhookUrl`: URL do endpoint HTTP de ingestao.
- `CONFIG.webhookApiKey`: chave opcional para header `Authorization` e `apikey`.

Exemplo:

```js
const CONFIG = {
	webhookUrl: "https://SEU_ENDPOINT_DE_INGESTAO",
	webhookApiKey: "SUA_CHAVE_PUBLICA_OU_DE_SERVICO"
};
```

## Banco relacional (Supabase/Postgres)

Use o script em `docs/supabase-schema.sql` para criar estrutura inicial:

- `protocol_registry`
- `participant_sessions`
- `stroop_trials`
- `participant_metrics`
- `normative_stats`

## Norma dinamica (implementada)

Com o endpoint `stroop-ingest` ativo, o backend:

1. Seleciona participantes validos da mesma `protocol_version` + `scoring_version`.
2. Filtra por estrato de idade e escolaridade do participante atual.
3. Recalcula media e desvio-padrao por metrica principal.
4. Atualiza a tabela `normative_stats`.
5. Retorna para o frontend os indicadores individuais: `z_score`, `percentile` e `t_score`.
