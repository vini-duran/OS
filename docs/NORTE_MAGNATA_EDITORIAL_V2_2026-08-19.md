# Norte Magnata — contrato editorial V2

Data da auditoria: 19 de agosto de 2026. Produção: `NM-CF-9AB9B6D01B7EFB72`.

## Diagnóstico comprovado

O problema não era pouca quantidade de cenas. O mapa tem 98 cenas em 491,32 segundos, ou 11,97 cenas por minuto. O problema era a distribuição: 30 vídeos gerados mais 11 B-rolls cobriam 43,92% da timeline; 57 imagens ocupavam 56,08%, e 25 delas duravam mais de cinco segundos.

O hook existente também não era uma sequência genérica. O SRT já conta uma cadeia específica: documento aberto, resistência, desculpa do café e mensagens, uma hora perdida, culpa e descoberta de que a falta de vontade foi tratada como ordem. A V2 preserva o áudio e torna essa causalidade visível.

Foi encontrado ainda um erro no processo de QA: `record-norte-magnata-flow-approval.mjs` gravava `0/N` para borda branca depois da confirmação humana, embora o código não medisse borda nem área clara. A frase foi corrigida. Três cenas com papel claro dominante — `B02_C12`, `B05_C02` e `B05_C05` — foram convertidas para vídeo com ação progressiva para que o papel não apareça como cartão vazio.

## Referências realmente auditadas

A pesquisa factual usou o radar local e a YouTube Data API, sem OpenAI e sem geração paga. Depois, legendas e storyboards públicos das aberturas foram inspecionados.

- [Filosofatos — A bizarra e ASSUSTADORA Teoria da INTERNET MORTA](https://www.youtube.com/watch?v=YNnt7fkA2T0): útil pelo cold open situacional, a anomalia específica e a escalada de curiosidade. A forma visual não será copiada.
- [Leo Xavier — Esse vídeo vai te deixar VICIADO em DISCIPLINA](https://www.youtube.com/watch?v=F7_HUZ3V_CU): útil pela tese contrária ao conteúdo motivacional genérico e pela alternância rápida entre apresentador, filme e animação. Não copiar personagem nem linguagem.
- [BBC News Brasil — A Teoria da Internet Morta está a caminho de se tornar realidade?](https://www.youtube.com/watch?v=0rmJoI7do2o): útil pela sequência pergunta concreta, exemplos visuais, nome do mecanismo e evidência.
- [Via da Sabedoria — AMANHÃ EU FAÇO?](https://www.youtube.com/watch?v=b53UP_Pjp3c): exemplo rejeitado para este projeto. A abertura demora na descrição bucólica e usa slideshow ilustrativo antes de chegar ao conflito.

A conclusão não é “usar storytelling”. É escolher um mecanismo de abertura adequado ao assunto: situação causal, anomalia investigada, tese contrária ou prova visual. História lenta e decorativa não passa apenas por ser história.

## Política V2

- Duração não é quota nem condenação. Uma cena de dez segundos pode funcionar quando desenvolve uma ação, contém corte interno ou usa um cartão estrutural com texto em movimento.
- Toda imagem restante recebe pêndulo discreto como base. Crop, pan ou parallax substituem quando a composição não aceita oscilação.
- Uma camada de acabamento quase invisível é aplicada por vez: Noise 1, Noise 2, partículas finas, grão ou fragmentação suave. Fumaça decorativa fica proibida.
- Vídeos verticais permanecem íntegros no centro. As laterais recebem extensão desfocada, textura, partículas ou fragmentação coerente; nunca barras mortas e nunca crop destrutivo.
- Cartões escuros `PRÁTICA 1`, `PRÁTICA 2` e `PRÁTICA 3` duram no máximo 1,1 segundo dentro das cenas correspondentes, com revelação tipográfica e consequência visual imediata.
- SFX permanece abaixo da voz e serve gesto, mudança ou capítulo. A V2 passa de 14 para 26 eventos planejados.
- O vídeo continua sem música.
- A fila não é testada por um único bloco. O preflight valida as 98 cenas e, depois, libera a fila completa ou bloqueia tudo.

## Resultado do preflight integral

O primeiro dry-run bloqueou duas instruções que não declaravam a progressão temporal. Elas foram corrigidas e o segundo dry-run aprovou:

| Métrica | Antes | V2 |
|---|---:|---:|
| Vídeos gerados | 30 | 42 |
| B-rolls em vídeo | 11 | 11 |
| Imagens animadas | 57 | 45 |
| Timeline com vídeo | 43,92% | 60,36% |
| Overlays editoriais | 18 | 26 |
| SFX | 14 | 26 |
| Cartões estruturais | 0 | 3 |

As 12 conversões são: `B02_C12`, `B03_C13`, `B04_C14`, `B05_C02`, `B05_C05`, `B05_C09`, `B06_C04`, `B06_C09`, `B06_C10`, `B07_C11`, `B08_C08` e `B08_C11`.

Treze imagens acima de cinco segundos permanecem como imagem porque já contêm mudança interna explícita. Elas não ficam paradas e não foram convertidas apenas para cumprir uma quota.

## Voz editorial e temas sensíveis

Para as próximas produções, o contrato aceita posição direta, crítica a governos e instituições, referência bíblica e assuntos tabus. A regra operacional é simples: documento, dado ou citação devem ser distinguíveis de inferência e opinião. A edição apresenta a evidência e permite que o público conclua; não fabrica fatos nem atribui crime sem prova.

O áudio e o SRT desta produção já estão aprovados. Reescrevê-los agora invalidaria narração, tempos e mapa; portanto, a V2 aumenta a força pela edição. A nova política de voz passa a valer na criação dos próximos roteiros.

## Arquivos e reprodução

- Contrato: `tools/norte-magnata-editorial-v2.json`
- Preflight: `tools/preflight-norte-magnata-editorial-v2.mjs`
- Resultado local: `data/flow-jobs/<production_id>/editorial-v2/preflight.json`

Comando reproduzível:

```zsh
./desktop-runtime/node tools/preflight-norte-magnata-editorial-v2.mjs \
  --map CAMINHO_DO_MAPA.json \
  --approval CAMINHO_DO_MANIFESTO.json \
  --plan tools/norte-magnata-editorial-v2.json \
  --output CAMINHO_DO_PREFLIGHT.json
```

O resultado aprovado declara `full_queue_ready: true` e `generation_started: false`. O preflight prepara a fila; ele não consome créditos nem inicia provedor.
