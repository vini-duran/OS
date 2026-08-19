# Norte Magnata — Monitor de produção

Plugin privado e somente leitura do processo **Edição**. Ele consolida no ContentFlow os estados locais de geração Flow/Dola, capacidade dos perfis Dola, materialização, handoff e renderização.

## Instalação em outra máquina

1. Copie ou clone a pasta raiz `contentflow-os`.
2. No ContentFlow, vincule esta pasta em **Plugins → Usar pasta ao vivo**.
3. Autorize apenas `filesystem:read`.
4. Configure o workspace do plugin para a raiz transferida de `Automation_Magnata`.
5. No método **Edição** do canal Norte Magnata, vincule a capacidade `read-production-state` ao bloco de monitoramento.

O plugin não usa chaves, não chama APIs, não inicia filas e não modifica mídia. O `.env` real permanece local e ignorado pelo Git; somente exemplos sem segredo podem ser versionados.
