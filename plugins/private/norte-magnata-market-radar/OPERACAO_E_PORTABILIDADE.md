# Operação e portabilidade — Radar de Mercado do Norte Magnata

## Propósito e limite

Este pacote realiza somente a coleta factual que antecede o método de Tema: consulta a YouTube Data API, aplica filtros locais e entrega registros rastreáveis. Ele não cria tema, título, roteiro, CTA ou publicação.

## Arquivos que viajam juntos

Copie a pasta completa abaixo para a nova máquina e mantenha os arquivos juntos:

```text
contentflow-os/plugins/private/norte-magnata-market-radar/
├── contentflow.plugin.json
├── handler.mjs
├── README.md
├── OPERACAO_E_PORTABILIDADE.md
├── test.mjs
├── fixtures/execution.json
└── LICENSE
```

O plugin é versionado no Git. A instalação atual é um vínculo de desenvolvimento para essa pasta; em outra máquina, abra **ContentFlow OS → Plugins → Instalar plugin → Usar pasta ao vivo** e selecione a cópia da pasta.

Não copie o banco do ContentFlow enquanto ele estiver aberto. Caso seja necessário transferir o estado operacional, feche o App primeiro e copie a pasta de dados do usuário conforme a documentação da versão instalada. O vínculo de desenvolvimento e as credenciais devem ser conferidos novamente na máquina nova.

### Limitação atual do arquivo de Método

Na versão atual do ContentFlow, o formato de exportação de Método não transporta o vínculo `pluginId/capabilityId`. Portanto, há dois caminhos corretos:

1. transferir a pasta de dados do ContentFlow com o App fechado: preserva o Método já configurado; ou
2. importar/recriar o bloco e selecionar manualmente `com.norte-magnata.market-radar` → `collect-youtube-market-snapshot`.

Essa limitação foi registrada aqui para evitar uma falsa promessa de portabilidade. O plugin, a configuração de consultas e as chaves do cofre são itens diferentes.

## Credenciais do YouTube e rodízio

O cofre do macOS não é transportado por Git nem por cópia da pasta. No painel do plugin, conecte as oito credenciais individuais: `YOUTUBE_API_KEY_PROJECT_01` até `YOUTUBE_API_KEY_PROJECT_08`. Esse é o padrão por projeto usado pelo ContentFlow.

O plugin usa a primeira chave disponível e só avança para a próxima se a YouTube Data API responder quota/rate limit. Não troca por erro de rede, credencial inválida ou configuração incorreta; erros transitórios de rede recebem até duas tentativas na mesma chave. Logs mostram apenas o total de rotações, nunca a chave usada.

`YOUTUBE_DATA_API_KEYS`, com uma chave por linha, continua aceito apenas como compatibilidade com instalações antigas. Não preencha os dois formatos com as mesmas chaves: use as credenciais `PROJECT_01` a `PROJECT_08` em instalações novas.

## Configuração inicial do único bloco BUSCAR

Os campos `core_queries`, `niche_bending_queries` e `excluded_title_terms` são áreas de texto multilinha no ContentFlow OS. Cada Enter cria um item; o plugin lê cada linha como uma consulta ou termo separado. Nunca cole itens sem quebra de linha.

