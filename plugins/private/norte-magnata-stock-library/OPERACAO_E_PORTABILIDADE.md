# Norte Magnata — Biblioteca Stock

Responsabilidade única: materializar B-roll, overlays e SFX definidos pelo mapa, preservando `production_id`, origem, autor, licença, arquivo local e SHA-256. O plugin não cria imagens, vídeos de cena, timeline ou render.

Fontes: Pixabay/Pexels para vídeo e Openverse para áudio aberto. O pool muda de credencial apenas após resposta real de autorização/quota; falha de serviço troca de provedor. A configuração atual prioriza Pixabay porque Pexels apresentou timeout de infraestrutura nesta máquina.

Segredos do plugin: `PEXELS_API_KEYS` e `PIXABAY_API_KEYS` como listas separadas por vírgula; `OPENVERSE_CLIENTS_JSON` como lista JSON de objetos `{ "id": "...", "secret": "..." }`. Colchetes usados como delimitadores no `.env` são removidos antes da autenticação.

Teste portátil:

```zsh
./desktop-runtime/node plugins/private/norte-magnata-stock-library/test.mjs
./desktop-runtime/node --import tsx tools/plugin-kit.ts check plugins/private/norte-magnata-stock-library
```

`simulate: true` não acessa a rede e nunca deve ser usado na produção.
