# Operação e portabilidade — Thumbnail Studio do Norte Magnata

## Finalidade e limite

Este é o plugin privado do processo **Thumbnail** do canal Norte Magnata. Ele não pertence ao núcleo do ContentFlow OS e não deve ser copiado automaticamente para outro canal: tema, direção visual, título e validação são próprios do Norte Magnata.

O fluxo tem somente dois blocos:

1. **CRIAR — Gerar thumbnail 16:9 sem faixas**: recebe o título e o dossiê de tema concluídos, chama a OpenAI Images API e entrega um PNG gerenciado pelo ContentFlow.
2. **VALIDAR — Validar thumbnail por visão**: recebe o PNG, título e tema; a OpenAI Responses API decide `approved` ou `rejected` e explica a decisão.

Não gera roteiro, assets de edição, narração, CTA ou publicação.

## Garantias técnicas

- saída final: PNG de **1536×864 px (16:9)**;
- texto, logos, marcas d'água, cartões, colagens e molduras são proibidos no prompt de imagem;
- se a API não aceitar 1536×864, o plugin recebe 1536×1024 e faz crop central antes de materializar o artifact;
- se a imagem final não tiver exatamente 1536×864, a execução falha em vez de criar barras laterais;
- o ContentFlow importa o artifact, calcula `sha256` e cria o ID universal; caminhos absolutos não entram no Método;
- a área escura texturizada para a headline posterior é permitida; painel branco/cinza uniforme, bordas e lateral vazia sem textura são motivo de reprovação.

## Instalação em outro Mac

1. Copie ou obtenha o repositório `contentflow-os`, incluindo `plugins/private/norte-magnata-thumbnail-studio/`.
2. Abra o ContentFlow OS e use **Plugins → Vincular pasta de desenvolvimento** para essa pasta, ou instale uma cópia do pacote pelo mesmo painel.
3. Confira e aceite as permissões mostradas: rede limitada a `api.openai.com`, leitura/escrita apenas nas pastas temporárias do ContentFlow e subprocessos locais para `sips`/`stat` do macOS.
4. Conecte `OPENAI_API_KEY` exclusivamente ao plugin pela Central de Plugins. Nunca coloque a chave no repositório, Método, logs, artifact ou documentação.
5. No canal Norte Magnata, configure o bloco CRIAR com `quality: high` ou `medium`; mantenha `simulate: false` em produção.
6. Rode os testes abaixo antes da primeira chamada paga.

O plugin requer macOS, Node 26 distribuído pelo ContentFlow e os binários do sistema `/usr/bin/sips` e `/usr/bin/stat`. Ele não depende de caminhos da máquina de origem.

## Testes antes da produção

```bash
cd /caminho/para/contentflow-os
./desktop-runtime/node plugins/private/norte-magnata-thumbnail-studio/test.mjs
./desktop-runtime/node --import tsx tools/plugin-kit.ts check plugins/private/norte-magnata-thumbnail-studio
```

`simulate: true` materializa uma imagem neutra 16:9 para testar sandbox, permissões e artifacts, sem chamar nem cobrar a OpenAI. Não é conteúdo utilizável.

## Custo e aprovação

Cada geração real chama `gpt-image-2` uma vez; a revisão chama `gpt-5.6-terra`. São chamadas medidas pela conta OpenAI conectada. A validação não deve ser ignorada: se reprovar, ajuste a direção ou a imagem. A execução atual do ContentFlow registra a decisão, mas não repete automaticamente um bloco por uma reprovação de `approval`; uma nova tentativa deve ser iniciada de forma explícita até que o núcleo implemente esse comportamento.
