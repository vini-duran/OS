# Migração do cofre: exclusão persistente e recuperação segura

Estado em 2026-09-09: teste nativo com credenciais sintéticas aprovado; binário
da fonte 64fc1bf instalado neste host macOS, partindo da instalação 0.5.2.
Não incluído no ZIP anterior de 0.5.5; release para outras máquinas pendente.

## O problema corrigido

A migração copiava a chave do blob legado `plugin-vault-v2`, preservando esse
backup. Excluir a cópia atual permitia reimportar a mesma chave na próxima
leitura. A exclusão parecia funcionar, mas a conexão voltava.

## Contrato

- Serviço atual: `ContentFlow`; anterior: `ContentFlow OS`.
- Sem estado registrado: prevalece a chave atual, depois a individual anterior,
  depois a chave exata do blob. Uma conexão nunca herda a chave global.
- O blob legado nunca é alterado ou apagado por esta migração.
- Cada conta possui metadado separado `credential-state-v1:<conta>`, sem
  valor de segredo. Não apagar esses metadados ao limpar arquivos antigos.
- `pending`: gravação iniciada, mas ainda não confirmada. Leitura bloqueada.
- `active`: gravação confirmada. Não voltar ao legado se a chave atual sumir.
- `deleted`: revogação persistente. Não consultar nenhuma cópia do segredo.
- Primeiro confirma-se o metadado de revogação; depois removem-se as entradas
  individuais. Falha de remoção é informada, mas não reativa a credencial.
- Cadastro explícito pode substituir uma chave ou reativar uma conta excluída.
  Nunca registrar valores de credenciais em logs, documentação ou Git.

## Recuperação para o operador

1. Se houver erro de acesso ao cofre, resolver a permissão pelo sistema. Não
   contornar nem interpretar acesso negado como ausência.
2. Se houver operação pendente, cadastrar novamente a credencial correta ou
   excluí-la explicitamente pela aplicação. Não remover o metadado manualmente.
3. Se a exclusão física falhar, corrigir o acesso e repetir a exclusão. A conta
   continua revogada enquanto isso.
4. Estado desconhecido é bloqueado; não inferir que a credencial está válida.

## Concorrência e rollback

Operações da mesma conta são serializadas entre instâncias que compartilham a
mesma fábrica de armazenamento. O adaptador nativo usa uma instância única.
Isso não é uma trava entre processos: não operar duas versões do aplicativo
sobre o mesmo cofre durante migração.

Versões antigas não entendem os metadados. Portanto, voltar para um binário
antigo sobre o mesmo cofre pode reativar credenciais legadas. Rollback do app
não equivale a rollback seguro de credenciais. Manter o blob preservado não
autoriza reaproveitá-lo automaticamente. Validar esse caso antes da promoção.

## Teste repetível sem credenciais reais

Na raiz do checkout: `npm run test:credential-vault`.

O teste importa apenas `credential-vault-core.ts`, usa armazenamento em memória
e executa com `--no-addons`: o módulo nativo do Keychain não pode ser carregado.
O comando integra `npm run check`; não há configuração global mutável de testes
na aplicação. O adaptador `credential-vault.ts` preserva as seis APIs públicas.

Evidências desta revisão: 29 testes do cofre e 2 de conexões passaram; testes
de conexão usam SQLite em memória. Typecheck de cliente e servidor passou.
Cobertura inclui exclusão e nova instância, falhas de confirmação, revogação
antes da migração, concorrência local e isolamento entre plugins/conexões.

Teste nativo adicional, manual e opt-in:
`node --import tsx scripts/test-native-vault.mts`.
Usa a biblioteca nativa com serviços de nome aleatório exclusivo e valores
sintéticos no Keychain do host; não é outro usuário macOS nem outro cofre.
Não consulta nomes de serviço de produção. Verifica migração, exclusão,
novo processo, conexões e remoção das entradas de teste.

Limites: novo processo não é reinício do macOS. Não foram lidas credenciais
existentes. O rollback de versões anteriores sobre novas revogações ainda
exige os cuidados acima; não é validado universalmente por este teste.
