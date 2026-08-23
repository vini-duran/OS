# Sincronização segura com o upstream

## Regra

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
7. Só após aprovação humana, faça merge no main, publique o App e registre o commit/versão em `NORTE_MAGNATA_INTEGRATION.md`.

## Integração v0.3.5 — 2026-08-23

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

## Promoção segura do App

1. Criar backup SQLite consistente do banco real.
2. Fechar o ContentFlow OS.
3. Preservar o App 0.3.2 como rollback e instalar o candidato 0.3.5 no mesmo caminho.
4. Reabrir e confirmar canais, projetos, plugins, credenciais e o projeto que aguarda seleção de thumbnail.
5. Somente depois promover a branch para `main` do fork.
