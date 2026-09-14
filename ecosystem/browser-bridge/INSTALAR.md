# Instalar a ContentFlow Browser Bridge no Chrome dedicado

1. No ContentFlow, abra **Plugins**, os detalhes do plugin de navegador e **Perfis e contas**.
2. Em **Extensão persistente do navegador**, use **Copiar caminho da extensão**.
3. Se necessário, use **Adicionar perfil**. Com o plugin ativado, clique em **Preparar** no perfil desejado.
4. No Chrome desse perfil, acesse `chrome://extensions`, ative **Modo do desenvolvedor** e clique em **Carregar sem compactação**.
5. Selecione a pasta do caminho copiado no ContentFlow, não a pasta deste checkout nem um arquivo individual.
6. Volte ao provedor e conclua o login. Termine a preparação conforme a orientação do plugin.

O desktop e o servidor de desenvolvimento preparam essa pasta fora do código.
Use sempre o caminho exibido no aplicativo. Se ele não aparecer, a instalação
precisa ser conferida pelo responsável; não é necessário baixar um ZIP separado.

A instalação pertence somente àquele perfil dedicado. Repita o procedimento para outra conta. Não mova a pasta persistente depois de carregá-la. Depois de uma atualização da ponte, use **Recarregar** no card da extensão em `chrome://extensions`.

Para desconectar, faça logout no provedor e remova a extensão deste perfil. Os arquivos já entregues ao ContentFlow não são apagados.

Esta é a única extensão companheira para todos os plugins de automação de navegador compatíveis. Cada novo provedor é acrescentado por versão desta ponte; não existe uma extensão separada por plugin.

Os usuários instalam a ponte manualmente. Scripts de automação usados pelo mantenedor para preparar sua própria máquina são ferramentas locais paralelas e não fazem parte do ContentFlow.
