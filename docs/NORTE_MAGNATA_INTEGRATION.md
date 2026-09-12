# Integração Norte Magnata — fonte histórica e destino atual

## Estado

A pesquisa estratégica por canal foi preservada na consolidação da main 0.5.5.
Veja [funcionamento](CHANNEL_RESEARCH.md) e [decisões/evidências](historico/MAIN_055_RECONCILIATION.md).
Sua presença na fonte não prova que esteja na release instalada.

As pastas `plugins/private/norte-magnata-*` e o template em `docs/templates/`
foram mantidos para não descartar o trabalho da main anterior. São referências
históricas, **não instrução para substituir os plugins da produção atual**.
Não são incluídos nem ativados pelo build desktop.

## Destinos canônicos

- [Automation_Magnata](https://github.com/vini-duran/Automation_Magnata):
  Proposta Única, Métodos, estratégia, documentação e operação do projeto.
- [ContentFlow_Universal_Integrations](https://github.com/vini-duran/ContentFlow_Universal_Integrations):
  componentes reutilizáveis, governança, entrada e atualização.
- [OS](https://github.com/vini-duran/OS): aplicativo, runtime e compatibilidade.
- Somente local: banco ativo, mídias, credenciais, cookies e perfis de navegador.

Não migrar ou instalar essas cópias históricas por conta própria. A migração de
fontes específicas exige comparar origem, versão, dependências e testes com o
repositório do projeto, preservando os caminhos operacionais existentes.

## Outra máquina

Use a main universal e o artefato fixado no manifesto aprovado. Não procure
uma branch antiga, não compile o Core para instalar plugins, não recrie produção
nem copie banco/cofre como método de atualização. O projeto designado fornece
seu resumo vigente e a etapa autorizada depois da entrada universal.
