# ContentFlow OS no macOS

O ContentFlow OS usa um shell Electron local: a janela do aplicativo inicia a API em uma porta de loopback aleatória, abre a interface React dentro do próprio aplicativo e conserva projetos, plugins e credenciais fora da pasta `.app`.

Esta implementação não reescreve o produto em Swift ou SwiftUI. Ela preserva a janela, o motor de processos, SQLite, plugins, consentimentos e segurança já existentes.

## Requisitos para desenvolvimento

- macOS em arquitetura nativa (`arm64` para Apple Silicon ou `x64` para Intel);
- Node 26.x e npm compatível;
- dependências instaladas com `npm ci`.

Em um Mac Apple Silicon, use Node 26 e rode:

```bash
npm run check
npm run desktop:mac:dev
```

O segundo comando prepara o runtime privado e abre uma janela do **ContentFlow OS**. Não abre o fluxo em um navegador externo.

## Builds locais

| Comando | Resultado |
| --- | --- |
| `npm run desktop:mac:arm64` | `.app`, `.dmg` e `.zip` para Apple Silicon. |
| `npm run desktop:mac:x64` | `.app`, `.dmg` e `.zip` para Mac Intel. Execute em um Mac Intel. |

Os builds são intencionalmente nativos à arquitetura da máquina: a aplicação inclui um runtime Node 26 privado que executa a API local e a sandbox de plugins. Isso evita distribuir por engano um app Intel com runtime ARM, ou o inverso.

Os artefatos ficam em `release/v0`. Uma versão universal não é gerada nesta fase porque ela exige combinar e validar runtimes Node e módulos nativos de ambas as arquiteturas.

## Dados e atualizações

No macOS, a área persistente fica em:

```text
~/Library/Application Support/ContentFlow OS/data
```

Exemplos editáveis de plugins ficam em:

```text
~/Documents/ContentFlow OS/Plugins
```

O banco SQLite, plugins instalados, vínculos de desenvolvimento e credenciais guardadas pelo sistema permanecem nesses diretórios. Reinstalar o `.app` não deve apagá-los. Não copie dados para dentro de `ContentFlow OS.app`.

## Validação manual obrigatória

Depois de montar um build, valide no Mac alvo:

1. abrir `ContentFlow OS.app` pelo Finder;
2. confirmar que a janela carrega o dashboard e fecha sem processo órfão;
3. criar um projeto, fechar e reabrir o app para confirmar SQLite persistente;
4. vincular e executar o plugin de exemplo sem permissões;
5. confirmar que uma execução com plugin desativado permanece bloqueada;
6. conferir que o banco está fora do pacote `.app`.

## Assinatura e distribuição

O primeiro build é somente para teste local e pode não ser assinado. O Gatekeeper pode exigir abertura manual em outro Mac. Distribuição externa exige uma etapa separada com certificado **Developer ID Application**, assinatura, notarização e stapling. Nunca grave certificados ou segredos Apple no repositório.

## Limites atuais

- Não há auto-update configurado.
- Não gere nem distribua artefatos públicos sem revisar a licença source-available do projeto.
- O runtime privado deve continuar em Node 26 para preservar o modelo de permissões dos plugins.
