import { createFileRoute } from "@tanstack/react-router";
import { ProjectDeliveriesPanel } from "@/components/process-runner";
import { useProject, useProjectExecutions } from "@/lib/store";

export const Route = createFileRoute("/project/$projectId/deliveries")({
  component: ProjectDeliveriesRoute,
});

function ProjectDeliveriesRoute() {
  const { projectId } = Route.useParams();
  const project = useProject(projectId);
  const executions = useProjectExecutions(projectId);
  if (!project) return null;
  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <section>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Central do projeto
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Entregas</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Arquivos, textos, imagens, áudios, vídeos e resultados dos plugins deste projeto. Abra,
          copie ou baixe cada entrega sem sair do ContentFlow.
        </p>
      </section>
      <ProjectDeliveriesPanel executions={executions} />
    </main>
  );
}
