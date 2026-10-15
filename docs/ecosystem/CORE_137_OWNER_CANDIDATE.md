A montagem com npm11.19 registra ainda allowScripts somente para as versoes fixadas better-sqlite3@13.0.3, electron@41.10.7 e esbuild@0.28.2, necessarias para compilar/carregar as dependencias e obter o Electron. Nao ha aprovacao global de scripts ou mudanca de versoes.

> **Ajuste de montagem —15/10/2026:** a instalacao limpa no macOS revelou que o binding Windows do keyring estava declarado como obrigatorio. Foi movido para optionalDependencies e o lock atualizado, mantendo versao/integridade de todos os pacotes. O manifesto do pacote fixa a revisao apos esse ajuste. Nenhum codigo de runtime, perfis, cofre ou migracao mudou; o registro da etapa de fonte abaixo permanece historico para sua basee18928f.

# Candidata do Core1.3.7 da equipe — fonte consolidada

**15/10/2026: fonte candidata em branch, sem App novo, tag, release ou instalacao.** Proxima etapa: empacotar ARM64 a partir desta arvore limpa, identificar o commit e encaminhar o pacote ao orquestrador do MacBook Air M1 para atualizacao/aceite. Verificacoes locais de configuracao/origem nao substituem o aceite no destino.

## Fonte e responsabilidade

- Repositorio de destino: `vini-duran/OS`. Original `andremjr/contentflow` permanece referencia de consulta; nenhum envio ao original.
- Base original1.3.7: `dee47c7ebfbcf22b13df0ff95f4ce806d40d1af9`.
- Revisao local de referencia: `f8c7771057aec69c4270b637ebfc8adfc7a42baf` (16 commits sobre a base), cuja API foi reconstruida em memoria e conferida identica a instalada na origem.
- Historico publicado do fork incorporado como ancestral: `555892b3bd2f2d2f23107220848c08b8b1d8ccd7` (ultima release publicada1.1.0-ecossistema.2).
- Branch candidata: `codex/core-consolidation-stage52`. Para identificar a revisao exata: `git rev-parse HEAD`. O recibo do consumidor e o manifesto do futuro pacote devem fixar esse SHA, nunca seguir main/latest sem conferir.

Este trabalho nao migra a PUC Magnata nem inclui seus canais, estrategias, voces, Metodos, plugins instalados, midia ou dados. Cada maquina adapta seus componentes aos contratos do Core. Os exemplos oficiais presentes na arvore fonte nao sao instalados automaticamente no App; nenhum pacote privado do fork antigo foi reintroduzido.

## Reconciliacao deliberada

[core-137-reconciliation.json](core-137-reconciliation.json) registra129 caminhos alterados no fork antigo desde o ancestral comum, os44 conflitos obtidos no merge virtual e a decisao para cada superficie. A referencia executavel e a1.3.7 utilizada na origem, nao uma combinacao automatica das politicas1.1/1.3.

O merge de historico preserva a arvore da candidata e o segundo ancestral do fork (`ours` deliberado). Isso conserva os commits antigos para consulta, mas **nao significa que todos os recursos antigos foram portados ou que os44 conflitos receberam uma fusao funcional linha a linha**. As restauracoes selecionadas e as alteracoes executaveis deste trabalho sao listadas abaixo. Nao usar uma resolucao automatica por arquivo para reinserir implementacoes obsoletas.

Mantidos da referencia local: contratos atuais de conteudo/Metodo/API2, runtime de execucao e perfis, colecoes opcionais vazias, selecao de projetos por perfil, migracao semantica de JSON, Bridge0.5.1/rascunho/readback, Dracula/Claro e organizacao responsiva dos plugins. Nenhum arquivo de `server/`, `src/` ou `ecosystem/browser-bridge/` mudou em relacao a referencia local.

Recursos do fork1.1 que nao estao nessa referencia continuam no historico e requerem adaptacao explicita se desejados: atalho de buscaCmd+F, pesquisa editorial de canal, plugins privados, implementacoes antigas de cofre/retomada e schemas/API1. Nao os declarar preservados funcionalmente pela mera ancestralidade. Metodos antigos/API1 nao recebem adapter silencioso. O orquestrador do destino deve conferir principalmente dados locais, acesso ao cofre e componentes proprios durante a atualizacao; nenhum segredo foi acessado, copiado ou migrado aqui.

Os seis arquivos pendentes no checkout de desenvolvimento da origem (erros tipados de sincronizacao/importacao de Metodos, testes e documentos) permanecem separados. Eles nao estavam na API instalada de referencia e nao foram incluidos nem descartados nesta candidata.

## Alteracoes desta consolidacao

1. `package.json`: apenas owner/repo de publicacao mudaram para `vini-duran/OS`; versao, dependencias e lock permanecem iguais.
2. `desktop/updater.cjs`: link de releases aponta ao fork. Estados, mensagens, IPC e politica de atualizacao permanecem. macOS automatico continua desabilitado; nao declarar atualizacao automatica ou compatibilidade remota comprovada. Enquanto a nova release nao existir, o link latest ainda resolve a versao antiga publicada.
3. `desktop/updater.test.cjs`: a acao real de IPC `open-releases` confere explicitamente a URL do fork.
4. `docs/AUTORIZACAO_E_LICENCA.md`: restaurado byte a byte do fork; autoria/licenca original inalteradas. Evidencias privadas de autorizacao continuam sob custodia do proprietario, fora desta arvore.
5. `scripts/package-macos-release.sh`: restaurado byte a byte do fork, incluindo recusa de sobrescrita, ARM64, bundle ID e verificacao de assinatura do ZIP extraido. So sera executado sobre a candidata no empacotamento; nenhum App foi assinado/copiado nesta etapa. Assinatura ad hoc nao equivale a notarizacao nem identidade estavel de assinatura.

Nao foram reintroduzidos workflows do GitHub Actions; a candidata nao possui `.github/workflows`. Build/pacote sera local. Nenhuma versao foi incrementada e nao ha tag/release nova. Publicar fonte de revisao em branch nao transforma o pacote em stable nem altera main.

## Reproducao e encaminhamento

A etapa de empacotamento devera usar checkout limpo deste commit e dependencias fixadas no package-lock. Node26 e macOS ARM64 sao requisitos da montagem; pacote deve conter runtime, workers, interface e Bridge compativeis, sem conteudo local da origem. Incluir commit/hashes no manifesto do pacote, pois o build-info herdado informa versao/Node/data sem fixar o commit.

O outro orquestrador precisa receber: URL da branch/commit, pacote ARM64/hash, contratos vivos (`docs/ARCHITECTURE.md`, `docs/CONTENT_CONTRACT.md`, `docs/PLUGIN_INTERFACE.md`), este registro, mapa de reconciliacao e procedimento de atualizacao/recuperacao. Ele preserva seus dados, atualiza e testa sua instalacao1.1.0, informando problemas por revisao e evidencia sanitizada. Nao precisa reconstruir as correcoes aqui registradas do zero.

A manutencao futura pode consultar ambos os repositorios. Preservar historico nao autoriza seguir automaticamente o original ou instalar main do fork. Nunca restaurar banco antigo sobre producoes novas apenas para reverter o App.
