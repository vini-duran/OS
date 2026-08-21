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
| Alvo de candidatos | até 10.000 únicos | Use paginação somente com quota disponível; o filtro local vem antes da análise aprofundada. |
| Páginas por consulta | 1–5 | Cada página é uma chamada adicional da YouTube Data API. |
| Consultas multilíngues | `idioma|consulta`, uma por linha | Permite testar inglês, espanhol, francês, polonês, japonês etc. sem descartar automaticamente o idioma. |
| Revisão aprofundada | Top 20 recomendado | Coleta comentários e compara, de forma limitada, o desempenho do canal. |
| Saída final | Top 5 recomendado | Dossiê final deve explicar gancho, promessa, estrutura, sinais de comentários e adaptação. |
| Duração mínima | 180 s | Remove Shorts e referências curtas. |
| Região / idioma | `BR` / `pt` + consultas multilíngues | A consulta multilíngue define `relevanceLanguage` para aquela linha. |
| Velocidade mínima | 30 views/dia | Evita referências sem tração operacional. |
| Aderência mínima | 1 termo da consulta | Evita resultado que só coincidiu superficialmente com a busca. |
| Formatos excluídos | podcast, entrevista, pregação, palestra motivacional | Evita formatos que não servem como referência inicial do método. |
| Simulação | desativada | A execução usa dados públicos reais. |

## Saídas esperadas

- `market_snapshot`: Top 10 rastreável com ID/URL, canal, inscritos, relação views/inscritos, comparação limitada com o canal, amostra de comentários, URL da thumbnail, padrão de gancho e nota explicável 0–5.
- `research_summary`: parâmetros, número de chamadas, total de vídeos e filtro aplicado.

O resultado não prova retenção, conversão, licença de mídia ou adequação visual. A próxima unidade do método transformará o snapshot em dossiês de tema e fará a validação de repetição no escopo correto.

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

## Método Tema histórico configurado após o Radar

O método do canal **Norte Magnata** agora tem três blocos lineares, cada qual com uma responsabilidade única:

| Ordem | Bloco | Executor | Resultado |
| --- | --- | --- | --- |
| 1 | BUSCAR — Radar factual do YouTube | Código | `market_snapshot` e resumo rastreável. |
| 2 | CRIAR — Dossiê de tema rastreável | OpenAI `gpt-5.6-terra` | `theme` e `theme_dossier`; não cria título, roteiro, thumbnail ou CTA. |
| 3 | VALIDAR — Evidência e diferenciação | OpenAI `gpt-5.6-terra` | decisão e relatório contra evidências, especificidade, honestidade e não cópia. |

Não há bloco `ESCOLHER` ainda porque esta primeira versão não seleciona item preexistente da Biblioteca Estratégica. Ele será incluído somente quando houver uma coleção editorial real para escolher; não deve ser inserido como etapa vazia.

O resultado histórico de “disciplina sem motivação” é somente um teste. A decisão operacional registrada no repositório Automation Magnata permanece **TEMA**; o método não está autorizado a avançar sozinho para Título.

## Radar v0.6 — próximo teste manual autorizado

1. Preencha consultas centrais e consultas de niche-bending, uma por linha, até vinte em cada grupo. Não use uma consulta política ou uma afirmação factual sem uma fonte que permita verificação posterior.
2. Configure `max_results_per_query=50`, `max_search_pages=1` inicialmente, `candidate_target=1000`, `deep_review_limit=20`, `top_limit=5` e `minimum_niche_bending_top=3`. Para ampliar, aumente `max_search_pages` gradualmente e monitore a quota.
3. Para sinais internacionais, preencha `cross_language_queries` com uma consulta por linha no formato `en|discipline without motivation`, `es|disciplina sin motivación`, `fr|discipline sans motivation`, `pl|dyscyplina bez motywacji` ou `ja|やる気がなくても規律`.
4. Execute somente o bloco **BUSCAR** e confira o resumo: total coletado, total filtrado, Top 5, idiomas e justificativa de cada nota.
5. Antes de CRIAR Tema, valide manualmente se as referências de outros nichos trazem um mecanismo adaptável ao Norte Magnata — não apenas uma frase chamativa.

A nota combina velocidade de views, desempenho relativo, engajamento e sinais em uma pequena amostra de comentários. Ela não lê roteiro completo nem garante transcrição: captions/transcrições não são expostas de forma universal pela YouTube Data API pública. Também não interpreta thumbnail nem prova conversão, retenção ou verdade de afirmações. Esses limites são deliberados para não transformar uma pesquisa pública em uma falsa certeza.

### Critério que merece revisão humana posterior

O único ponto editorial que vale revisar nesta rodada é se a lente filosófica escolhida representa de fato o Norte Magnata. Não é necessário validar URLs, métricas ou formato técnico: isso já é rastreado no snapshot. Essa revisão não transforma o dossiê em título, roteiro ou autorização de publicação.

### Limitação conhecida da versão 0.3.0 do App

O motor do App executa plugins de `VALIDAR`, registra a decisão e conclui a cadeia. Na implementação atual, uma decisão automática `rejected` ainda **não reinicia automaticamente** o bloco `CRIAR` alvo, mesmo quando a configuração declara `retry_target`. A rodada abaixo foi aprovada, portanto não afetou o resultado; porém o limite de duas tentativas não pode ser prometido como funcional até que essa correção do núcleo seja implementada, testada e empacotada no App. Em uma reprovação futura, tratar o relatório como bloqueio editorial e não avançar para Título/Roteiro.

## Quarta execução real — dossiê e validação encadeados

- Data: `2026-08-19T02:04:52Z` a `2026-08-19T02:05:12Z`.
- Radar: 24 vídeos únicos; 16 após duração; 8 aceitos; 4 chamadas `search.list`, 1 chamada `videos.list`, nenhuma rotação e nenhum erro técnico.
- Tema criado: disciplina sem motivação, com lente de controle estoico, promessa honesta e contraponto contra moralização ou controle mental absoluto.
- Evidências citadas no dossiê: `rFQ52rDgrBI`, `7e2PHiGv7cc`, `MqP8V8Hqscc`, `kmzcU_aKbFA` e `rn_xUuoSiQ4`.
- Validação: **approved**. Verificou duas ou mais evidências identificáveis, mecanismo explícito, promessa sem garantia, ângulo visual inicial, diferenciação e ausência de cópia literal dos títulos observados.
- Limite preservado: as métricas públicas não comprovam retenção, causalidade, intenção do público ou eficácia prática.

## Recuperação do cofre no macOS

Depois de uma atualização do App ad-hoc, o macOS pode manter uma entrada do Keychain associada ao binário anterior e bloquear a leitura do novo binário. A correção segura é recriar **somente** as entradas do serviço `ContentFlow OS` para:

- `plugin:com.norte-magnata.market-radar:YOUTUBE_DATA_API_KEYS`
- `plugin:official-openai-gpt:OPENAI_API_KEY`

Antes disso, mantenha uma cópia privada das chaves fora do repositório. Nunca registre valores de credenciais em Git, logs, relatórios ou screenshots. Após recriar as duas entradas pelo App atual, não consulte repetidamente o status de segredo: isso pode disparar novos pedidos do Keychain.

## Teste antes de mover

```sh
cd /caminho/para/contentflow-os
./desktop-runtime/node plugins/private/norte-magnata-market-radar/test.mjs
./desktop-runtime/node --import tsx tools/plugin-kit.ts check plugins/private/norte-magnata-market-radar
```

Os testes usam fixtures e mocks: não chamam YouTube nem usam uma chave real.
