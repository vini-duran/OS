# Monitor diário de pesquisa por canal

O Monitor diário é uma extensão **no nível do canal**. Ele não cria um nono processo universal nem insere pesquisa externa em um Método por vídeo.

## Contrato genérico

Uma configuração opcional `channel.research` declara:

- plugin e capability de coleta;
- cadência operacional;
- consultas factuais;
- região/idioma;
- filtros de duração;
- limites por rodada e de quota estimada.

A API persiste cada resultado em `channel_research_runs`. Os dados de vídeo, pré-flight, telemetria e erros permanecem associados ao canal e não são promovidos a entregas de um projeto.

## Garantias

- O endpoint exige canal configurado, plugin ativo, consentimento atual e capability exata.
- A execução é explícita pelo botão da interface; não há scheduler implícito.
- Credenciais são lidas somente pelo cofre local no momento da execução e nunca entram em método, banco de runs, telemetria ou resposta HTTP.
- Um run não atualiza uma coleção estratégica, não cria mídia, não aciona IA e não publica conteúdo.
- O plugin é responsável por pré-flight e limites externos; o núcleo armazena apenas o resultado normalizado.

## Integração editorial

A revisão editorial posterior deve selecionar os fatos úteis e publicar um artefato/brief explicitamente aprovado. Métodos de vídeo consomem esse artefato aprovado, nunca uma coleta bruta.

## Desenvolvimento

Arquivos principais:

- `src/lib/channel-research.ts`: contrato de configuração e portas factuais reutilizáveis;
- `server/index.ts`: persistência e endpoints de runs;
- `src/routes/channel.$channelId.research.tsx`: painel local;
- `src/components/app-sidebar.tsx`: acesso pelo canal;
- plugin independente: responsável por provider, rede, limites e campos normalizados.

O monitor foi desenhado para plugins independentes; não é uma integração específica de provider no núcleo.

## Como configurar para outro canal

A funcionalidade é genérica, mas nasce **desligada** em canais que não têm um plano próprio. Não copie o plano Spanish sem revisar o público, idioma, geografia, nicho, duração relevante e limites de quota.

### 1. Criar o plano do canal

No payload do canal, adicione a configuração abaixo. Os valores são exemplo; cada campo deve ser decidido para o canal de destino.

```json
{
  "research": {
    "pluginId": "com.seu-canal.research-provider",
    "capabilityId": "daily-research",
    "cadence": "manual_daily",
    "language": "es",
    "region": "MX",
    "minDurationSeconds": 180,
    "maxResults": 20,
    "maxCommentVideoSamples": 10,
    "maxEstimatedQuotaUnits": 1100,
    "queries": [
      {
        "id": "core-problem",
        "text": "consulta escrita no idioma do público",
        "referenceLane": "core_faceless"
      },
      {
        "id": "adjacent-context",
        "text": "consulta de contexto adjacente",
        "referenceLane": "niche_bending"
      }
    ]
  }
}
```

O contrato exige de 1 a 10 consultas. `referenceLane` aceita somente `core_faceless`, `niche_bending`, `presentation_mode` ou `unknown`. A configuração é rejeitada se plugin/capability, cadência ou limites não forem válidos.

### 2. Instalar e ativar o plugin

1. Instale ou vincule a pasta do plugin pela tela **Plugins**.
2. Leia permissões, hosts, política de dados e custo declarado.
3. Armazene credenciais apenas no cofre local do ContentFlow OS.
4. Ative a versão atual do plugin. Uma atualização de versão ou permissões exige novo consentimento.
5. Confirme que a capability declarada no plano existe no plugin e aceita o contrato de entradas/saídas.

Métodos, coleções, banco de dados e documentação nunca devem conter o valor de uma chave API.

### 3. Validar antes da primeira rodada

- execute o modo fixture/dry-run do plugin, se ele oferecer;
- confira o pré-flight: quantidade de consultas, requests máximos e quota estimada;
- verifique que o painel está mostrando o canal, idioma e plano esperados;
- execute uma única rodada manual;
- leia os registros e erros antes de habilitar qualquer recorrência futura.

### 4. Operar diariamente

O botão **Executar agora** é uma rodada explícita. Ele cria um snapshot novo mesmo quando encontra vídeos já vistos: métricas e comentários mudam ao longo do tempo. A comparação entre snapshots é que revela descoberta nova, crescimento ou perda de força.

Não transforme automaticamente uma rodada em tema. O operador deve revisar evidências, separar fatos de hipóteses e publicar um brief estratégico aprovado para o Método Tema.

## Referência de campos

| Campo                       | Função                    | Regra                                                                 |
| --------------------------- | ------------------------- | --------------------------------------------------------------------- |
| `pluginId` / `capabilityId` | Define o executor externo | Ambos devem estar ativos e compatíveis.                               |
| `cadence`                   | Define a operação         | Atual: `manual_daily`; não há agendamento oculto.                     |
| `language` / `region`       | Lentes da busca           | São relevância do provedor, não prova demográfica.                    |
| `minDurationSeconds`        | Exclui formatos curtos    | Definir pela estratégia do canal.                                     |
| `maxResults`                | Amostra por consulta      | Deve respeitar o limite do plugin.                                    |
| `maxCommentVideoSamples`    | Limita enriquecimento     | Menos amostras reduzem quota; não significam ausência de comentários. |
| `maxEstimatedQuotaUnits`    | Freio antes da rede       | O plugin deve bloquear acima do teto.                                 |
| `queries`                   | Descoberta rastreável     | Versionar texto, objetivo e linha de referência.                      |

## O que não deve ser configurado aqui

- decisão final de tema;
- título, thumbnail, personagem ou roteiro;
- classificação visual automática de faceless;
- receita, vendas ou conversões inferidas;
- credenciais, cookies, perfis de navegador ou tokens;
- publicação, mídia, narração, edição ou renderização.

## Ponte semanal → Tema

A tela **Pesquisa diária** também cria um _brief semanal factual_ a partir dos snapshots concluídos. Ele é deliberadamente uma operação de canal, não um novo Processo Universal nem um bloco repetido do Método Tema.

1. Execute um ou mais snapshots factuais do YouTube.
2. Clique em **Gerar brief (0 tokens)**. Nesta versão, a síntese é determinística/local: consolida consultas e métricas observadas, registra limitações e política anti-cópia. Não chama IA e exibe `0 tokens` com o motivo do fallback.
3. Revise o draft e clique **Aprovar para Tema**. Essa é a única aprovação desta ponte; o sistema cria um item na coleção `spanish-weekly-research-briefs` que o método Tema consome.

O fallback não cria tema, roteiro, mídia ou publicação. Sem snapshot concluído, o brief não é gerado. A telemetria de tokens do plugin OpenAI já acompanha cada resposta no retorno do bloco; o próximo incremento transversal é consolidar essa telemetria em um ledger único para todos os processos, sem contabilizar chamadas externas feitas fora do ContentFlow.
