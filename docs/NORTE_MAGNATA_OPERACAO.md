# Norte Magnata no ContentFlow OS — operação simples

Este documento é a porta de entrada da produção. O **ContentFlow OS** é a única interface para iniciar, acompanhar e consultar o Norte Magnata. Não é necessário abrir a automação antiga para produzir um novo projeto pelo método novo.

## 1. Onde abrir

- App: `/Users/viniciusduran/Applications/ContentFlow OS.app`
- Canal no App: **Norte Magnata**
- Projeto em uso: o único projeto iniciado com `01 — ATUAL —`.

Para acompanhar pelo Terminal, abra:

```bash
"/Users/viniciusduran/contentflow-os/ABRIR_E_MONITORAR_NORTE_MAGNATA.command"
```

O comando abre o App se necessário e mostra somente: canal, projeto atual, etapa, status, progresso e número de blocos configurados. Ele não mostra IDs, portas variáveis, logs técnicos ou segredos.

## 2. A ordem fixa da produção

| Nº | Etapa | Entrega que libera a próxima |
| --- | --- | --- |
| 1 | Tema | Dossiê de tema apoiado por pesquisa factual |
| 2 | Título | Um título aprovado |
| 3 | Thumbnail | PNG 16:9 aprovado |
| 4 | Roteiro | Narração escrita e validada |
| 5 | Narração | Áudio e SRT real |
| 6 | Assets | Mapa, mídia e licenças validados |
| 7 | Edição | Master de vídeo aprovado pelo QA |
| 8 | Publicação | URL final e confirmação da plataforma |

Uma etapa não deve iniciar mídia, renderização ou publicação da etapa seguinte antes da entrega anterior estar aprovada. Dentro de uma etapa podem existir blocos de buscar, escolher, criar e validar; eles aparecem apenas quando realmente são necessários para aquela entrega.

## 3. Estado desta primeira produção

| Etapa | Estado | Resultado resumido |
| --- | --- | --- |
| Tema | concluído | Disciplina como ação possível mesmo com motivação oscilando |
| Título | concluído | `Disciplina sem motivação: o que ainda está sob seu controle` |
| Thumbnail | concluída | PNG 1536×864, aprovado sem faixas laterais |
| Roteiro | concluído | 1.057 palavras, aprovado; alvo de 7–9 minutos |
| Narração | próxima | ainda não iniciada |
| Assets, Edição, Publicação | bloqueadas | ainda não iniciadas |

Este quadro é um registro desta primeira produção; o App é a autoridade de estado em tempo real.

## 4. O que verificar sem entrar em detalhes técnicos

| Quando | Verificar apenas isto |
| --- | --- |
| Tema e título | O assunto e a promessa representam o canal, sem parecer uma palestra genérica |
| Thumbnail | A primeira leitura mostra tensão humana e combina com o título; não há faixas, bordas ou texto defeituoso |
| Roteiro | A abertura prende, as práticas são úteis e a conclusão não promete milagre |
| Narração | Voz clara, pausas naturais e SRT sincronizado |
| Assets e edição | Há movimento, variedade e evidência visual; nada parece repetido ou decorativo |
| Master | Tela cheia, sem quadros brancos, áudio contínuo, sem tela preta e com ritmo consistente |
| Publicação | Vídeo, thumbnail, título, descrição e URL corretos |

## 5. Onde fica cada coisa

| Item | Local |
| --- | --- |
| Método e estado operacional | ContentFlow OS (canal Norte Magnata) |
| Documentação geral | `contentflow-os/docs/` |
| Monitor simples no Terminal | `contentflow-os/ABRIR_E_MONITORAR_NORTE_MAGNATA.command` |
| Plugin de thumbnail | `contentflow-os/plugins/private/norte-magnata-thumbnail-studio/` |
| Operação portátil da thumbnail | `plugins/private/norte-magnata-thumbnail-studio/OPERACAO_E_PORTABILIDADE.md` |
| Repositório técnico anterior | `/Users/viniciusduran/Downloads/Automation_Magnata 2/` |

Segredos de API ficam somente na Central de Plugins/Keychain. Eles não pertencem a arquivos `.md`, comandos, métodos exportados ou Git.

## 6. Regra de organização

1. Um canal tem seus próprios métodos e identidade.
2. Um projeto tem uma única linha de oito etapas visíveis.
3. Um plugin tem uma responsabilidade e seu próprio documento de operação.
4. O status visível deve usar nome de etapa e resultado; IDs internos ficam fora da rotina.
5. Antes de portar para outra máquina: copiar o repositório, abrir esta página, instalar/vincular cada plugin listado e reconectar credenciais na Central de Plugins.
