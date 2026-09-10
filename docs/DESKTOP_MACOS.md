# ContentFlow no macOS — instalar e atualizar

## Operador: use o artefato aprovado, não uma compilação improvisada

Leia o [atualizador universal](https://github.com/vini-duran/ContentFlow_Universal_Integrations/blob/main/docs/ATUALIZADOR_APP.md).
Ele identifica a instalação existente, verifica o artefato por hash, exige rota
compatível e aplica somente com aplicativo/dados fora de uso e backup/recibo.
Se a versão ou o snapshot de origem não estiverem cobertos, mantenha o aplicativo
atual e solicite a validação da rota. Não substitua simplesmente a pasta `.app`.

Release candidata disponível: [v0.5.5-ecossistema.1](https://github.com/vini-duran/OS/releases/tag/v0.5.5-ecossistema.1),
macOS arm64, fonte `64fc1bfeb93f56a399b498314739fbd55a8b8fbb`.
A main contém reconciliações posteriores; código em main não muda esse ZIP.
Veja [escopo da consolidação](MAIN_055_RECONCILIATION.md).

## Quatro camadas, preservadas

- Workplace e projetos: caminhos existentes, sem reorganização automática.
- Aplicativo: conservar o caminho real instalado, que pode chamar-se
  `ContentFlow.app` ou `ContentFlow OS.app`.
- Dados: identificar o diretório efetivo do processo/recibo. Não assumir que
  `Application Support/ContentFlow` e `Application Support/ContentFlow OS`
  sejam intercambiáveis. Banco, mídia, plugins e configurações ficam fora do bundle.
- Configuração dos agentes: entrada e skills separadas do executável.

O cofre usa o provedor nativo e trata o armazenamento legado conforme
[CREDENTIAL_VAULT_MIGRATION.md](CREDENTIAL_VAULT_MIGRATION.md). Não exportar
segredos, apagar backups legados ou preencher novamente todas as chaves por rotina.
Assinatura ad hoc não é notarização nem garantia de confiança automática no macOS.

## Mantenedor: compilar em checkout isolado

Requisitos: Node 26 e npm 10+. Na revisão fixada do fork:

```sh
npm ci
npm run check
npm run desktop:mac:arm64
```

Saída de build: `release/v0/mac-arm64/ContentFlow.app`, não o aplicativo instalado.
Teste com diretórios exclusivos de dados e userData sintéticos antes de distribuir;
nunca abra uma compilação candidata contra dados reais por conveniência.
O runtime Node privado e o helper de proteção de caminhos fazem parte do pacote.
Plugins privados/de referência não são incluídos nem ativados pelo build do Core.

Publicação de um novo binário e migração real são etapas distintas da consolidação
de fonte. Não iniciar produção ou restaurar banco sobre entregas novas para testar.
