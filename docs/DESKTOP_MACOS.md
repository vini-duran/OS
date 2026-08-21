# ContentFlow OS no macOS (Apple Silicon)

## Compilar

O projeto requer Node 26. Na raiz do repositório, execute:

```bash
npm ci
npm run check
npm run desktop:mac
```

O aplicativo será criado em `release/v0/mac-arm64/ContentFlow OS.app`.

## Atualizar sem perder dados

Os dados locais ficam fora do pacote `.app`, na pasta de dados do macOS. Isso
inclui banco, projetos, plugins instalados e credenciais guardadas pelo sistema.
Para atualizar, feche o App e substitua somente `ContentFlow OS.app` por uma
compilação nova. Não copie, apague ou recrie a pasta de dados.

O App usa o executável assinado do Electron para iniciar sua API local no macOS
e usa o runtime privado somente para plugins. Assim a instalação não depende de
`node.exe`, que existe apenas no Windows.

## Teste mínimo antes de substituir uma instalação

1. Abra o App compilado diretamente de `release/v0/mac-arm64`.
2. Confirme que um projeto existente aparece no painel.
3. Em **Plugins**, confirme que um plugin previamente consentido permanece
   ativo após atualização compatível.
4. Feche a janela e abra o App novamente; no macOS a janela deve reaparecer.

Não versionar credenciais, banco local, cookies, perfis do Chrome, mídia ou
caminhos específicos desta máquina.
