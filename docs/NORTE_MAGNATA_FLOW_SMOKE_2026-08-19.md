# Norte Magnata — prova Flow de imagens — 2026-08-19

## Resultado

A integração ContentFlow → Flow → download → organização foi comprovada com um lote curto da abertura. Cinco cenas foram aprovadas; a fila completa não foi iniciada. Nenhuma API paga da OpenAI foi chamada nesta prova.

Identidade preservada:

- `production_id`: `NM-CF-9AB9B6D01B7EFB72`
- execução de Assets: `70387a7c-0289-4240-9c28-2c1aed882023`
- hash do mapa: `9ab9b6d01b7efb72ceedb21dccef6fd7cffef62b454dabc8c3c8dfeb9d3c1125`
- contrato: `norte_magnata_provedores_video_v3`

## O que aconteceu em cada rodada

| Rodada | Resultado | Aprendizado/ação |
| --- | --- | --- |
| 001 | 10 imagens remotas para 5 cenas | marcador e prompt foram interpretados como dois pedidos; contrato corrigido para uma linha por cena |
| 002 | nenhuma geração | faltava a linha vazia separadora; parser corrigido |
| 003 | bloqueio seguro | abertura automática recarregou o projeto; desativada para preservar a aba atual |
| 004 | 5/5 baixadas, mas organização bloqueada | `NM-CF-*` não era aceito; regex ampliada sem alterar o ID; imagens rejeitadas editorialmente |
| 005 | 5/5 geradas, baixadas e organizadas | quatro aprovadas; C03 reprovada por membro ambíguo/desconectado |
| 006 | somente C03 refeita | aprovada; evitou gastar outras quatro gerações |
| 007 | segundo lote com 5 cenas | três aprovadas; C10 rejeitada por estilo/objeto e C02 por símbolos falsos |
| 008 | somente C10 e C02 refeitas | C02 aprovada; C10 ainda veio sem teclas físicas |
| 009 | somente C10 refeita | aprovada com estilo gráfico e teclado físico executável |
| 010 | terceiro lote com 5 cenas | 5/5 aprovadas; nenhum reparo necessário |
| 011 | lote universal sem overrides novos | 5/5 aprovadas; contrato automático validado |
| 012 | lote universal com 5 cenas | quatro aprovadas; C06 rejeitada por rostos extras na fumaça |
| 013 | somente C06 refeita | aprovada; guardrail de atmosfera incorporado ao mapa 0.1.4 |
| 014 | lote universal com 5 cenas | três aprovadas; C12 com símbolos/espelho duplicado e C13 em tríptico |
| 015 | C12 e C13 refeitas | C12 aprovada; C13 sem barras, mas fotorealista |
| 016 | somente C13 refeita | aprovada; composição contínua e identidade gráfica preservada |
| 017 | lote universal com 5 cenas | três aprovadas; C03 rejeitada por três mãos e C05 por faixas gráficas atravessando o quadro |
| 018 | somente C03 e C05 refeitas | 2/2 aprovadas; anatomia, composição contínua e tela cheia preservadas |
| 019 | lote curado com 5 cenas | C09 e C11 aprovadas; C08 rejeitada por elemento branco semelhante a placa, C10 por símbolo falso na caixa e C12 por pseudo-texto na parede |
| 020 | somente C08, C10 e C12 refeitas | C08 e C10 aprovadas; C12 rejeitada por marcas novas no rosto de Hiro |
| 021 | somente C12 refeita | aprovada com rosto canônico limpo, anatomia clara e parede sem pseudo-texto |
| 022 | lote curado com 5 cenas | quatro aprovadas; C03 rejeitada por linhas falsas nos recibos e tela excessivamente branca |
| 023 | somente C03 refeita | rejeitada por quatro recibos e enquadramento cortando o topo da cabeça |
| 024 | somente C03 refeita | rejeitada por duplicar o notebook |
| 025 | somente C03 refeita em composição simplificada | aprovada com um notebook, duas mãos, grade vazia e três recibos lisos |
| 026 | lote curado com 5 cenas | C05 aprovada; C04 duplicou papel, C06 gerou fundo branco e cicatriz, C07 perdeu a ação e C09 distorceu o rosto de modo grotesco |
| 027 | somente quatro cenas refeitas | C07 e C09 aprovadas; C04 duplicou o lápis e C06 voltou a alterar o rosto |
| 028 | somente C04 e C06 refeitas | C06 aprovada com rosto fora de quadro; C04 saiu fotográfica |
| 029 | somente C04 refeita | aprovada com hachura gráfica, um lápis e uma tira de papel |
| 030 | lote curado com 5 cenas | C10 e C11 aprovadas; C12 com tela clara e marca facial, C13 com números na régua e B06_C01 com cicatriz/mão ambígua/faixa branca |
| 031 | somente três cenas refeitas | C13 e B06_C01 aprovadas; C12 rejeitada por criar seis barras em vez de cinco |
| 032 | somente C12 simplificada | rejeitada por perspectiva ambígua e braços aparentemente desconectados |
| 033 | somente C12 em verdadeiro plano sobre o ombro | aprovada; tela limpa reservada para overlay determinístico de cinco barras |

