# ContentFlow OS v0.3.2

Atualização corretiva do armazenamento de credenciais no macOS.

## Cofre único

- credenciais de plugins passam a ocupar um único registro protegido pelo cofre do sistema;
- leituras simultâneas compartilham a mesma consulta e o conteúdo fica em cache somente enquanto a API local está aberta;
- gravações são serializadas para impedir perda de chaves salvas ao mesmo tempo;
- o macOS pode solicitar a senha uma vez para o novo registro; use **Sempre Permitir**;
- registros antigos, separados por chave, não são apagados nem migrados silenciosamente.

Após instalar esta versão, credenciais de plugins devem ser preenchidas novamente no novo cofre. Depois da autorização inicial, salvar outras chaves não deve abrir novos pedidos do Chaveiro.
