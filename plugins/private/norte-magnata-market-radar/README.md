# Norte Magnata — Radar de Mercado

Plugin privado do ContentFlow OS para a pesquisa factual que antecede a criação de temas do Norte Magnata.

## Responsabilidade única

Ele consulta a YouTube Data API, remove vídeos abaixo da duração mínima, elimina IDs duplicados e executa um funil factual: até 10 mil candidatos → Top 20 com evidência aprofundada → Top 10 ranqueado → Top 5 entregue ao dossiê de Tema. Cada registro final preserva URL, ID, canal, consulta de origem, descrição pública, thumbnail, comentários amostrais e métricas públicas observadas.

A busca central usa `regionCode=BR` e `relevanceLanguage=pt`. Consultas adicionais podem ser fornecidas em `cross_language_queries`, uma por linha no formato `idioma|consulta` (por exemplo `en|discipline without motivation`); essas consultas não usam filtro regional, para alcançar referências internacionais. O filtro local preserva o idioma declarado e descarta somente incompatibilidade explícita, baixa velocidade, falta de termos e formatos excluídos.

Ele não cria temas, não aprova candidatos, não gera título/thumbnail/roteiro, não publica e não inicia nenhum outro método. Para o Top 20, ele coleta uma amostra de comentários públicos; não coleta transcrições completas nem infere qualidade de edição.

## Configuração no bloco

- `core_queries`: uma consulta central por linha.
- `niche_bending_queries`: uma consulta de nicho adjacente por linha. Mantenha vazia até a estratégia específica ser aprovada.
- `cross_language_queries`: consultas traduzidas no formato `idioma|consulta`; não traduz automaticamente e não copia o tema de origem.
- `max_search_pages`: páginas adicionais por consulta, com impacto direto na quota.
- `candidate_target`: alvo de candidatos únicos antes da deduplicação e dos filtros locais; o máximo é 10.000.
- `deep_review_limit`: Top 20 que recebe comentários, descrição, thumbnail e comparação limitada com o canal.
- `ranked_top_limit`: Top 10 após a revisão factual.
- `top_limit`: Top 5 final entregue ao dossiê editorial.
- `published_within_days`: janela máxima em dias.
- `max_results_per_query`: teto de resultados da busca por consulta.
- `min_duration_seconds`: filtro local de duração.
- `simulate`: teste explícito de contrato; não consulta a API nem produz dados de mercado.

A configuração de produção usa até 20 consultas centrais, 20 de niche-bending e consultas multilíngues, 50 resultados e cinco páginas por consulta. As três frentes são intercaladas para que referências estrangeiras participem da coleta mesmo se o alvo for atingido antes de esgotar todas as linhas. O alvo de 10 mil exige consultas suficientemente diversas e pode não ser alcançado se houver duplicação ou poucos resultados. Cada `search.list` consome quota; o plugin registra o consumo estimado e troca para a próxima chave somente após resposta explícita de quota/rate limit.

Para essa coleta ampla, o prazo declarado é de até 15 minutos. É uma única execução de leitura: não refaça a tentativa enquanto ela estiver em andamento e use **Cancelar execução** apenas se desejar abandonar aquela rodada.

## Credencial e dados enviados

Conecte uma lista em `YOUTUBE_DATA_API_KEYS`: cole de uma a oito chaves, uma por linha. A lista inteira fica em um único item do cofre local, nunca no Método, histórico, logs ou repositório.

A coleta começa pela primeira chave conectada. Somente uma resposta explícita de quota/rate limit da YouTube Data API marca aquela chave como indisponível naquela execução e avança para a próxima. Erros de autenticação, configuração, rede ou conteúdo não trocam chave. O resumo de execução informa chamadas estimadas e quantas rotações por quota ocorreram, sem expor qual chave foi usada.

São enviados à YouTube Data API apenas os parâmetros de consulta e a chave; o plugin não encaminha dados do canal, roteiro, biblioteca ou credenciais a outro serviço.

## Instalação de desenvolvimento

Na Central de Plugins, use **Usar pasta ao vivo** e selecione esta pasta. Revise o consentimento de rede e conecte a credencial. O plugin é apenas uma fonte de `BUSCAR`; ele deve ser usado em um projeto separado de Radar de Mercado, não repetido automaticamente dentro de cada produção de tema.

## Limites

O ranking é uma ordenação operacional por views/dia, desempenho relativo ao canal, comentários públicos e visualizações; não afirma qualidade editorial, retenção, conversão ou licença de mídia. A coleta não promete transcrição: a YouTube Data API não fornece automaticamente o texto completo de todos os vídeos públicos. Uma etapa posterior, explicitamente autorizada, pode analisar transcrições, thumbnail e edição dos cinco finalistas; ela não deve ser confundida com esta coleta factual.

## Teste

Use o Node 26 empacotado pelo ContentFlow:

```sh
/Users/viniciusduran/contentflow-os/desktop-runtime/node plugins/private/norte-magnata-market-radar/test.mjs
npm run plugin:kit -- check plugins/private/norte-magnata-market-radar
```