| Campo | Valor inicial | Motivo |
| --- | --- | --- |
| Processo | Tema | O Radar produz evidência para o método de Tema. |
| Bloco | BUSCAR / Código | Consulta uma fonte externa e aplica filtros determinísticos. |
| Plugin | `com.norte-magnata.market-radar` | Capacidade `collect-youtube-market-snapshot`. |
| Consultas centrais | até 20 consultas em português | Cobrem a dor e o vocabulário do público do canal. |
| Consultas niche-bending | até 20 consultas de nichos de origem | Capturam padrões para adaptar, não temas para copiar. |
| Janela | 60 dias | Mantém sinais recentes sem forçar tendência diária. |
| Resultados por consulta | até 50 | Permite coleta ampla sem multiplicar análise profunda. |
| Alvo de candidatos | 10.000 únicos | É alvo, não garantia: duplicações e resultados indisponíveis reduzem o total. |
| Páginas por consulta | 5 | Cada página é uma chamada adicional da YouTube Data API; com 40 consultas de 50 resultados, cinco páginas permitem atingir o alvo antes da deduplicação. |
| Consultas multilíngues | `idioma|consulta`, uma por linha | Permite testar inglês, espanhol, francês, polonês, japonês etc. sem descartar automaticamente o idioma; as três frentes são intercaladas na coleta. |
| Revisão aprofundada | Top 20 | Coleta comentários públicos, descrição, thumbnail e compara, de forma limitada, o desempenho do canal. |
| Ranking intermediário | Top 10 | Ordenação factual após a revisão aprofundada. |
| Saída final | Top 5 | Dossiê final deve explicar gancho, promessa, estrutura, sinais de comentários e adaptação. |
| Duração mínima | 180 s | Remove Shorts e referências curtas. |
| Região / idioma | `BR` / `pt` + consultas multilíngues | A consulta multilíngue define `relevanceLanguage` e remove o filtro regional somente para aquela linha. |
| Velocidade mínima | 30 views/dia | Evita referências sem tração operacional. |
| Aderência mínima | 1 termo da consulta | Evita resultado que só coincidiu superficialmente com a busca. |
| Formatos excluídos | podcast, entrevista, pregação, palestra motivacional | Evita formatos que não servem como referência inicial do método. |
| Simulação | desativada | A execução usa dados públicos reais. |

## Saídas esperadas

- `market_snapshot`: Top 5 rastreável entregue ao dossiê, com ID/URL, canal, inscritos, relação views/inscritos, comparação limitada com o canal, descrição pública, amostra de comentários, URL da thumbnail, padrão de gancho e nota explicável 0–5.
- `research_summary`: parâmetros, número de chamadas, total de vídeos, Top 20, Top 10, Top 5 e filtro aplicado.

O resultado não prova retenção, conversão, licença de mídia ou adequação visual. Ele também não contém roteiro ou transcrição completa: isso exige uma etapa própria autorizada. A próxima unidade do método transforma o Top 5 em dossiês de tema e faz a validação de repetição no escopo correto.

## Registro da primeira execução real

- Data: `2026-08-19T01:41:29.567Z`.
- Consultas centrais: 4; niche-bending: 0.
- Janela: 60 dias; duração mínima: 180 segundos.
- Vídeos únicos encontrados: 23; registros aprovados pelo filtro: 6.
- Uso operacional: 4 chamadas `search.list`, 1 chamada `videos.list`, 0 rotações de chave.
- Resultado: coleta concluída; o projeto aguarda a unidade editorial seguinte, pois o Radar não cria um Tema final.

## Execuções históricas v0.4 — não reutilizar para decisão de tema

- Data: `2026-08-19T01:46:57.476Z`.
- Consultas centrais: 4; região `BR`; idioma preferencial `pt`; niche-bending: 0.
- Vídeos únicos encontrados: 24; após duração: 16; aprovados: 8.
- Uso operacional: 4 chamadas `search.list`, 1 chamada `videos.list`, 0 rotações de chave, sem erro técnico.
- Revisão: tecnicamente correta, porém insuficiente para niche-bending. Não tinha nichos de origem, comentários textuais, inscritos ou desempenho relativo. Não reutilizar como base de Tema.

## Estado operacional atual

Registros de execuções anteriores são históricos e não autorizam continuar o pipeline. A configuração vigente deve seguir `docs/CHANNEL_RESEARCH.md`: pesquisa manual do canal, brief aprovado e Tema curado com seleção humana.

O Radar v0.7 aceita consultas centrais, niche-bending e multilíngues. A configuração de produção é `candidate_target=10000`, `max_search_pages=5`, revisão aprofundada de 20, ranking Top 10 e saída final Top 5. Execute somente quando a decisão operacional autorizar Tema; os estados históricos não autorizam continuação.
## Teste antes de mover

```sh
cd /caminho/para/contentflow-os
./desktop-runtime/node plugins/private/norte-magnata-market-radar/test.mjs
./desktop-runtime/node --import tsx tools/plugin-kit.ts check plugins/private/norte-magnata-market-radar
```

Os testes usam fixtures e mocks: não chamam YouTube nem usam uma chave real.
