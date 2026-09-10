# Norte Magnata — Radar de Mercado

Plugin privado do ContentFlow OS para a pesquisa factual que antecede a criação de temas do Norte Magnata.

## Responsabilidade única

Ele consulta a YouTube Data API, remove vídeos abaixo da duração mínima, elimina IDs duplicados e devolve um snapshot por vídeo. Cada registro preserva URL, ID, canal, consulta de origem, janela da coleta e métricas públicas observadas.

A busca inicial usa `regionCode=BR` e `relevanceLanguage=pt`. Consultas adicionais podem ser fornecidas em `cross_language_queries`, uma por linha no formato `idioma|consulta` (por exemplo `en|discipline without motivation`). O filtro local preserva o idioma declarado e descarta somente incompatibilidade explícita, baixa velocidade, falta de termos e formatos excluídos.

Ele não cria temas, não aprova candidatos, não gera título/thumbnail/roteiro, não coleta comentários, não publica e não inicia nenhum outro método.

## Configuração no bloco

- `core_queries`: uma consulta central por linha.
- `niche_bending_queries`: uma consulta de nicho adjacente por linha. Mantenha vazia até a estratégia específica ser aprovada.
- `cross_language_queries`: consultas traduzidas no formato `idioma|consulta`; não traduz automaticamente e não copia o tema de origem.
- `max_search_pages`: páginas adicionais por consulta, com impacto direto na quota.
- `published_within_days`: janela máxima em dias.
- `max_results_per_query`: teto de resultados da busca por consulta.
- `min_duration_seconds`: filtro local de duração.
- `simulate`: teste explícito de contrato; não consulta a API nem produz dados de mercado.

A configuração inicial tem quatro consultas centrais, até oito resultados por consulta e uma janela de 60 dias. Isso representa até quatro chamadas `search.list` (100 unidades de quota cada) e uma chamada `videos.list` (1 unidade) por execução. Não há cobrança do plugin; a quota e eventuais custos da conta Google pertencem ao titular.

## Credencial e dados enviados

Conecte uma lista em `YOUTUBE_DATA_API_KEYS`: cole de uma a oito chaves, uma por linha. A lista inteira fica em um único item do cofre local, nunca no Método, histórico, logs ou repositório.

A coleta começa pela primeira chave conectada. Somente uma resposta explícita de quota/rate limit da YouTube Data API marca aquela chave como indisponível naquela execução e avança para a próxima. Erros de autenticação, configuração, rede ou conteúdo não trocam chave. O resumo de execução informa chamadas estimadas e quantas rotações por quota ocorreram, sem expor qual chave foi usada.

São enviados à YouTube Data API apenas os parâmetros de consulta e a chave; o plugin não encaminha dados do canal, roteiro, biblioteca ou credenciais a outro serviço.

## Instalação de desenvolvimento

Na Central de Plugins, use **Usar pasta ao vivo** e selecione esta pasta. Revise o consentimento de rede e conecte a credencial. O plugin é apenas uma fonte de `BUSCAR`; ele deve ser usado em um projeto separado de Radar de Mercado, não repetido automaticamente dentro de cada produção de tema.

## Limites

O ranking é uma ordenação operacional por views/dia, desempenho relativo ao canal, comentários públicos e visualizações; não afirma qualidade editorial, retenção, conversão ou licença de mídia. A coleta não promete transcrição: a YouTube Data API não fornece automaticamente o texto completo de todos os vídeos públicos. A próxima peça do método transformará este snapshot em dossiês estruturados e validará repetição no escopo de tema.

## Teste

Use o Node 26 empacotado pelo ContentFlow:

```sh
/Users/viniciusduran/contentflow-os/desktop-runtime/node plugins/private/norte-magnata-market-radar/test.mjs
npm run plugin:kit -- check plugins/private/norte-magnata-market-radar
```
