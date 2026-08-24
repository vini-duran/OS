# HeyGen TTS Browser Bridge

Plugin ContentFlow OS que usa a sessão HeyGen já autenticada no Chrome por meio da extensão local `ContentFlow Bridge`. O roteiro sai do Método como texto, a voz é configurável por canal e o resultado volta como artifact de áudio.

## Norte Magnata

- Voz: Hiro
- `voiceId`: `0d95c364a470438f9ec4952f84a7df72`
- Ponte local: `127.0.0.1:10002`
- Concorrência: uma narração por vez

## Operação

1. Abra o HeyGen no Chrome autenticado.
2. Mantenha a extensão `ContentFlow Bridge` ativa.
3. Execute a etapa Narração no ContentFlow OS.
4. O plugin abre a ponte somente durante o job e materializa o áudio no workspace do ContentFlow.

Não contém cookies, tokens, perfis, caminhos absolutos ou credenciais. A sessão continua sob controle do navegador.
