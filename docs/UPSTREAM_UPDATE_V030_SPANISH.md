# Integração upstream v0.3.0 — operação Spanish

Data: 2026-08-15  
Escopo: cópia local autorizada do ContentFlow OS usada para validar o canal Spanish.  
Sem push, fork, publicação, geração de mídia ou chamada externa de IA nesta integração.

## Origem e preservação

- Upstream integrado: `origin/main` commit `0850e7b` (`v0.3.0`).
- Recurso principal do upstream: encadeamento automático de blocos com plugin não humano.
- Branch local de integração: `spanish-integration-v030`.
- Antes do merge, as adaptações Spanish foram preservadas em um commit local.
- Nenhum histórico, estado, mídia ou identidade de outros canais foi importado.

## Adaptações mantidas

- pesquisa diária por canal e brief semanal aprovado;
- plugins Spanish vinculados localmente;
- telemetria de tokens por bloco no painel de resultados;
- normalização das respostas textuais do plugin OpenAI;
- suporte desktop macOS;
- entrega explícita de packaging aprovado entre processos.

## Correção macOS incluída

No macOS, `/var` pode resolver para `/private/var`. O executor de plugins agora deriva a pasta de saída a partir do workspace canônico antes de aplicar as permissões do Node. Isso impede que um plugin comunitário com `filesystem:write` seja bloqueado ao gravar seu próprio artifact.

## Segurança operacional

O v0.3.0 inicia automaticamente blocos de `Código` e `IA` depois que uma execução é iniciada. A atualização não remove gates `Humano`; ela apenas elimina o clique manual para cada plugin não humano.

- O projeto Spanish existente continua parado em `Revisar e aprovar roteiro`.
- Nenhuma voz, imagem, vídeo, edição, renderização ou publicação foi iniciada.
- Nenhuma chamada de IA foi disparada durante a atualização ou a validação.
- O teto por chamada (`max_output_tokens`) continua configurado nos Métodos.

## Limitação conhecida

O painel já registra uso real de tokens por bloco, mas o núcleo ainda não aplica um teto diário agregado por projeto/conta antes de cada chamada OpenAI. Antes de usar execução automática em volume, implementar ou conectar o `BudgetLedger` local é a próxima proteção recomendada.

## Validação executada

Com Node 26:

```text
npm run check
```

Resultado: aprovado — lint, typecheck, contratos de apresentação, entregas, sandbox, artifacts remotos, jobs persistentes, encadeamento automático de plugins, plugin kit e build.

Também foi iniciado o app desktop em modo local com a versão 0.3.0. As execuções existentes permaneceram nos mesmos gates humanos, sem efeitos externos.
