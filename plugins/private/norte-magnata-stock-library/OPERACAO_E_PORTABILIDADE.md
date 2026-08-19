# Norte Magnata — Biblioteca Stock

Responsabilidade única: materializar B-roll, overlays e SFX definidos pelo mapa, preservando `production_id`, origem, autor, licença, arquivo local e SHA-256. O plugin não cria imagens, vídeos de cena, timeline ou render.

No fluxo Norte Magnata, ele é executado dentro de **Assets**, depois da criação e validação do mapa. O suporte a `editing` existe apenas para portabilidade; a produção atual não o usa para concluir a Edição.

O QA é bloqueante: ausência de licença, origem, `production_id`, SHA-256, MIME compatível ou arquivo materializado válido encerra a etapa como erro; ela não avança apenas exibindo “reprovado”.

Histórico operacional: a primeira execução real da versão 0.1.2 parou antes da validação por uma variável de contagem fora do escopo. A versão 0.1.3 calcula as contagens diretamente dos registros materializados e repete somente o bloco stock.

A versão 0.1.4 deixou de confiar no tamanho declarado por APIs de terceiros: o ContentFlow obtém o tamanho real e o SHA-256 durante a materialização. Isso evita aceitar metadado remoto divergente e preserva o QA do arquivo baixado.

Fontes: Pixabay/Pexels para vídeo e Openverse para áudio aberto. O pool muda de credencial apenas após resposta real de autorização/quota; falha de serviço troca de provedor. A configuração atual prioriza Pixabay porque Pexels apresentou timeout de infraestrutura nesta máquina.

Segredos do plugin: `PEXELS_API_KEYS` e `PIXABAY_API_KEYS` como listas separadas por vírgula; `OPENVERSE_CLIENTS_JSON` como lista JSON de objetos `{ "id": "...", "secret": "..." }`. Colchetes usados como delimitadores no `.env` são removidos antes da autenticação.

Teste portátil:

```zsh
./desktop-runtime/node plugins/private/norte-magnata-stock-library/test.mjs
./desktop-runtime/node --import tsx tools/plugin-kit.ts check plugins/private/norte-magnata-stock-library
```

`simulate: true` não acessa a rede e nunca deve ser usado na produção.
