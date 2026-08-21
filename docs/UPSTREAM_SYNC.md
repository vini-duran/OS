# Sincronização segura com o upstream

## Regra

O fork não faz merge ou instalação automática de atualizações do autor. Ele pode detectar atualizações automaticamente, mas a integração deve ocorrer em branch isolada e com testes.

## Motivo

O fork contém personalizações do Norte Magnata, plugins privados e correções de portabilidade para macOS. Um merge automático pode alterar contratos, permissões, runtime, credenciais ou comportamento de execução.

## Processo por atualização

1. Atualize apenas as referências: `git fetch upstream --prune`.
2. Registre o commit/tag novo e leia notas de release e diff relevante.
3. Crie uma branch `codex/upstream-<versao>` a partir do main aprovado.
4. Integre o upstream nessa branch, resolvendo conflitos sem apagar personalizações.
5. Rode typecheck, build, testes de plugins e teste do App em cópia isolada de dados.
6. Confirme consentimentos, cofre de credenciais e plugins vinculados.
7. Só após aprovação humana, faça merge no main, publique o App e registre o commit/versão em `NORTE_MAGNATA_INTEGRATION.md`.

## Estado observado em 2026-08-21

- Fork local: `origin` = `https://github.com/vini-duran/OS.git`.
- Autor: `upstream` = `https://github.com/andremjr/contentflow-os.git`.
- Atualização externa disponível: `upstream/main` em `f2ba0ec` (`v0.3.1`).
- Essa versão ainda não foi integrada ou instalada neste fork.
