# Pesquisa estratégica por canal

## Objetivo

Pesquisa é uma camada factual do canal. Ela não é um nono processo por vídeo e não cria automaticamente Tema, Título, Thumbnail, Roteiro, mídia ou publicação.

## Fluxo

```text
Radar factual configurado no Método Tema
→ conectar plano de pesquisa do canal
→ executar snapshot manual
→ gerar brief local (0 tokens)
→ aprovação humana
→ Biblioteca Estratégica
→ Método Tema curado
```

## Responsabilidades

- O plugin de pesquisa coleta fatos públicos e preserva a origem.
- O brief local separa observado, inferência/hipótese, limites anti-cópia e limitações.
- A aprovação cria um item na coleção **Briefs estratégicos aprovados** do canal.
- O Método Tema deve começar com um bloco `ESCOLHER` que seleciona esse item; depois cria 3–5 candidatos e o operador aprova um.

## Configuração inicial

No canal, abra **Pesquisa estratégica** e use **Conectar Radar do Tema**. A ação copia a configuração do primeiro bloco `BUSCAR / Código` do método Tema, sem mudar as consultas e sem copiar credenciais.

Depois:

1. Execute uma pesquisa manual.
2. Revise o snapshot.
3. Gere o brief local; ele usa zero tokens.
4. Aprove o brief apenas se as referências forem aproveitáveis sem cópia.
5. Inicie um projeto e execute o Tema curado.

## Limites

- Chaves, cookies e caminhos locais não entram no banco, método, brief ou Git.
- Um brief não prova retenção, vendas, país da audiência, qualidade ou causalidade.
- Uma atualização de plugin pode exigir consentimento no App atual. A correção de preservação de consentimento precisa estar no App instalado antes de atualizações rotineiras de versão.