Total remoto consumido: 99 imagens. As recuperações seletivas economizaram 39 gerações em relação a repetir os lotes inteiros.

## Conjunto aprovado

| Cena | Origem | Função posterior | Decisão |
| --- | --- | --- | --- |
| B01_C01 | smoke-005 | quadro inicial de vídeo gerado | aprovada |
| B01_C03 | smoke-006 | quadro inicial de vídeo gerado | aprovada |
| B01_C04 | smoke-005 | quadro inicial de vídeo gerado | aprovada |
| B01_C05 | smoke-005 | imagem animada | aprovada |
| B01_C06 | smoke-005 | quadro inicial de vídeo gerado | aprovada |

QA técnico do primeiro conjunto: 5/5 em 1376×768, 16:9, SHA-256 igual ao manifesto, arquivos únicos e sem borda branca. QA visual: Hiro consistente, sem texto falso, sem objeto duplicado, sem quadro branco e com anatomia compreensível.

Segundo conjunto aprovado: B01_C07, B01_C08 e B02_C03 da rodada `smoke-007`, B02_C02 da rodada `smoke-008` e B01_C10 da rodada `smoke-009`. O acumulado é 10/10 imagens-base aprovadas: oito quadros iniciais de vídeo e duas imagens animadas.

Terceiro conjunto aprovado integralmente na rodada `smoke-010`: B02_C04, B02_C06, B02_C07, B02_C08 e B02_C09. O acumulado passa a 15 imagens-base: 11 quadros iniciais de vídeo e quatro imagens animadas.

Quarto conjunto aprovado integralmente na rodada `smoke-011`, usando os prompts do mapa e apenas os guardrails automáticos: B02_C10, B02_C11, B02_C12, B03_C02 e B03_C03. O acumulado passa a 20 imagens-base: 13 quadros iniciais de vídeo e sete imagens animadas.

Quinto conjunto aprovado nas rodadas `smoke-012` e `smoke-013`: B03_C04, B03_C05, B03_C06, B03_C07 e B03_C08. O acumulado passa a 25 imagens-base: 14 quadros iniciais de vídeo e 11 imagens animadas.

Sexto conjunto aprovado nas rodadas `smoke-014`, `smoke-015` e `smoke-016`: B03_C09, B03_C10, B03_C12, B03_C13 e B04_C02. O acumulado passa a 30 imagens-base: 17 quadros iniciais de vídeo e 13 imagens animadas. A falha de tríptico originou o guardrail de composição única do mapa 0.1.5.

Sétimo conjunto aprovado nas rodadas `smoke-017` e `smoke-018`: B04_C03, B04_C04, B04_C05, B04_C06 e B04_C07. O acumulado passa a 35 imagens-base: 18 quadros iniciais de vídeo e 17 imagens animadas. As falhas de anatomia e faixas gráficas foram recuperadas sem repetir as três cenas já aprovadas; o mapa 0.1.6 bloqueia faixas horizontais, verticais e zonas vazias que atravessem o quadro.

