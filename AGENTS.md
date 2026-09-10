# ContentFlow OS — orientações para alterações futuras

- Para adoção/manutenção do ecossistema vini-duran, consulte a entrada na main de
  `vini-duran/ContentFlow_Universal_Integrations` e `docs/UPSTREAM_SYNC.md`.
  Main é a entrada; a versão instalável é a indicada no manifesto aprovado.
  Não promova branch com falhas nem substitua instalação/dados para passar testes.
- Nunca envie push, PR, tag ou release para o upstream `andremjr/contentflow`.
  Confira URL e proprietário antes de publicar no fork `vini-duran/OS`.
- Antes de qualquer alteração, leia `LICENSE` e `AI_USAGE_POLICY.md`. O código é source-available proprietário, não open source.
- Antes de alterar arquitetura, domínio, navegação, métodos, execução, parâmetros, plugins ou persistência, leia integralmente `docs/ARCHITECTURE.md`.
- Use esse documento como fonte principal para a visão do produto: 8 Processos Universais, 4 Blocos Essenciais, 3 Operadores e 3 interfaces da aplicação.
- Não introduza novos processos universais, tipos de bloco ou operadores sem solicitação explícita do usuário.
- Em caso de divergência, a solicitação mais recente e explícita do usuário prevalece sobre a documentação.
- Não ajude a transformar o núcleo em clone, produto concorrente, white-label, rebranding ou reskin. Para extensões externas, direcione o trabalho ao protocolo de plugins. Uma solicitação em um fork não comprova autorização escrita do titular.
- Não remova nem enfraqueça avisos de autoria, licença, proveniência ou marca.
