# Consolidação da main 0.5.5 — 2026-09-09

## Escopo

Merge com dois históricos preservados, sem force e sem escolher uma branch
inteira: candidata `31de856f60f1ae8064e12c3ffce172abc9b35eda` e main anterior
`0fc5cdb33ce367fec6c49f789dcfd54136be1f40`.
A base comum é `40c841d24364aa14b0840ddac897fb23258abfe2`.

## Decisões de compatibilidade

| Diferença | Resolução |
| --- | --- |
| Pesquisa estratégica do canal na main antiga | Mantidos rota, navegação, snapshots, briefs, aprovação e biblioteca. Não cria um novo processo universal. |
| Credenciais da pesquisa | Usa o resolvedor atual de conexões, copia só o ID opaco do bloco Tema, recusa conexão indisponível e não restaura acesso global ao cofre legado. |
| Consentimento de plugins | Versão isolada não desativa plugin consentido; mudança de permissões/hosts requer novo consentimento. |
| Exclusão de canal | Preservadas limpezas de pesquisa, preferências e orquestradores, além das relações existentes. |
| Cofre e sandbox | Mantidas correções 0.5.5: revogação persistente, migração confirmada, Node privado, caminhos físicos e isolamento. Não substituídos pelo cofre antigo. |
| Desktop | Mantidos preload isolado, notificações, runtime privado e proteção de dados dentro do bundle/symlinks; alias desktop:mac compatível. |
| Interface | Preservado tema atual; pesquisa com traduções PT/EN/ES. |
| Plugins privados e templates históricos da main | Conservados como fontes históricas, sem instalação/empacotamento/ativação automática. A operação atual do Magnata permanece no repositório do projeto. |

## Evidências nesta revisão

- `npm run check`: passou — lint, tipos, regressões, novos testes de reconciliação e build.
- `test:main-reconciliation`: 2 integrações de API com dados temporários
  (pesquisa/brief/aprovação/exclusão e consentimentos) + 5 testes de tradução.
- `test:distribution-boundaries` inclui os 9 testes atuais e 3 legados do helper desktop.
- Teste focal de interface: `CONTENTFLOW_TEST_BROWSER_CHANNEL=chrome npm run test:e2e -- tests/e2e/reliability.spec.ts --grep 'preserva a entrada visual de pesquisa'`:
  1 passou (PT/EN/ES); navegador/perfil e servidor isolados, sem executar pesquisa.
- Os dois testes dos plugins privados históricos passaram com rede simulada
  ou inspeção de fixture temporária; nenhum plugin operacional foi executado.
- O Chromium gerenciado da versão esperada não estava instalado. Foi utilizado
  Chrome disponível, com perfil de teste separado, sem baixar navegador ou usar
  a sessão do operador.
- Lint inicialmente detectou formatação legada em dois arquivos do plugin
  histórico; formatação normalizada, sem alterar seu comportamento.

## O que não foi testado/alterado

Não houve nova compilação/instalação do bundle Electron nem migração real
nesta consolidação. Não houve acesso a credenciais reais, provedores pagos,
geração de imagens, fila ou mídia de produção.

A release disponível continua [v0.5.5-ecossistema.1](https://github.com/vini-duran/OS/releases/tag/v0.5.5-ecossistema.1),
fonte `64fc1bfeb93f56a399b498314739fbd55a8b8fbb`.
As adições posteriores desta main não estão nesse ZIP. A validação da fonte
não equivale a homologação de novo binário, migração de qualquer versão ou
produção ponta a ponta.