Oitavo conjunto aprovado nas rodadas `smoke-019`, `smoke-020` e `smoke-021`: B04_C08, B04_C09, B04_C10, B04_C11 e B04_C12. O acumulado passa a 40 imagens-base: 19 quadros iniciais de vídeo e 21 imagens animadas. Placa branca, símbolo falso, pseudo-texto e mudança facial foram reprovados; as recuperações preservaram somente as versões limpas.

Nono conjunto aprovado nas rodadas `smoke-022` a `smoke-025`: B04_C13, B04_C14, B05_C01, B05_C02 e B05_C03. O acumulado passa a 45 imagens-base: 21 quadros iniciais de vídeo e 24 imagens animadas. A C03 foi simplificada após três rejeições; nenhuma versão com recibo extra, tela branca, rosto cortado ou notebook duplicado foi aceita.

Décimo conjunto aprovado nas rodadas `smoke-026` a `smoke-029`: B05_C04, B05_C05, B05_C06, B05_C07 e B05_C09. O acumulado passa a 50 imagens-base: 22 quadros iniciais de vídeo e 28 imagens animadas. A falha de fundo branco originou o guardrail 0.1.7; duplicações, mudança facial e fotorealismo foram rejeitados antes do registro.

Décimo primeiro conjunto aprovado nas rodadas `smoke-030` a `smoke-033`: B05_C10, B05_C11, B05_C12, B05_C13 e B06_C01. O acumulado passa a 55 imagens-base: 23 quadros iniciais de vídeo e 32 imagens animadas. A C12 passou a usar tela vazia e receberá cinco barras determinísticas na animação, evitando contagem incorreta e pseudo-interface.

## Correções permanentes

1. `prepare-norte-magnata-flow-smoke.mjs` prepara entre uma e cinco cenas, aceita seleção por `--scenes` e recusa linhas fora do contrato.
2. `norte-magnata-flow-smoke-overrides.json` registra os cinco prompts curados desta prova, sem segredo de API.
3. O organizador aceita os IDs históricos `NM-*` e os IDs do ContentFlow `NM-CF-*`, preservando os 16 hexadecimais.
4. O perfil do Chrome é configuração local por variável de ambiente, não caminho fixo do repositório.
5. O mapa de Assets 0.1.3 a 0.1.7 passa a exigir bloqueios contra pseudo-texto, duplicação de objetos/membros, membros cortados/desconectados, figuras formadas por atmosfera, composições em painéis, faixas gráficas e fundos predominantemente brancos. Telas e papéis ficam sem símbolos ou virados para longe.

## Repetição portátil

Preparar um lote sem chamar IA:

```zsh
cd /caminho/contentflow-os
./desktop-runtime/node tools/prepare-norte-magnata-flow-smoke.mjs \
  --api http://127.0.0.1:PORTA \
  --execution ID_DA_EXECUCAO \
  --run smoke-001 \
  --overrides tools/norte-magnata-flow-smoke-overrides.json
```

Para refazer apenas uma cena, acrescente `--scenes B01_C03`. Em outra máquina, reconecte o plugin, carregue as duas extensões autorizadas no perfil escolhido e configure `MAGNATA_FLOW_CHROME_PROFILE` localmente. Não copie Keychain, chaves ou caminhos absolutos para o Git.

Depois do QA técnico e visual, o registro no manifesto é feito pelo utilitário `tools/record-norte-magnata-flow-approval.mjs`. Ele exige `--confirm-visual APROVADO`, confere identidade, hash e 1376×768 e aceita `--dry-run`. A escrita final usa arquivo temporário e renomeação atômica; não copia nem altera a mídia de origem.

## Portão atual

A integração curta está aprovada. Restam 32 imagens-base — 25 imagens animadas e 7 quadros iniciais de vídeo. O avanço permanece em lotes de no máximo cinco cenas, com recuperação somente das reprovadas. Vídeos, edição e renderização continuam bloqueados até as imagens-base correspondentes serem aprovadas.
