# Atualização 0.5.5 — estado vigente

Atualizado em 2026-09-09.

## Concluído

- Release candidata [v0.5.5-ecossistema.1](https://github.com/vini-duran/OS/releases/tag/v0.5.5-ecossistema.1)
  publicada, download/checksum conferidos; fonte `64fc1bfeb93f56a399b498314739fbd55a8b8fbb`.
- Atualizador na [main universal](https://github.com/vini-duran/ContentFlow_Universal_Integrations/blob/main/docs/ATUALIZADOR_APP.md),
  com plano, rota explícita, backup e recibo. Aplicação real das ferramentas
  testada com cópia do bundle de origem e SQLite sintético.
- Instalação local 0.5.2 → 0.5.5 realizada anteriormente, com backup,
  abertura do Dashboard e preservação das oito tabelas conferidas.
- Fonte 0.5.5 reconciliada com a main anterior: pesquisa de canal, consentimentos,
  proteção de dados e migração segura do cofre. [Decisões/testes](MAIN_055_RECONCILIATION.md).

## Limites e próximo passo

A consolidação da fonte **não altera a release já publicada nem o aplicativo
instalado**. A pesquisa/consentimentos reconciliados nesta rodada ainda precisam
de build desktop e validação do cenário de uso antes de uma nova distribuição,
que exige autorização própria. Não reusar o nome/tag/hash da release existente.

Para outra máquina, o caminho atual é o atualizador universal e o artefato
fixado no manifesto. A rota aceita somente a origem/snapshot homologados;
outras versões e instalações personalizadas exigem validação específica.
Windows/Linux e migração irrestrita não foram homologados.

Rollback do aplicativo não autoriza restaurar banco sobre produções novas.
Versões antigas podem ignorar revogações do cofre: veja
[CREDENTIAL_VAULT_MIGRATION.md](../CREDENTIAL_VAULT_MIGRATION.md).

## Preservação

Os backups da instalação, ZIP/checksum e recibos ficam no host que executou a
atualização; caminhos absolutos/credenciais não são publicados.
A consolidação não altera banco, Keychain, plugins instalados, mídia, filas ou
aplicativo operacional, nem inicia/retoma a produção do Magnata.
