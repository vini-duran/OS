# ContentFlow

## Ecossistema vini-duran — entrada pela main

Este fork mantém o aplicativo, runtime e contratos técnicos. A main é fonte
consolidada, não a identidade de um pacote já publicado.

- [Entrada e configuração do agente](https://github.com/vini-duran/ContentFlow_Universal_Integrations/blob/main/docs/fluxos/entrada/README.md).
- [Instalar/atualizar esta máquina](https://github.com/vini-duran/ContentFlow_Universal_Integrations/blob/main/docs/fluxos/manutencao-local/README.md).
- [Publicar ou adotar plugins e ferramentas da equipe](https://github.com/vini-duran/ContentFlow_Universal_Integrations/blob/main/team-bootstrap/skills/contentflow-universal-integration-governance/references/publicacao-e-adocao.md).
- [Evoluir, validar localmente e publicar nosso fork](docs/UPSTREAM_SYNC.md).
- [Versão aprovada, plataformas, rotas e evidências](https://github.com/vini-duran/ContentFlow_Universal_Integrations/blob/main/configs/distribution/README.md):
  consulte o manifesto na revisão fixada; não escolher a versão pelo histórico.
- [Históricos de integração](docs/historico/README.md): fatos e limites de
  rodadas anteriores, sem procedimentos concorrentes na raiz.

O número de versão em `package.json` identifica esta fonte; o manifesto universal
identifica a distribuição consumível. Commits documentais não mudam o ZIP.
As escolhas da Proposta Única pertencem ao humano e ao repositório do projeto.

| Destino | Responsabilidade |
| --- | --- |
| [Universal](https://github.com/vini-duran/ContentFlow_Universal_Integrations) | Entrada, skills, mecanismos compartilhados e atualização preservativa |
| [Automation_Magnata](https://github.com/vini-duran/Automation_Magnata) | Proposta Única, Métodos, estratégia e operação do Magnata |
| Este fork | Aplicativo, runtime e compatibilidade; upstream somente consulta/fetch |

Não mova pastas de projetos existentes nem dados/cofre para dentro do aplicativo.
Windows e Linux não estão homologados por esta rodada do nosso ecossistema.

O ContentFlow é um gerenciador estratégico de Métodos para produção de conteúdo. Ele separa a estratégia — processos, blocos, operadores, prompts, parâmetros e aprovações — da execução funcional feita por pessoas ou por plugins independentes.

> O núcleo e os plugins são produtos separados. O aplicativo funciona sem plugins; nenhum pacote do ecossistema é incorporado, ativado ou tratado como confiável pela distribuição do núcleo.

## Encontre o que precisa

| Área         | Conteúdo                                                                         | Comece aqui                                                                                            |
| ------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Núcleo       | Interface React, API local, execução de Métodos, persistência e desktop Electron | [`docs/README.md`](docs/README.md)                                                                     |
| Ecossistema  | Protocolo público, plugins, exemplos, Browser Bridge, Plugin Kit e skills        | [`ecosystem/README.md`](ecosystem/README.md)                                                           |
| Criar plugin | Guia rápido, templates, testes e contratos da Plugin API v1                      | [`ecosystem/docs/quickstart.md`](ecosystem/docs/quickstart.md)                                         |
| Criar Método | Skill portátil para modelar e validar arquivos `.contentflow-method.json`        | [`ecosystem/skills/contentflow-method-development/`](ecosystem/skills/contentflow-method-development/) |
| Releases     | Distribuições do nosso fork e limites de instalação                            | [GitHub Releases do fork](https://github.com/vini-duran/OS/releases)                                    |

## Instalação e preservação

No macOS, siga [DESKTOP_MACOS.md](docs/DESKTOP_MACOS.md). O manifesto universal
define o artefato e as rotas de migração aceitas; a última versão numérica do
autor não substitui essa decisão. Projetos, plugins e credenciais existentes
devem ser preservados e conferidos antes/depois. Uma instalação vazia começa
sem plugins: eles são pacotes separados, sujeitos a consentimento.

O [guia Windows herdado](docs/DESKTOP_V0.md) documenta o produto upstream;
não representa homologação do nosso fork nessa plataforma.

## Estrutura do repositório

```text
contentflow/
├── src/                 interface e domínio compartilhado do núcleo
├── server/              API local, persistência e motor de execução
├── desktop/             shell Electron, empacotamento e atualização
├── docs/                arquitetura, produto, desktop e licenciamento
├── ecosystem/           tudo que é externo ao núcleo
│   ├── plugins/         pacotes de referência e exemplos comunitários
│   ├── browser-bridge/  extensão companheira para automação de navegador
│   ├── plugin-kit/      CLI e templates para autores
│   ├── skills/          skills de criação de plugins e Métodos
│   └── docs/            protocolo, segurança e guias do ecossistema
└── .github/             automações e governança do repositório
```

As pastas `src`, `server` e `desktop` compõem o produto ContentFlow. A pasta `ecosystem` contém ferramentas e pacotes interoperáveis, publicados no mesmo repositório apenas para facilitar descoberta, estudo e desenvolvimento.

## Plugins

Os pacotes atualmente disponíveis em [`ecosystem/plugins/reference`](ecosystem/plugins/reference/) são plugins independentes disponibilizados separadamente. Eles não fazem parte do núcleo e sua presença neste repositório não representa promessa de manutenção contínua, suporte, disponibilidade de provedores ou compatibilidade futura. Cada plugin possui identidade, versão, permissões, dependências e licença próprias; quem cria ou distribui um plugin é responsável por seu pacote.

O ContentFlow valida todos os plugins pela mesma Plugin API v1, solicita consentimento local e executa o código em processo separado com a sandbox de permissões do Node. APIs oficiais, automações de navegador, FFmpeg, Python e regras específicas de fornecedores permanecem dentro dos respectivos plugins.

O instalador aceita tanto a pasta de um plugin quanto a raiz extraída de `ContentFlow-Plugins.zip`. No segundo caso, valida o conjunto antes de instalar, adiciona todos os plugins novos em lote e preserva sem sobrescrever os que já estavam instalados.

Não existe categoria especial baseada no autor: os plugins criados pelo autor do ContentFlow e os
criados por qualquer participante da comunidade usam o mesmo download por pasta, a mesma validação,
o mesmo consentimento, a mesma ativação e a mesma sandbox.

## Desenvolvimento local

Requisitos: Node.js 26 e npm 10 ou superior.

```sh
git clone https://github.com/vini-duran/OS.git
cd OS
npm ci
npm run dev
```

Antes de enviar alterações:

```sh
npm run check
```

Para criar e validar um plugin:

```sh
npm run plugin:kit -- create ./meu-plugin
npm run plugin:kit -- check ./meu-plugin
```

## Documentação essencial

- [Arquitetura e visão de produto](docs/ARCHITECTURE.md)
- [Plugin API v1](ecosystem/docs/protocol.md)
- [Segurança de plugins](ecosystem/docs/security.md)
- [Automação de navegador](ecosystem/docs/browser-automation.md)
- [Distribuição e responsabilidades](ecosystem/docs/distribution.md)
- [Licença e uso de IA](LICENSE)

## Licença

O núcleo é source-available proprietário, não open source. Leia [`LICENSE`](LICENSE) e [`AI_USAGE_POLICY.md`](AI_USAGE_POLICY.md) antes de usar ou alterar o código. Plugins independentes podem adotar suas próprias licenças dentro dos limites do protocolo público e da exceção de interoperabilidade prevista na licença.
