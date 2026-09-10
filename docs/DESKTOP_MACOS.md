# Atualização do ContentFlow no macOS

## Para quem opera

Não é preciso escolher uma branch. Comece pelo
[procedimento universal na main](https://github.com/vini-duran/ContentFlow_Universal_Integrations/blob/main/docs/ATUALIZACAO_UNIVERSAL.md).
Ele aponta a distribuição aprovada do nosso fork. A versão do autor é uma
referência para manutenção, não uma ordem para substituir seu aplicativo.

Em 2026-09-09, a distribuição existente é `v0.5.2-ecossistema.1`, testada para
instalação limpa macOS Apple Silicon. A candidata `0.5.5` está em revisão
isolada. A main histórica `0.3.5` não deve ser instalada sobre uma versão maior.
Consulte o [manifesto atual](https://github.com/vini-duran/ContentFlow_Universal_Integrations/blob/main/configs/distribution/app-distribution.json).

## O que o técnico deve conferir

1. **Onde está o trabalho:** Workplace, projeto legado, bundle realmente aberto,
   diretório de dados em uso e jobs/automação em andamento. Não mude esses caminhos.
2. **Qual atualização:** origem, commit, versão, arquitetura, pacote completo e
   SHA-256. Hash do executável Electron sozinho não identifica código/runtime/plugins
   que ficam dentro do restante do bundle.
3. **Como preservar:** checkpoint das mudanças locais, cópia recuperável do App
   e backup consistente dos dados. Banco SQLite ativo pode depender de WAL/SHM;
   copiar apenas o arquivo principal não comprova backup completo.
4. **Como testar:** instalação e interface da candidata com dados sintéticos e
   diretórios exclusivos de userData, dados e saída. Teste de migração real é
   separado: exige cópia consistente e controlada, sem ativar jobs, contas ou
   provedores reais. Não exporte o cofre nem segredos para preparar fixtures.
5. **Quando aplicar:** após os testes específicos da versão, com janela de
   manutenção sem jobs ativos. Não mate processos nem reinicie geração para atualizar.
6. **Como voltar:** registre o recibo/checkpoint exato. Se o banco tiver migrado,
   restaurar só o App antigo pode não ser suficiente; teste a recuperação conjunta.

Se qualquer item falhar, mantenha a instalação atual e diga o impacto e a
recomendação: adaptar, incorporar só a melhoria compatível ou aguardar. Não
transforme falha de migração em aprovação porque os testes de fonte passaram.

## Bundle, runtime e cofre são coisas distintas

Substituir apenas alguns arquivos de uma compilação não equivale a instalar o
pacote completo. Antes de usar um atualizador parcial antigo, confira Node,
dependências nativas, layout e nomes de executáveis exigidos pela nova versão.

Assinatura, notarização e identidade do executável devem ser verificadas no
artefato. Não se presume identidade estável entre recompilações nem ausência de
novo pedido de acesso ao Chaveiro. Se o macOS pedir consentimento ou bloquear a
abertura, informe a ação exata ao operador; não desative proteções.

## Compilação de desenvolvimento

Use Node 26 e os scripts declarados no `package.json` da revisão fixada. O nome
do script e do bundle muda entre versões; confira-os antes de executar. Faça
build em checkout isolado, sem instalar em Applications. Registre commit,
dependências, log, build-info e hash do pacote completo. O build não constitui
homologação de interface, instalação ou migração.
