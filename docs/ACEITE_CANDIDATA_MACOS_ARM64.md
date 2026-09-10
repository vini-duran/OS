# Registro de Aceite da Versão Candidata (macOS arm64)

**Data do Aceite:** 07 de setembro de 2026  
**Status da Avaliação:** **ACEITO** (Escopo macOS arm64 — instalação isolada limpa, coexistência, renderização e restauração)  
**Avaliador / Decisor:** Orquestrador do Ecossistema (Codex)  
**Testador Independente:** Muse Spark (via OpenCode)  
**Executor Técnico:** Antigravity  
**Versão Avaliada:** `ContentFlow v0.5.2` (commit canônico `3ae224464695170372789d7f2b6acc7594760eb7`)  
**Branch Canônica:** `codex/v0.5.2-local-candidate`  
**Repositório Fork Core:** [`https://github.com/vini-duran/OS`](https://github.com/vini-duran/OS)  
**Repositório Canônico Universal:** [`https://github.com/vini-duran/ContentFlow_Universal_Integrations`](https://github.com/vini-duran/ContentFlow_Universal_Integrations)  

---

## 1. Objeto do Aceite

Este documento formaliza o registro de **ACEITE** emitido pelo **Orquestrador do Ecossistema** para o executável desktop `ContentFlow v0.5.2` (macOS arm64), após correção e validação autônoma de coexistência isolada e reteste focal conduzido pelo testador independente **Muse Spark**.

---

## 2. Artefato Desktop Congelado

- **Arquivo:** `ContentFlow-0.5.2-mac-arm64-85382ee5.zip`
- **Tamanho exato (`stat`):** `206.552.441 bytes` (206552441 bytes)
- **SHA-256:** `85382ee50b94af31f4785979381889af8a0268a56cfc9e03db62b1ae38ad6f6f`
- **Commit Base:** `3ae224464695170372789d7f2b6acc7594760eb7`
- **Localização de preservação durável das evidências:** `release/evidencias-aceite-85382ee5/`

---

## 3. Evidências do Reteste Independente (Muse Spark)

1. **Instalação Isolada (`install-app`):** Extração em staging limpo sem tocar na instalação de produção existente em `/Applications/ContentFlow OS.app`.
2. **Correção de Coexistência Comprovada:** Invocação do binário com `CONTENTFLOW_ELECTRON_USER_DATA_DIR` e `CONTENTFLOW_DESKTOP_DATA_DIR` dedicados. O binário configurou o caminho isolado de `userData` antes de invocar `requestSingleInstanceLock`, permitindo a execução paralela de duas instâncias independentes sem colisão.
3. **Validação Visual e Navegação (Playwright):**
   - Dashboard: tela inicial carregada com sucesso (`shot-dashboard.png`), cabeçalhos, barra de canais e selo `ContentFlow v0.5.2`.
   - Métodos: clique de navegação e renderização da interface de Métodos (`shot-metodos.png`) com `PAGE_ERRORS: []`.
4. **Encerramento e Reversão Limpa:** Término da instância candidata e restauração atômica pelo recibo `install-app` sem deixar resíduos no staging.

---

## 4. Reconciliação do Histórico

A divergência temporária de integridade anotada na auditoria inicial decorreu da captura da árvore do bootstrap em momento transitório de implementação do `check-update`. Com os commits subsequentes no repositório universal, a integridade determinística de 51 arquivos e 5 skills foi restabelecida e confirmada.

---

## 5. Limites do Aceite e Pendências Reais

1. **Plataformas Não-macOS:** Validações de empacotamento Windows e Linux permanecem em estado planejado e dependem de reteste futuro em hardware correspondente.
2. **Migração de Dados e Plugins:** O aceite valida a integridade do binário e execução limpa; não homologa a migração do banco de dados SQLite real ou de plugins de produção em execução.
3. **Proteção contra Colisão de Caminhos no macOS:** Preservada a distinção entre a pasta do Workplace (`~/ContentFlow`) e a pasta do Core (`~/contentflow`).
4. **Preservação Estrita da Produção Ativa:** A instância em produção continuou em execução e não foi alterada nem substituída. A troca do aplicativo real exigirá procedimento próprio, backup validado e autorização expressa do titular.

---

## 6. Parecer Conclusivo

**PARECER DO ORQUESTRADOR: ACEITO NO ESCOPO MACOS ARM64**
