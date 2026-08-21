# Integração Norte Magnata no ContentFlow OS

## Estado

Esta integração está em desenvolvimento na branch `codex/norte-magnata-brief-pesquisa`.

O primeiro incremento cria a base universal de pesquisa por canal:

```text
Pesquisa factual manual
→ brief local sem IA
→ aprovação explícita
→ Biblioteca Estratégica
→ Método Tema curado
```

Ela não executa título, thumbnail, roteiro, narração, assets, edição, renderização ou publicação.

## O que é versionado aqui

- código do ContentFlow OS;
- plugins privados e seus testes;
- templates de Método;
- documentação operacional;
- instruções de atualização, teste e handoff.

## O que não entra no Git

- chaves de API, tokens, cookies e sessões;
- perfil Chrome, dados de Keychain e credenciais do macOS;
- caminhos absolutos da máquina;
- banco local do App, uploads e mídia de produção.

## Continuidade em outra máquina

1. Clone o fork `vini-duran/OS` na branch aprovada.
2. Instale as dependências e use o runtime compatível com o `package.json`.
3. Instale o App empacotado correspondente ao commit aprovado; não misture App antigo com plugins novos.
4. Vincule cada pasta de plugin e conceda somente as permissões declaradas.
5. Preencha credenciais no cofre local do App. Nunca copie o banco ou Keychain enquanto o App estiver aberto.
6. Leia `CHANNEL_RESEARCH.md` antes de configurar o Norte Magnata.

## Critério para promover ao main

- App de teste para macOS compilado a partir do commit exato;
- plugin de pesquisa preserva consentimento em atualização compatível;
- chaves continuam no cofre após fechar/reabrir o App;
- fluxo Pesquisa → Brief → Tema é testado sem produção real;
- `typecheck`, build e testes do plugin passam;
- nenhum segredo ou arquivo local entra no diff.
