# Norte Magnata — Narração

Plugin pontual do ContentFlow OS para o processo **Narração**. Ele recebe o roteiro aprovado, gera `narracao.mp3` e cria `narracao.srt` transcrevendo o próprio MP3. O SRT é temporalmente autoritativo para Assets e Edição.

## Dependências

- ContentFlow OS 0.3.0 ou superior, Apple Silicon e Node 26 incluído no App.
- `OPENAI_API_KEY` conectada na Central de Plugins para `com.norte-magnata.narration`.
- Acesso a `api.openai.com` e ao utilitário nativo `/usr/bin/afinfo`.

## Operação

No método **Narração** do canal, mantenha um bloco `CRIAR` ligado a `generate-audio-and-real-srt`, com entrada `script` proveniente do Roteiro. A configuração normal é `voice: onyx`, `speed: 0.94`, `simulate: false`.

O plugin falha, sem aprovar a etapa, se a API não responder, se o MP3 estiver vazio/não tiver duração positiva ou se a transcrição não contiver timestamps. Ele não cria música, SFX, assets nem edição.

## Portabilidade e teste

Copie esta pasta junto com o repositório privado e, no novo App, vincule-a pela Central de Plugins, aceite as permissões e conecte a chave novamente. Antes de produção, execute:

```zsh
./desktop-runtime/node plugins/private/norte-magnata-narration/test.mjs
./desktop-runtime/node --import tsx tools/plugin-kit.ts check plugins/private/norte-magnata-narration
```

`simulate: true` só valida o contrato local; nunca deve ser usado para produzir mídia.
