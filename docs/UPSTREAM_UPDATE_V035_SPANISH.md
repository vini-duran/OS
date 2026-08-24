# Integração Spanish com ContentFlow OS v0.3.5

Data: 2026-08-23

## Fontes

- `upstream`: `https://github.com/andremjr/contentflow-os.git`
- `origin`: `https://github.com/vini-duran/OS.git`
- base oficial integrada: `v0.3.5` (`40c841d`)
- branch Spanish publicada: `spanish-integration-v035`

## Regra de atualização

O fork monitora o upstream, mas não instala nem mistura uma atualização automaticamente.
Cada nova versão entra primeiro em branch isolada, passa pelos testes e gera um `.app`
candidato. O aplicativo fixo só é substituído depois do smoke test.

Isso preserva os plugins, o runtime macOS, o cofre de credenciais, os canais e os dados
locais. Produções e credenciais não entram no Git.

## Alterações preservadas

- execução nativa no macOS com Node 26;
- pesquisa factual do canal Spanish;
- interface e entregas do projeto;
- timeout de plugins de navegador e mídia;
- fluxo de projetos, validações humanas e notificações;
- tema visual personalizado;
- fixture local da ponte de thumbnail Spanish.

## Validação executada

- `npm run check` com Node `v26.7.0`;
- testes específicos de pesquisa e do plugin OpenAI;
- build Vite cliente e servidor;
- empacotamento Electron macOS arm64;
- smoke test em diretório de dados isolado;
- smoke test do caminho fixo do aplicativo;
- abertura com dados reais: 1 canal, 1 projeto e 18 plugins reconhecidos.

O primeiro empacotamento falhou por usar `node_modules` através de link simbólico. A
reconstrução com uma cópia local real das dependências corrigiu o pacote. Nenhuma chamada
de produção ou API externa foi executada.

## Aplicativo local

- caminho fixo: `/Users/viniciusduran/contentflow-os/release/v0/mac-arm64/ContentFlow OS.app`
- versão instalada: `0.3.5`
- rollback preservado: `ContentFlow OS v0.3.0 backup.app`

Os caminhos acima são estado desta máquina e não devem ser copiados para configurações
portáveis nem usados como dependência do projeto.

## Próximo gate

Validar visualmente no aplicativo real:

1. canal Spanish visível;
2. projeto atual preservado;
3. Pesquisa diária abre;
4. plugins continuam conectados;
5. etapa de Thumbnail mantém o estado anterior.

Somente depois dessa validação a branch Spanish deve ser integrada ao `main` do fork.
