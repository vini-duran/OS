# Norte Magnata — Mapa de Assets

Plugin do processo **Assets**. Recebe o SRT real da narração, cria cortes canônicos, planeja a execução visual com IA por bloco e bloqueia o mapa se o QA determinístico falhar. Ele não gera nem baixa mídia.

Configuração do teste atual: oito blocos; doze cenas/minuto; trinta vídeos gerados; onze B-rolls em vídeo; dezoito overlays; quatorze SFX; vinte textos curtos; música desativada.

O QA confere continuidade temporal, duração, movimento interno, vídeo com progressão, B-roll com função, prompts full-bleed sem quadros/margens brancas, Hiro em ação, antirrepetição, texto curto e transições não repetidas três vezes. Desde a versão 0.1.3, o contrato também bloqueia pseudo-texto, objetos ou membros duplicados e membros cortados/desconectados. Tela e papel ficam sem símbolos ou virados para longe; interface e texto são adicionados depois como overlay validado. A versão 0.1.4 impede fumaça, névoa, luz ou sombra abstratas de criarem rostos e personagens extras sem função narrativa. A 0.1.5 exige uma composição contínua, sem split screen, díptico, tríptico, colagem, quadrinhos internos ou barras verticais internas. A 0.1.6 bloqueia faixas e zonas vazias que atravessem o quadro como artefato de layout.

Para cenas destinadas a vídeo gerado, a imagem é tratada como quadro inicial: anatomia clara, espaço para a ação e correspondência direta com a progressão descrita no prompt de vídeo. Uma prova curta de cinco cenas é obrigatória antes de liberar uma fila completa.

Para transportar, copie esta pasta com o repositório, vincule-a na Central de Plugins e conecte `OPENAI_API_KEY` ao plugin `com.norte-magnata.asset-map`. Teste antes de produção:

```zsh
./desktop-runtime/node plugins/private/norte-magnata-asset-map/test.mjs
./desktop-runtime/node --import tsx tools/plugin-kit.ts check plugins/private/norte-magnata-asset-map
```

`simulate: true` serve somente ao teste de contrato. A produção exige `simulate: false`.
