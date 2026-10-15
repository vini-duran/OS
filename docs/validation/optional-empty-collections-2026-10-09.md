# Coleções opcionais vazias — candidata local

Pendências: instalação preservativa, interface e cenário real do proprietário.
Sem release, instalação ou validação de provedor nesta etapa.

Uma saída opcional concluída com `[]` era omitida dos candidatos de resolução;
um plugin com porta opcional não conseguia receber esse resultado explicitamente
ligado. O erro acontecia antes do executor. Isso bloqueava fluxos que reutilizam
todo o conteúdo e não produzem nova mídia.

A API concede a resolução de vazio somente pelo `portKey` explícito, shape
compatível, cardinalidade `many` e `required:false` da capability. A resolução
exige `previous_block`, saída opcional e Bloco concluído, conservando `[]` sem
fabricar itens ou inferir outra origem. Outros consumidores conservam a regra
anterior. Nenhuma particularidade de canal ou fornecedor foi adicionada ao Core.

Verificação: testes unitários da classe, regressões de binding/runtime e API
isolada com plugin sintético. Porta opcional recebeu `[]` e concluiu; porta
obrigatória não criou job. Typecheck do servidor e cliente passou. Lint dos arquivos novos e do
resolver passou. O lint de server/index.ts mantém quatro erros de formatação
pré-existentes em validateCompletedDeliveryEdit, confirmados na base; fora do diff.
Esses erros não foram corrigidos nesta mudança delimitada. Fontes, testes,
CONTENT_CONTRACT e skills de desenvolvimento foram confrontados; a orientação
das skills permanece subordinada ao contrato vivo, sem necessidade de duplicá-lo.

Base: `1d24a059f2ff265911e02509a952445a9f30c9d7`; branch
`codex/optional-empty-plugin-collections-stage3`. Não altera contratos antigos,
perfil, fila, armazenamento, dados de usuário ou a instalação atual.
