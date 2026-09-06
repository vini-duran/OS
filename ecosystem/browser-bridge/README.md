# ContentFlow Browser Bridge

Versão **0.2.1**. A escrita no editor agora favorece o campo de mensagem correto
quando há múltiplos `textbox`, espera a reconciliação da interface e valida começo,
fim e extensão mínima do texto. Em erro, retorna somente os comprimentos esperado
e observado; não registra o conteúdo do prompt.

Extensão companheira Manifest V3 única para todos os plugins de automação de navegador compatíveis com o ContentFlow. Ela é externa ao núcleo e não pertence a nenhum plugin individual.

## Regra de arquitetura

- existe uma única extensão instalada por perfil dedicado;
- cada comando identifica plugin, perfil, execução, origem, aba e versão do protocolo;
- apenas plugins, ações e origens registrados na allowlist da versão instalada são aceitos;
- novos provedores entram por atualização desta mesma extensão, nunca por uma segunda extensão;
- o núcleo do ContentFlow não recebe seletores, cookies, sessões ou regras de fornecedor.

A versão `0.3.0` atende Google Flow, ChatGPT, Claude, Gemini, Grok e Meta AI. A ponte mantém apenas transporte, autenticação efêmera, isolamento por origem/aba/perfil, idempotência e operações de UI limitadas. O Service Worker localiza alvos com scripts efêmeros via CDP e entrega cliques e texto com `Input.*`; o Content Script apenas desperta o worker após a navegação. Seletores e regras de cada provedor continuam no adapter do respectivo plugin.

## Instalação

Consulte [INSTALAR.md](INSTALAR.md). Na V1, o usuário carrega manualmente esta pasta em cada perfil dedicado usando `chrome://extensions` → **Modo do desenvolvedor** → **Carregar sem compactação**.

Scripts pessoais usados pelo mantenedor para preparar vários perfis de sua própria máquina ficam em `local-tools`, ignorados pelo Git, e não fazem parte do aplicativo ou da experiência dos usuários.
# Candidata: vínculo explícito de aba (não instalada/versionada)

Correção posterior à 0.2.1: `identity.supportsTabBinding` e `bindPage` vinculam
uma sessão à aba que contém o marcador efêmero criado pelo plugin. Com vínculo,
nenhum comando escolhe outra aba pela URL e o cache é isolado por aba. Clientes
legados continuam no protocolo 2; Claude candidato exige o novo suporte.
Sem permissões novas. Testes `tab-binding.test.mjs` cobrem URLs duplicadas,
aba fechada, origem/sessão inválidas, ambiguidade e cache, além de 300 comandos
legados. Fonte candidata não pode substituir um pacote 0.2.1 publicado.
