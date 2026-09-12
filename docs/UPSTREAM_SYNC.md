# Sincronização segura com o upstream

## Rodada vigente — 0.6.1

Integração, ensaio isolado, atualização operacional e reabertura concluídos;
distribuição [v0.6.1-ecossistema.1](https://github.com/vini-duran/OS/releases/tag/v0.6.1-ecossistema.1).
Fonte congelada `09da33a`. [Registro e limites](../ATUALIZACAO_CORE_061.md).
As seções de 0.5.5 abaixo são históricas, não a versão a instalar.

## Regra

Nosso ecossistema é independente do autor. A atualização só deve entrar se
preservar nossas funções, dados e fluxo de trabalho. Siga o
[procedimento de integração/publicação](https://github.com/vini-duran/ContentFlow_Universal_Integrations/blob/main/docs/PUBLICACAO_ECOSSISTEMA.md).
Para solicitar a próxima rodada, use o
[prompt universal de publicação](https://github.com/vini-duran/ContentFlow_Universal_Integrations/blob/main/docs/PROMPT_PUBLICACAO_ECOSSISTEMA.md).
Em caso de incompatibilidade, apresente impacto, opções e recomendação; mantenha
a instalação que funciona. Main é a entrada do operador, não um depósito de
branches ainda quebradas.

O fork não faz merge ou instalação automática de atualizações do autor. Ele pode detectar atualizações automaticamente, mas a integração deve ocorrer em branch isolada e com testes.

O workflow `.github/workflows/upstream-watch.yml` executa diariamente e também pode ser disparado manualmente. Ele compara o fork com o upstream e abre ou atualiza uma Issue. O workflow nunca faz merge, build, instalação ou acesso a credenciais.

## Motivo

O fork contém personalizações do Norte Magnata, plugins privados e correções de portabilidade para macOS. Um merge automático pode alterar contratos, permissões, runtime, credenciais ou comportamento de execução.

## Processo por atualização

1. Atualize apenas as referências: `git fetch upstream --prune`.
2. Registre o commit/tag novo e leia notas de release e diff relevante.
3. Crie uma branch `codex/upstream-<versao>` a partir do main aprovado.
4. Integre o upstream nessa branch, resolvendo conflitos sem apagar personalizações.
5. Rode typecheck, build, testes de plugins e teste do App em cópia isolada de dados.
6. Confirme consentimentos, cofre de credenciais e plugins vinculados.
7. Após testes e autorização, promova para main sem force, confirme o SHA remoto,
   publique o pacote aprovado e verifique seu download/checksum. Só então
   atualize o manifesto de distribuição. Instalação nas máquinas é outra etapa,
   com os cuidados de [atualização macOS](DESKTOP_MACOS.md).

## Estado da rodada 2026-09-09

### Último avanço — fonte reconciliada e distribuição identificada

A base funcional 0.5.5 foi reconciliada com a main anterior sem descartar a
pesquisa de canal e os consentimentos compatíveis. Veja
[decisões e evidências](MAIN_055_RECONCILIATION.md). Esta consolidação é de fonte:
não substitui o aplicativo instalado nem recompõe a release existente.

Release [0.5.5-ecossistema.1](https://github.com/vini-duran/OS/releases/tag/v0.5.5-ecossistema.1), fonte `64fc1bfeb93f56a399b498314739fbd55a8b8fbb`. ZIP corrigido de 217598291 bytes, SHA-256 `4bae42ecb876fc443bb888b08628cbed016e496eaf3f483f6f9e90da5dd738e9`. Bundle assinado ad hoc idêntico ao instalado/conferido, extração e download verificados. Atualizador real testado em isolamento com SQLite sintético, sem abrir o app.

Rota limitada ao snapshot de origem homologado. [Registro completo e limites](https://github.com/vini-duran/ContentFlow_Universal_Integrations/blob/main/docs/releases/APP_0_5_5_ECOSSISTEMA_1.md). Sem notarização nem promessa de migração de qualquer versão. A release fixada não contém as adições posteriores da consolidação de main.

**Instalação local concluída:** macOS arm64, 0.5.2 → 0.5.5, fonte 64fc1bf,
no mesmo caminho do aplicativo operacional. Backup do bundle anterior e dados
mantido localmente. Dashboard nativo confirma v0.5.5. As oito tabelas conferidas
preservaram seus registros: canais, projetos, execuções, bibliotecas,
consentimentos, conexões e workspaces. Registro de 34 plugins sem erro de
manifesto; nenhuma produção/retry iniciada.

O teste nativo de cofre com serviços aleatórios exclusivos e valores sintéticos
passou, inclusive exclusão após novo processo; entradas de teste removidas.
Não foram lidas credenciais existentes. Não equivale a testar todo cofre ou
autorizar rollback indiscriminado.

- Candidata corrigida e publicada:
  [`64fc1bf`](https://github.com/vini-duran/OS/commit/64fc1bfeb93f56a399b498314739fbd55a8b8fbb).
- Cofre: exclusão não reimporta segredo do backup legado; gravação não confirmada
  fica bloqueada. Backup legado preservado. 29 testes isolados passaram.
- Desktop: proteção restaurada contra dados dentro do aplicativo, inclusive
  symlinks; 9 testes de distribuição passaram. Conexões: 2 testes passaram.
- `npm run check` completo passou (lint, tipos, regressões e build).
- Limpeza local: duas extrações antigas conferidas contra o ZIP e um worktree
  limpo removidos; aproximadamente 1,35 GiB em arquivos. ZIP, commits, evidências
  e checkpoint preservados. Nenhum aplicativo instalado ou dado de produção
  foi removido; o volume efetivamente liberado depende do APFS.
- **Não usar o ZIP antigo para atualizar outra máquina.** Use somente o ZIP
  corrigido da release acima e o atualizador universal. O ZIP abaixo é histórico.
- Próxima ação detalhada:
  [estado e limites da 0.5.5](UPDATE_055_REMAINING.md).
  Recuperação:
  [migração do cofre](CREDENTIAL_VAULT_MIGRATION.md).

### Histórico da candidata — não usar como instrução vigente

Upstream `v0.5.5` (`8fe65673332a8eab8542a72f87966abc94310759`) integrado
inicialmente em clone de trabalho do fork para revisão. Naquele momento a distribuição
era `v0.5.2-ecossistema.1` e a promoção estava pendente. A instalação local foi substituída
apenas após os testes e backup descritos acima. Testes de fonte, sozinhos,
não comprovam migração real.

Avanço da candidata, sem aprovação de instalação:

- Fonte construída: `e5f4dcdedac6fb0cac29166ac650ef375a6f7bd0`, versão 0.5.5,
  macOS arm64, Node privado 26.7.0.
- ZIP local: 211540800 bytes; SHA-256
  `1469383b9a7e00663ab0b3daab2a65e61dbf0d3bbb55217138763ce07c226a5f`.
  Não é uma release publicada nem o artefato indicado para atualização.
- Antigravity relatou execução do bundle extraído com dados sintéticos isolados:
  Dashboard, Métodos, Plugins e galeria/zoom/seleção. O Orquestrador conferiu o
  checksum e capturas da seleção e coleção vazia. Restauração de foco não está
  comprovada por uma captura de tela; os limites do relatório são revisados
  separadamente, sem repetir todos os testes.
- Migração da instalação existente, conexões reais e execução de seus plugins
  não foram validadas por esse cenário sintético. Windows e Linux não homologados.
- A reconciliação com a main legada, pendente nessa fase, está registrada acima.
  Não resolver conflitos escolhendo uma branch inteira nem apagar customizações
  para facilitar o merge. Não foi aplicada ao aplicativo operacional.

## Histórico: integração v0.3.5 — 2026-08-23

- Fork local: `origin` = `https://github.com/vini-duran/OS.git`.
- Autor: `upstream` = `https://github.com/andremjr/contentflow-os.git`.
- Upstream integrado em branch isolada: `upstream/main` em `40c841d` (`v0.3.5`).
- Branch de integração: `codex/upstream-0.3.5-safe`, criada a partir de `origin/main` em `5627f29`.
- Personalizações preservadas: runtime macOS, cofre de credenciais, radar Norte Magnata e plugins do fork.
- Correção universal adicionada: caminhos temporários do macOS são canonizados antes de autorizar e entregar o workspace ao sandbox Node 26 (`/var` e `/private/var`).
- Empacotamento macOS validado: `desktop/desktop-paths.cjs` faz parte explicitamente do App e possui teste para impedir nova falha de inicialização.
- Validações aprovadas: `npm run check`, 105 testes dos plugins alterados, teste do radar Norte Magnata e build macOS arm64.
- O App candidato 0.3.5 foi iniciado contra uma cópia do banco: reconheceu 2 canais, 2 projetos e 13 plugins, sem manifesto inválido.
- Durante esta validação, o App instalado permaneceu em 0.3.2 e os dados reais não foram alterados.

## Histórico: plano de promoção da v0.3.5 (não executar na atualização atual)

1. Criar backup SQLite consistente do banco real.
2. Fechar o ContentFlow OS.
3. Preservar o App 0.3.2 como rollback e instalar o candidato 0.3.5 no mesmo caminho.
4. Reabrir e confirmar canais, projetos, plugins, credenciais e o projeto que aguarda seleção de thumbnail.
5. Somente depois promover a branch para `main` do fork.
