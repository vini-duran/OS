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

## Credencial do YouTube

O cofre do macOS não é transportado por Git nem por cópia da pasta. Na máquina nova, conecte novamente `YOUTUBE_DATA_API_KEYS` no painel do plugin: uma chave por linha, até oito chaves distintas.

O plugin usa a primeira chave disponível e só avança para a próxima se a YouTube Data API responder quota/rate limit. Não troca por erro de rede, credencial inválida ou configuração incorreta. Logs mostram apenas o total de rotações, nunca a chave usada.

## Configuração inicial do único bloco BUSCAR

| Campo | Valor inicial | Motivo |
| --- | --- | --- |
| Processo | Tema | O Radar produz evidência para o método de Tema. |
| Bloco | BUSCAR / Código | Consulta uma fonte externa e aplica filtros determinísticos. |
| Plugin | `com.norte-magnata.market-radar` | Capacidade `collect-youtube-market-snapshot`. |
| Consultas centrais | 4 consultas em português configuráveis | Cobertura inicial orientada a disciplina, foco, procrastinação e impulso. |
| Consultas niche-bending | vazias | Só serão incluídas após a estratégia própria ser aprovada. |
| Janela | 60 dias | Mantém sinais recentes sem forçar tendência diária. |
| Resultados por consulta | 8 | Limita a primeira coleta. |
| Duração mínima | 180 s | Remove Shorts e referências curtas. |
| Região / idioma | `BR` / `pt` | Prioriza resultados brasileiros e em português; o filtro local descarta idioma declarado incompatível. |
| Velocidade mínima | 30 views/dia | Evita referências sem tração operacional. |
| Aderência mínima | 1 termo da consulta | Evita resultado que só coincidiu superficialmente com a busca. |
| Formatos excluídos | podcast, entrevista, pregação, palestra motivacional | Evita formatos que não servem como referência inicial do método. |
| Simulação | desativada | A execução usa dados públicos reais. |

## Saídas esperadas

- `market_snapshot`: registros com ID e URL do vídeo, canal, consulta de origem, data, duração, visualizações, comentários, métricas derivadas e linha `core` ou `niche_bending`.
- `research_summary`: parâmetros, número de chamadas, total de vídeos e filtro aplicado.

O resultado não prova retenção, conversão, licença de mídia ou adequação visual. A próxima unidade do método transformará o snapshot em dossiês de tema e fará a validação de repetição no escopo correto.

## Registro da primeira execução real

- Data: `2026-08-19T01:41:29.567Z`.
- Consultas centrais: 4; niche-bending: 0.
- Janela: 60 dias; duração mínima: 180 segundos.
- Vídeos únicos encontrados: 23; registros aprovados pelo filtro: 6.
- Uso operacional: 4 chamadas `search.list`, 1 chamada `videos.list`, 0 rotações de chave.
- Resultado técnico: coleta concluída; o projeto aguarda a unidade editorial seguinte, pois o Radar não cria um Tema final.
- Revisão editorial: **não usar este primeiro snapshot para criar dossiês**. Os resultados misturaram referências genéricas e em espanhol/inglês; a próxima rodada deve ajustar consultas, idioma e critérios de aderência antes de seguir.

## Segunda execução real — filtros corrigidos

- Data: `2026-08-19T01:46:57.476Z`.
- Consultas centrais: 4; região `BR`; idioma preferencial `pt`; niche-bending: 0.
- Vídeos únicos encontrados: 24; após duração: 16; aprovados: 8.
- Uso operacional: 4 chamadas `search.list`, 1 chamada `videos.list`, 0 rotações de chave, sem erro técnico.
- Revisão: base factual utilizável para o próximo bloco de dossiê de Tema. Ela ainda não é uma decisão de tema e não deve ser publicada ou tratada como roteiro.

## Teste antes de mover

```sh
cd /caminho/para/contentflow-os
./desktop-runtime/node plugins/private/norte-magnata-market-radar/test.mjs
./desktop-runtime/node --import tsx tools/plugin-kit.ts check plugins/private/norte-magnata-market-radar
```

Os testes usam fixtures e mocks: não chamam YouTube nem usam uma chave real.
