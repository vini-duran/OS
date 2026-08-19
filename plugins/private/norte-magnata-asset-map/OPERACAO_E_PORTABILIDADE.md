# Norte Magnata — Mapa de Assets

Plugin do processo **Assets**. Recebe o SRT real da narração, cria cortes canônicos, planeja a execução visual com IA por bloco e bloqueia o mapa se o QA determinístico falhar. Ele não gera nem baixa mídia.

Configuração do teste atual: oito blocos; doze cenas/minuto; trinta vídeos gerados; onze B-rolls em vídeo; dezoito overlays; quatorze SFX; vinte textos curtos; música desativada.

O QA confere continuidade temporal, duração, movimento interno, vídeo com progressão, B-roll com função, prompts full-bleed sem quadros/margens brancas, Hiro em ação, antirrepetição, texto curto e transições não repetidas três vezes.

Para transportar, copie esta pasta com o repositório, vincule-a na Central de Plugins e conecte `OPENAI_API_KEY` ao plugin `com.norte-magnata.asset-map`. Teste antes de produção:

```zsh
./desktop-runtime/node plugins/private/norte-magnata-asset-map/test.mjs
./desktop-runtime/node --import tsx tools/plugin-kit.ts check plugins/private/norte-magnata-asset-map
```

`simulate: true` serve somente ao teste de contrato. A produção exige `simulate: false`.
