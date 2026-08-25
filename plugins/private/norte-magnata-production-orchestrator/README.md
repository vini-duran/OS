# Norte Magnata — Orquestrador provisório

Adaptador temporário até o núcleo oficial possuir orquestração completa. Ele usa o workspace local configurado para executar a automação canônica e devolver estado/logs ao ContentFlow.

- padrão atual: `continue_expanded` (20 decisões visuais/minuto);
- recuperação: `resume_current`;
- diagnóstico sem produção: `inspect`;
- nenhuma credencial ou caminho absoluto entra no plugin;
- o workspace local deve apontar para a raiz do `Automation_Magnata`.
