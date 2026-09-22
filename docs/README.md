# Documentação do núcleo

Esta pasta descreve o produto ContentFlow. A documentação de plugins, do Browser Bridge, do Plugin Kit e das skills vive separadamente em [`../ecosystem`](../ecosystem/README.md).

## Leitura recomendada

Para nosso fork no macOS: [atualização e instalação](DESKTOP_MACOS.md),
[históricos de integração](historico/README.md) e
[sincronização preservativa](UPSTREAM_SYNC.md). O guia Windows abaixo é herdado;
não representa homologação do nosso ecossistema nessa plataforma.

1. [`ARCHITECTURE.md`](ARCHITECTURE.md) — visão normativa, domínio e fronteiras do produto.
2. [`DESKTOP.md`](DESKTOP.md) — referência técnica Windows herdada.
3. [`LEGAL_AND_LICENSING.md`](LEGAL_AND_LICENSING.md) — mapa jurídico e licenciamento.

## Regra de leitura

`ARCHITECTURE.md` é a fonte normativa do produto. Roadmaps antigos, validações pontuais e documentos de transição não devem competir com ela: decisões já incorporadas à arquitetura são removidas dos documentos de planejamento. Notas históricas de versões permanecem em [`releases`](releases/).

## Desenvolvimento de Métodos e plugins

- Métodos: [`../ecosystem/skills/contentflow-method-development`](../ecosystem/skills/contentflow-method-development/).
- Plugins: [`../ecosystem/skills/contentflow-plugin-development`](../ecosystem/skills/contentflow-plugin-development/).
- Protocolo público: [`../ecosystem/docs/protocol.md`](../ecosystem/docs/protocol.md).
