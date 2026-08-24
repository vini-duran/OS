import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Archive, Home, LockKeyhole, UserRound } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { PROCESS_META, PROCESS_ORDER, type ProcessId } from "@/lib/domain";
import { useChannel, useHumanTasks, useProject } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/project/$projectId")({ component: ProjectLayout });

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

function ProjectLayout() {
  const { projectId } = Route.useParams();
  const project = useProject(projectId);
  const channel = useChannel(project?.channelId ?? "");
  const humanTasks = useHumanTasks();
  const pathname = useLocation({ select: (state) => state.pathname });
  const navigate = useNavigate();
  const base = `/project/${project?.id ?? ""}`;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // macOS apps conventionally use Command; Windows/Linux keep Alt.
      // This project runs inside Electron, so the mapping must follow the OS
      // instead of exposing browser-oriented shortcuts to Mac users.
      const isMac = navigator.platform.toUpperCase().includes("MAC");
      const hasNavigationModifier = isMac
        ? event.metaKey && !event.altKey
        : event.altKey && !event.metaKey;
      if (!hasNavigationModifier || event.ctrlKey || event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      const index = Number(event.key);
      if (index >= 1 && index <= PROCESS_ORDER.length) {
        event.preventDefault();
        void navigate({ to: `${base}/${SLUG[PROCESS_ORDER[index - 1]]}` as never });
      }
      if (index === 0) {
        event.preventDefault();
        void navigate({ to: `${base}/deliveries` as never });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [base, navigate]);
  if (!project || !channel) {
    return (
      <AppShell>
        <div className="flex flex-1 items-center justify-center p-10">
          <div className="text-center">
            <h2 className="text-xl font-semibold">Projeto não encontrado</h2>
            <Button asChild className="mt-4">
              <Link to="/dashboard">Ir para canais</Link>
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }
  const activeSlug = pathname.startsWith(`${base}/`)
    ? pathname.slice(base.length + 1).split("/")[0]
    : "";
  return (
    <AppShell>
      <TopBar
        title={project.title}
        subtitle={channel.name}
        breadcrumbs={[
          { label: "Canais", to: "/dashboard" },
          { label: channel.name, to: `/channel/${channel.id}` as never },
          { label: project.title },
        ]}
      />
      <nav aria-label="Processos do projeto" className="border-b border-border/70 bg-background/60">
        <div className="scrollbar-thin flex gap-1 overflow-x-auto px-3 py-2 sm:px-4">
          <Link
            to={`${base}/` as never}
            className={cn(
              "group inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
              activeSlug === ""
                ? "bg-brand/15 text-brand-soft"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
            )}
          >
            <Home className="size-3.5" />
            <span className="whitespace-nowrap">Visão geral</span>
          </Link>
          {PROCESS_ORDER.map((process, index) => {
            const meta = PROCESS_META[process];
            const Icon = meta.icon;
            const slug = SLUG[process];
            const blocked = !channel.methods[process]?.blocks.length;
            const waitingHuman = humanTasks.some(
              (task) => task.project.id === project.id && task.execution.processType === process,
            );
            return (
              <Link
                key={process}
                to={`${base}/${slug}` as never}
                className={cn(
                  "group inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                  activeSlug === slug
                    ? "bg-brand/15 text-brand-soft"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                )}
                title={
                  blocked ? `Crie um método de ${meta.label} para executar esta etapa` : undefined
                }
              >
                <span className="grid size-4 place-items-center rounded-sm bg-secondary font-mono text-[9px]">
                  {index + 1}
                </span>
                <Icon className="hidden size-3.5 sm:inline" />
                <span className="whitespace-nowrap">{meta.label}</span>
                {blocked && <LockKeyhole className="size-3 text-destructive/80" />}
                {waitingHuman && <UserRound className="size-3 text-warning" />}
              </Link>
            );
          })}
          <Link
            to={`${base}/deliveries` as never}
            className={cn(
              "group inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
              activeSlug === "deliveries"
                ? "bg-brand/15 text-brand-soft"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
            )}
          >
            <Archive className="size-3.5" />
            <span className="whitespace-nowrap">Entregas</span>
          </Link>
        </div>
      </nav>
      <Outlet />
    </AppShell>
  );
}
