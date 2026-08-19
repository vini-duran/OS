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

Total remoto consumido: 29 imagens (10 + 5 + 5 + 1 + 5 + 2 + 1). As recuperações seletivas economizaram nove gerações em relação a repetir os lotes inteiros.

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

## Correções permanentes

1. `prepare-norte-magnata-flow-smoke.mjs` prepara entre uma e cinco cenas, aceita seleção por `--scenes` e recusa linhas fora do contrato.
2. `norte-magnata-flow-smoke-overrides.json` registra os cinco prompts curados desta prova, sem segredo de API.
3. O organizador aceita os IDs históricos `NM-*` e os IDs do ContentFlow `NM-CF-*`, preservando os 16 hexadecimais.
4. O perfil do Chrome é configuração local por variável de ambiente, não caminho fixo do repositório.
5. O mapa de Assets 0.1.3 passa a exigir bloqueios contra pseudo-texto, duplicação de objetos/membros e membros cortados/desconectados. Telas e papéis ficam sem símbolos ou virados para longe.

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

## Portão atual

A integração curta está aprovada. Restam 77 imagens-base — 55 imagens animadas e 22 quadros iniciais de vídeo. O avanço permanece em lotes de no máximo cinco cenas, com recuperação somente das reprovadas. Vídeos, edição e renderização continuam bloqueados até as imagens-base correspondentes serem aprovadas.
