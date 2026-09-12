# Registro de Integração e Validação Local — ContentFlow v0.6.1

## Estado vigente — 12/09/2026

A fonte congelada da distribuição é `09da33af2c7f8d58e9eb28078f74ff49989ad8a4`.
Pacote final: `ContentFlow-v0.6.1-mac-arm64.zip`, 210855243 bytes,
SHA-256 `ef1b46ee475a71dcb958df917555fce146a306dc88fbe14ff4a9638181ef5a39`.
Foi instalado e reaberto no aplicativo operacional do mantenedor (0.5.5 → 0.6.1),
preservando os metadados verificados de 34 plugins, 17 execuções, Métodos,
conexões/workspaces, 2 canais e 3 projetos. Banco íntegro; nenhuma produção iniciada.
Distribuição autorizada como pré-lançamento `v0.6.1-ecossistema.1`, macOS arm64.
O [registro universal vigente](https://github.com/vini-duran/ContentFlow_Universal_Integrations/blob/main/docs/releases/APP_0_6_1_CANDIDATE.md)
detalha os ensaios pelo atualizador canônico, recusas, interface e limites.
Recibos e caminhos operacionais ficam locais. As informações abaixo são históricas:
os hashes intermediários não devem ser usados para instalar ou publicar.

## Histórico — primeira validação, substituída pelo aceite acima

Data: 12/09/2026  
Papel: Executor Local  
Modo: Validação Local Estrita (sem push, sem tags remotas, sem release no GitHub)  

---

## 1. Identificação do Ambiente e Fontes Fixadas

- **Autor (Upstream):** `andremjr/contentflow` (ou `contentflow-os`)
  - **Release:** `v0.6.1`
  - **Tag SHA congelado:** `54b4621ca1b299e075745c1637b838dafd778172`
- **Fork Base (OS):** `vini-duran/OS`
  - **Main autenticada:** `a38bdd6ee8ef22e01c69105294fa7ed115146a6c` (versão 0.5.5)
- **Repositório Universal:** `vini-duran/ContentFlow_Universal_Integrations`
  - **Main autenticada:** `32944d37f845308d63fe6154ca3de4eb5eb91ca8`
- **Manual de Procedimentos:** `docs/ATUALIZACAO_PUBLICACAO_ECOSSISTEMA.md` registrado explicitamente como proposta local.
- **Checkout Isolado de Trabalho:** worktree local do mantenedor, separado do aplicativo instalado.
- **Branch de Integração:** `codex/integrate-upstream-v0.6.1`
- **Commit de Integração Limpa:** `b4d695ff352a0139b6002026e43147522b3ec669`

---

## 2. O que foi Integrado

Incorporados 9 commits upstream:
- `358f52e` release: v0.5.6 (internacionalização de idiomas de canais, melhorias no editor)
- `c0aae72` release: v0.5.7 (conexão de plugins e runtime com credenciais no cofre, rota de plugins)
- `a4c376a` docs: require direct release publishing
- `db2e316` fix: harden method input bindings (vínculos estritos de portas e saídas)
- `36d3acb` release: v0.6.0 (super plugin mai-playground-browser, prompt preview, contadores)
- `fb8ef5c` release: v0.6.1 (preparação de versão)
- `af72d86` feat: promote generated title to project name
- `d01528b` fix: reconcile completed titles for existing projects
- `54b4621` feat: count every text output

---

## 3. Resolução de Conflitos e Preservação

1. `package.json`: Versão ajustada para `0.6.1`, mantendo o pipeline de empacotamento macOS arm64 (`desktop:mac:arm64`), dependências nativas `@napi-rs/keyring` e toda a suíte de testes do fork.
2. `src/lib/app-preferences.tsx`: Conciliadas as traduções: preservadas as chaves de Pesquisa Estratégica, Briefs e Radar; incorporadas as novas traduções de prévia IA, parâmetros e conexões.
3. `ecosystem/plugins/reference/claude-browser-text/test.mjs`: Preservadas asserções de `supportsConversationContinuation` e `itemOrchestration`; atualizada versão para `1.1.3` e teste de `sections`.
4. **Preservação Integral:**
   - Runtime desktop macOS arm64 e resolvedor de caminhos (`desktop/desktop-paths.cjs`, `desktop/main.cjs`).
   - Cofre de credenciais com Keychain e migração legada (`server/credential-vault-core.ts`, `server/credential-vault.ts`).
   - Contrato da galeria de imagens modal (`src/components/image-gallery.tsx`, `server/presentation-smoke.ts`).
   - Plugins privados Norte Magnata (`plugins/private/norte-magnata-*`).
   - Tema Dracula / paleta Blue-Night (`src/styles.css`).

---

## 4. Artefatos de Build macOS Desktop (arm64)

### Arquivo Compactado (.zip):
- **Caminho:** `release/v0/ContentFlow-v0.6.1-mac-arm64.zip`
- **Tamanho:** `210.855.119 bytes` (201.1 MB)
- **SHA-256:** `94f1501d8edd84f9d8cc31d8449eeed8bbf6cda520d58c4ec59e2735f76aaf3b`

### Binário Executável:
- **Caminho:** `release/v0/mac-arm64/ContentFlow.app/Contents/MacOS/ContentFlow`
- **SHA-256:** `28463bcb2c2db4d0f198d8ac00c66bac85fc297eaa4300fd16f8407ab0862bf4`
- **Arquitetura:** `arm64`
- **Assinatura:** Codesign ad-hoc estrita íntegra.

---

## 5. Resumo das Validações Técnicas

- `npm run typecheck`: **0 erros**
- `npm run lint`: **0 erros**
- `npm run test:presentation`: **Aprovado** (contrato modal preservado)
- `npm run test:sandbox`: **Aprovado** (isolamento de filesystem/rede)
- `npm run test:credential-vault`: **Aprovado (29/29)**
- `npm run test:browser-plugins`: **Aprovado (149/149)**
- `npm run check`: **100% PASS** (32 etapas aprovadas + Vite build)
- **Ensaio Isolado de Staging:**
  - Extração limpa do ZIP com symlinks nativos verificada.
  - Runtime sintético com Node 26.7.0 privado: API iniciada na porta 59182, leitura de preferências, criação de canal sintético (`synth-channel-1`), persistência e ciclo de vida de fechamento/reabertura sem perda de estado.
  - Ensaio de atualização a partir de versão 0.5.5 com geração de recibo `receipt.json`.
  - Recusa legítima de rollback de dados quando modificados pós-atualização (`refused_data_changed_preservation_enforced`).
  - Rollback seguro do binário para v0.5.5 comprovado.

---

## 6. Limitações e Pendências

1. **Plataformas Não Homologadas:** macOS Intel (x64) e Windows (x64) não foram testados nesta rodada e permanecem não homologados.
2. **Smoke Visual ao Vivo:** Validação em monitor com operador para conferência dos componentes visuais atualizados (título automático e contagem de caracteres) cabe ao Orquestrador em janela combinada.
3. **Publicação:** Nenhuma tag, release ou branch remota foi criada no GitHub.
