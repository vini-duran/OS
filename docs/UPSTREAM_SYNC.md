# Evoluir nosso fork — roteiro único

Siga o [manual de evolução e publicação](https://github.com/vini-duran/ContentFlow_Universal_Integrations/blob/main/docs/fluxos/evolucao/README.md)
e seu [prompt universal](https://github.com/vini-duran/ContentFlow_Universal_Integrations/blob/main/docs/fluxos/evolucao/PROMPT.md).
Fixe os SHAs da main nos dois repositórios antes da rodada.
Este documento encaminha ao procedimento único; não mantém outra sequência.

1. Identificar upstream ou melhoria própria, comparar impactos e preservar personalizações.
2. Preparar em checkout/branch isolados; testar fonte, contratos e pacote congelado.
3. Ensaiar instalação, atualização, recuperação e abertura com dados isolados.
4. Validar os mesmos bytes no alvo real autorizado, com pausa, backup e recibo.
5. Após validação/autorização, publicar fonte por PR e artefato imutável no fork.
6. Conferir download remoto; promover catálogo/manifestos/rotas/docs no universal
   por último; verificar main e encaminhar teste de consumo à outra máquina.

A [matriz do manual](https://github.com/vini-duran/ContentFlow_Universal_Integrations/blob/main/docs/fluxos/evolucao/README.md)
obriga atualizar todas as referências afetadas a cada publicação. A versão
aprovada vem do manifesto, não de uma versão repetida em README.
Nosso número pode diferir do autor. Nem toda novidade precisa ser incorporada.

Upstream é somente consulta/fetch, nunca destino de push/PR/tag/release.
Mudança documental não exige reempacotar nem substituir o app instalado.
Não usar Actions para build, validação ou release.

Registros anteriores: [histórico](historico/README.md).
Dados, cofre, sessões, recibos completos e mídia ficam privados. Nunca
alterar Propostas Únicas, encerrar produção ou descartar personalizações para
facilitar o merge. A ausência de rota não impede elaborar/testar a candidata;
impede aplicá-la fora do cenário autorizado e promovê-la sem evidência.
