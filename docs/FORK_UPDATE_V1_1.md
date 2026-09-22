# Atualização do fork para ContentFlow 1.1.0

Esta revisão integra a tag oficial `v1.1.0` (`1749d85e2006a4093301bed491b75947d131bb7e`) ao fork `vini-duran/OS`, preservando as adaptações locais de organização da biblioteca, atalhos, ordem dos processos e integração com plugins. O repositório do autor é somente fonte de consulta e atualização; a distribuição da equipe sai exclusivamente do fork.

## Validação local em macOS arm64

- `npm run test:i18n`, `npm run check`, 34 testes E2E com Chrome e 2 testes Electron passaram com Node 26.
- `release_guard.py check-candidate` passou com os requisitos do projeto Norte Magnata.
- Um pacote macOS `dir` iniciou isolado e respondeu à API local.
- Uma cópia consistente do banco real abriu na candidata com 36 plugins e 19 execuções; o comparador de continuidade não encontrou perda. A instalação local foi substituída com backup do app e perfil anteriores e a mesma comparação após a troca.
- A correção do retorno final do Gemini passou nos testes de regressão e nos 183 testes de plugins de navegador.

Esses testes não comprovam autenticação externa, publicação ou funcionamento de cada plugin em uma conta real. Cada máquina deve preservar seu próprio perfil, cofre, conexões, mídia e banco. Nunca inclua esses dados em uma release.

## Atualização em outras máquinas

Use o pacote macOS da release deste fork, faça backup recuperável do `.app` e do diretório de dados local, confirme que não há jobs ativos e teste primeiro com uma cópia do banco. Só então substitua o aplicativo. Compare plugins, projetos, execuções e vínculos antes/depois. Se a candidata falhar, restaure o aplicativo anterior sem sobrescrever automaticamente um banco que já recebeu novos dados.

O local fixo de projetos da equipe é `<base>/projects/<id-estavel>`, conforme o manual de workplace em `ContentFlow_Universal_Integrations`. A conversão de projetos existentes exige inventário, cópia, verificação de referências e um teste com o caminho antigo indisponível; não deve ocorrer como efeito colateral da atualização do aplicativo.
