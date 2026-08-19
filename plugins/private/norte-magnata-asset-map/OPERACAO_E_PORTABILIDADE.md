# Norte Magnata — Mapa de Assets

Plugin do processo **Assets**. Recebe o SRT real da narração, cria cortes canônicos, planeja a execução visual com IA por bloco e bloqueia o mapa se o QA determinístico falhar. Ele não gera nem baixa mídia.

O mapa legado da primeira produção foi criado com oito blocos, doze cenas/minuto, trinta vídeos gerados, onze B-rolls, dezoito overlays, quatorze SFX, vinte textos e música desativada. A política V2 eleva o padrão inicial para 42 vídeos; esse número é configurável e continua subordinado ao ganho editorial e ao preflight integral.

O QA confere continuidade temporal, duração, movimento interno, vídeo com progressão, B-roll com função, prompts full-bleed sem quadros/margens brancas, Hiro em ação, antirrepetição, texto curto e transições não repetidas três vezes. Desde a versão 0.1.3, o contrato também bloqueia pseudo-texto, objetos ou membros duplicados e membros cortados/desconectados. Tela e papel ficam sem símbolos ou virados para longe; interface e texto são adicionados depois como overlay validado. A versão 0.1.4 impede fumaça, névoa, luz ou sombra abstratas de criarem rostos e personagens extras sem função narrativa. A 0.1.5 exige uma composição contínua, sem split screen, díptico, tríptico, colagem, quadrinhos internos ou barras verticais internas. A 0.1.6 bloqueia faixas e zonas vazias que atravessem o quadro como artefato de layout. A 0.1.7 impede fundos predominantemente brancos ou off-white e mantém toda a tela dentro da paleta noir escura. A 0.1.8 preserva o rosto canônico limpo de Hiro e bloqueia cicatrizes, cortes, tatuagens, brincos ou marcas faciais novas.

Para cenas destinadas a vídeo gerado, a imagem é tratada como quadro inicial: anatomia clara, espaço para a ação e correspondência direta com a progressão descrita no prompt de vídeo. A liberação de produção exige preflight determinístico do mapa inteiro. Não se exige uma geração parcial por bloco: depois que todas as cenas, guias, provedores e tratamentos passam juntos, a fila completa pode ser iniciada.

Para transportar, copie esta pasta com o repositório, vincule-a na Central de Plugins e conecte `OPENAI_API_KEY` ao plugin `com.norte-magnata.asset-map`. Teste antes de produção:

```zsh
./desktop-runtime/node plugins/private/norte-magnata-asset-map/test.mjs
./desktop-runtime/node --import tsx tools/plugin-kit.ts check plugins/private/norte-magnata-asset-map
```

`simulate: true` serve somente ao teste de contrato. A produção exige `simulate: false`.
