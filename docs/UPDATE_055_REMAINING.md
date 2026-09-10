# Atualização 0.5.5 — estado e próxima ação

Atualizado em 2026-09-09. Instalação local 0.5.2 → 0.5.5 realizada a partir de
64fc1bf, com backup. Abertura e preservação verificadas. Não é ainda release
para outra máquina nem homologação de atualização de qualquer versão antiga.

## Correções concluídas em fonte

- Cofre: exclusão persistente, migração confirmada e testes sem Keychain nativo.
  Procedimento e recuperação: [CREDENTIAL_VAULT_MIGRATION.md](CREDENTIAL_VAULT_MIGRATION.md).
- Desktop: restaurada a proteção contra dados dentro do aplicativo, inclusive
  diretórios ainda inexistentes sob symlinks. A verificação ocorre antes da
  criação de userData e antes de iniciar a API. Helper incluído no pacote.
- Validação focal: 29 testes do cofre, 2 de conexões e 9 de distribuição passaram.
- Validação completa da fonte: `npm run check` passou nesta revisão, incluindo
  lint, tipos, suítes de regressão e build. Isso não é teste de migração nativa.

## O que ainda impede promoção funcional e instalação

1. Teste nativo do cofre concluído com serviços sintéticos de nome aleatório
   exclusivo, sem ler credenciais existentes. Exclusão persistiu em novo
   processo e as entradas de teste foram removidas.
2. Concluir reconciliação da main histórica: recurso de pesquisa de canal,
   consentimentos e demais diferenças precisam de destino/compatibilidade
   registrados. Não substituir uma branch inteira para resolver conflitos.
3. Pacote local atualizado construído e instalado, com assinatura ad-hoc.
   O ZIP anterior não contém estas correções; gerar artefato de distribuição
   final após a reconciliação de main.
4. A cópia dos dados abriu na candidata sem perda nas oito tabelas conferidas;
   depois da instalação, 34 plugins sem erro de manifesto e mesmos hashes
   de canais/projetos/execuções/conexões/permissões/workspaces. Falta promover
   a fonte reconciliada para main,
   publicar release autorizada e conferir download/hash. Só depois atualizar
   o manifesto universal e orientar a outra máquina.

Rollback de aplicativo não autoriza restaurar banco sobre novas produções.
Versões antigas podem ignorar a revogação do cofre: ver o procedimento específico.
Não acessar credenciais reais nem substituir apps ativos para acelerar o aceite.

## Limpeza desta rodada

Removidas duas cópias extraídas da candidata anterior, após comparar todos os
14.642 arquivos/links de cada cópia com o ZIP preservado, sem divergências.
Removido também o worktree limpo de integração descartada, recuperável pelo Git.
Economia estimada pelo uso reportado antes da limpeza: aproximadamente 1,35 GiB;
o espaço físico efetivo depende de clones/snapshots do APFS.

Preservados: ZIP anterior e hash, fontes/commits, evidências de interface,
checkpoint das correções e dados sintéticos pequenos úteis à retomada.
Não foram removidos aplicativo instalado, banco, cofre, plugins instalados,
imagens, filas ou arquivos de projetos operacionais.

## Produção

Esta atualização não inicia, pausa ou reinicia produção. A Produção 2 do Magnata
continua sob comando do proprietário no fluxo existente; testes da candidata
nunca contam como produção concluída.
