import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, CircleAlert, FolderOutput, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PROCESS_META, PROCESS_ORDER, type ProcessId } from "@/lib/domain";
import { useProject } from "@/lib/store";

export const Route = createFileRoute("/project/$projectId/")({ component: ProjectHomeRoute });

const SLUG: Record<ProcessId, string> = {
  theme: "theme",
  title: "title",
  thumbnail: "thumbnail",
  script: "script",
  narration: "narration",
  assets: "assets",
  editing: "edit",
  publishing: "publish",
};

function ProjectHomeRoute() {
  const { projectId } = Route.useParams();
  const project = useProject(projectId);
  if (!project) return null;
  const current = (
    project.currentStage in PROCESS_META ? project.currentStage : "theme"
  ) as ProcessId;
  const currentMeta = PROCESS_META[current];
  const currentSlug = SLUG[current];
  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <section className="rounded-2xl border border-brand/30 bg-brand/5 p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-soft">
          Onde você parou
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{currentMeta.label}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Continue apenas pela próxima etapa necessária. As demais permanecem registradas no
          caminho, sem exigir navegação manual.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild className="gap-2">
            <Link to={`/project/${projectId}/${currentSlug}` as never}>
              <Play className="size-4" /> Continuar
            </Link>
          </Button>
          <Button asChild variant="outline" className="gap-2">
            <Link to={`/project/${projectId}/deliveries` as never}>
              <FolderOutput className="size-4" /> Ver entregas
            </Link>
          </Button>
        </div>
      </section>
      <section>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Caminho do vídeo</h2>
            <p className="text-sm text-muted-foreground">
              Clique em uma etapa para ver somente o que importa nela.
            </p>
          </div>
          <Badge variant="outline">{project.progress}% concluído</Badge>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {PROCESS_ORDER.map((process, index) => {
            const meta = PROCESS_META[process];
            const state = project.stages[process] ?? "not_started";
            const done = state === "done" || state === "approved";
            const active = process === current;
            return (
              <Link
                key={process}
                to={`/project/${projectId}/${SLUG[process]}` as never}
                className={`rounded-xl border p-3 transition ${active ? "border-brand bg-brand/10" : "border-border/70 bg-card hover:border-brand/40"}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {done ? (
                    <CheckCircle2 className="size-4 text-success" />
                  ) : active ? (
                    <CircleAlert className="size-4 text-warning" />
                  ) : null}
                </div>
                <p className="mt-3 text-sm font-semibold">{meta.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {active ? "Você está aqui" : done ? "Concluído" : "Ainda não iniciado"}
                </p>
              </Link>
            );
          })}
        </div>
      </section>
      <p className="text-xs text-muted-foreground">
        Atalhos: <kbd>⌘</kbd> + <kbd>1</kbd> até <kbd>8</kbd> abre as etapas; <kbd>⌘</kbd> +{" "}
        <kbd>0</kbd> abre Entregas. No Windows/Linux, use <kbd>Alt</kbd> no lugar de <kbd>⌘</kbd>.
      </p>
    </main>
  );
}
