# Norte Magnata — Thumbnail Studio

Plugin privado para o processo **Thumbnail** do Norte Magnata. Ele gera uma única imagem de fundo, já materializada como PNG 16:9, e a revisa visualmente antes que ela siga para publicação.

## O que ele faz

- recebe somente o título aprovado e o dossiê de tema;
- gera uma composição cinematográfica sem texto, logos, marca d'água, card, moldura ou colagem;
- pede 1536×864; caso o provedor não aceite o tamanho, gera 1536×1024 e faz crop central para 1536×864 antes de entregar o artifact;
- guarda o PNG no armazenamento gerenciado do ContentFlow, com hash e ID próprios do núcleo;
- usa visão na validação para reprovar margens claras, painel uniforme sem textura narrativa, proporção aparente errada, foco fraco, texto aleatório e incoerência editorial. Espaço escuro texturizado para a headline posterior é permitido.

Não cria roteiro, assets do vídeo, CTA, publicação ou uma identidade visual de outro canal. A área livre à esquerda é apenas espaço para a camada de título posterior; não é um painel branco.

## Credencial e custo

O plugin solicita a chave `OPENAI_API_KEY` na Central de Plugins. Ela fica separada da conexão textual oficial por projeto de plugin; isso mantém o cofre e as permissões isolados. A geração usa `gpt-image-2` e a revisão visual usa `gpt-5.6-terra` por padrão. Ambas as chamadas são cobradas pela conta OpenAI associada à chave.

## Teste local

```bash
./desktop-runtime/node plugins/private/norte-magnata-thumbnail-studio/test.mjs
./desktop-runtime/node --import tsx tools/plugin-kit.ts check plugins/private/norte-magnata-thumbnail-studio
```

O teste não chama a OpenAI nem produz imagem real.
