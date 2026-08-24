import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Plus,
  MoreHorizontal,
  Search,
  ArrowRight,
  LayoutGrid,
  Table as TableIcon,
  FolderKanban,
  RefreshCw,
  Trash2,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { ChannelAvatar } from "@/components/channel-avatar";
import { ProcessStatus } from "@/components/process-status";
import { NewProjectDialog } from "@/components/new-project-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PROCESS_META, type Channel, type ProcessExecution, type Project } from "@/lib/domain";
import {
  removeProject,
  syncChannelFromYouTube,
  useChannel,
  useChannelExecutions,
  useProjects,
} from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/channel/$channelId/")({ component: ChannelWorkspace });

function ChannelWorkspace() {
  const { channelId } = Route.useParams();
  const channel = useChannel(channelId);
  const projects = useProjects(channelId);
  const executions = useChannelExecutions(channelId);
  const [view, setView] = useState<"cards" | "table">("cards");
  const [search, setSearch] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);

  const filtered = useMemo(() => {
    if (!search) return projects;
    const q = search.toLowerCase();
    return projects.filter((p) => p.title.toLowerCase().includes(q));
  }, [projects, search]);
  const productionSummary = useMemo(
    () => ({
      running: projects.filter((project) =>
        ["processing", "configuring"].includes(liveProjectState(project, executions)),
      ).length,
      waiting: projects.filter((project) =>
        ["awaiting_human", "awaiting_review"].includes(liveProjectState(project, executions)),
      ).length,
      blocked: projects.filter((project) =>
        ["blocked", "error"].includes(liveProjectState(project, executions)),
      ).length,
      idle: projects.filter((project) => liveProjectState(project, executions) === "not_started")
        .length,
    }),
    [executions, projects],
  );

  if (!channel) return null;

  async function syncYouTube() {
    setIsSyncing(true);
    try {
      await syncChannelFromYouTube(channelId);
      toast.success("Canal atualizado com os dados públicos do YouTube.");
    } catch (error) {
      toast.error("Não foi possível atualizar o canal", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <AppShell>
      <TopBar
        showNewProject={false}
        breadcrumbs={[
          { label: "ContentFlow OS", to: "/dashboard" },
          { label: "Canais", to: "/dashboard" },
          { label: channel.name },
        ]}
        title={channel.name}
        subtitle={`${channel.handle} · ${channel.niche} · ${channel.language}`}
        actions={
          <>
            <NewProjectDialog channelId={channel.id} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-9 text-muted-foreground">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Ações do canal</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>Editar canal</DropdownMenuItem>
                <DropdownMenuItem>Duplicar configurações</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive">Arquivar canal</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <main className="flex-1 space-y-5 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <section className="relative isolate min-h-36 overflow-hidden rounded-lg bg-card sm:min-h-44">
          {channel.bannerUrl ? (
            <img
              src={channel.bannerUrl}
              alt={`Banner do canal ${channel.name}`}
              className="absolute inset-0 size-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div
              className="absolute inset-0 border-l-4"
              style={{ backgroundColor: "var(--surface-2)", borderLeftColor: channel.color }}
            />
          )}
          <div className="absolute inset-0 bg-black/55" />
          <div className="relative flex min-h-36 items-end justify-between gap-4 p-4 sm:min-h-44 sm:p-5">
            <div className="flex min-w-0 items-center gap-3 text-white">
              <ChannelAvatar
                channel={channel}
                size="lg"
                className="!size-14 ring-2 ring-white/50 sm:!size-16"
              />
              <div className="min-w-0 drop-shadow">
                <h2 className="truncate text-lg font-semibold sm:text-xl">{channel.name}</h2>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/80">
                  <span>{channel.handle}</span>
                  <span className="inline-flex items-center gap-1">
                    <UsersRound className="size-3.5" />
                    {channel.subscribers || "0 inscritos"}
                  </span>
                </div>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="shrink-0 gap-1.5 bg-black/55 text-white hover:bg-black/70"
              onClick={syncYouTube}
              disabled={isSyncing}
            >
              <RefreshCw className={cn("size-3.5", isSyncing && "animate-spin")} />
              <span className="hidden sm:inline">Atualizar YouTube</span>
            </Button>
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Projetos</h2>
            <p className="text-xs text-muted-foreground">
              {filtered.length} de {projects.length} projetos
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar projeto…"
                className="h-9 border-border/60 bg-background/60 pl-8 text-xs"
              />
            </div>
            <div className="inline-flex overflow-hidden rounded-md border border-border/60 bg-background/40 p-0.5">
              <button
                onClick={() => setView("cards")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs transition",
                  view === "cards"
                    ? "bg-brand/20 text-brand-soft"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <LayoutGrid className="size-3.5" /> Cards
              </button>
              <button
                onClick={() => setView("table")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs transition",
                  view === "table"
                    ? "bg-brand/20 text-brand-soft"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <TableIcon className="size-3.5" /> Tabela
              </button>
            </div>
          </div>
        </div>

        <section
          aria-label="Resumo da produção"
          className="overflow-hidden rounded-xl border border-border/70 bg-card"
        >
          <div className="grid sm:grid-cols-4">
            <ProductionMetric label="Em execução" value={productionSummary.running} tone="brand" />
            <ProductionMetric
              label="Aguardando você"
              value={productionSummary.waiting}
              tone="warning"
            />
            <ProductionMetric label="Bloqueadas" value={productionSummary.blocked} tone="error" />
            <ProductionMetric
              label="Sem produção iniciada"
              value={productionSummary.idle}
              tone="muted"
            />
          </div>
          <p
            className="border-t border-border/60 px-4 py-2.5 text-xs text-muted-foreground"
            aria-live="polite"
          >
            {productionSummaryText(productionSummary)}
          </p>
        </section>

        {filtered.length === 0 ? (
          <EmptyProjects channelId={channel.id} channelName={channel.name} />
        ) : view === "cards" ? (
          <ProjectGrid projects={filtered} executions={executions} />
        ) : (
          <ProjectTable projects={filtered} channel={channel} executions={executions} />
        )}
      </main>
    </AppShell>
  );
}

function ProjectGrid({
  projects,
  executions,
}: {
  projects: Project[];
  executions: ProcessExecution[];
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {projects.map((p) => {
        const stage = PROCESS_META[p.currentStage];
        const state = liveProjectState(p, executions);
        return (
          <div
            key={p.id}
            className="group relative overflow-hidden rounded-xl border border-border/70 bg-card transition-colors hover:border-brand/40 hover:bg-surface-2"
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-2 z-10 size-7 bg-black/50 text-white opacity-0 transition group-hover:opacity-100 hover:bg-black/70"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => {
                    if (confirm(`Excluir "${p.title}"?`)) removeProject(p.id);
                  }}
                >
                  <Trash2 className="mr-2 size-3.5" />
                  Excluir projeto
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Link to="/project/$projectId" params={{ projectId: p.id }} className="block">
              <div className="flex min-h-32 items-start gap-3 p-4">
                <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand/12 text-brand-soft">
                  <stage.icon className="size-5" />
                </div>
                <div className="min-w-0 flex-1 pr-6">
                  <h3 className="line-clamp-2 text-sm font-semibold leading-tight">{p.title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Etapa atual: {stage.label}</p>
                  <p className="mt-3 text-xs text-muted-foreground">{projectNextAction(state)}</p>
                </div>
                <ProcessStatus state={state} className="shrink-0" />
              </div>

              <div className="border-t border-border/50 px-4 py-3">
                <div className="mb-1.5 flex justify-between text-[10px] text-muted-foreground">
                  <span>Progresso da produção</span>
                  <span className="font-mono text-foreground">{p.progress}%</span>
                </div>
                <Progress value={p.progress} className="h-1.5" />
              </div>
            </Link>
          </div>
        );
      })}
    </div>
  );
}

function ProjectTable({
  projects,
  channel,
  executions,
}: {
  projects: Project[];
  channel: Channel;
  executions: ProcessExecution[];
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
      <Table>
        <TableHeader>
          <TableRow className="border-border/60 hover:bg-transparent">
            <TableHead className="text-[11px] uppercase tracking-wider">Projeto</TableHead>
            <TableHead className="text-[11px] uppercase tracking-wider">Etapa</TableHead>
            <TableHead className="text-[11px] uppercase tracking-wider">Progresso</TableHead>
            <TableHead className="text-[11px] uppercase tracking-wider">Estado</TableHead>
            <TableHead className="text-[11px] uppercase tracking-wider">Próxima ação</TableHead>
            <TableHead className="w-16" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {projects.map((p) => {
            const stage = PROCESS_META[p.currentStage];
            const state = liveProjectState(p, executions);
            return (
              <TableRow key={p.id} className="border-border/50">
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <ChannelAvatar channel={channel} size="sm" />
                    <span className="text-sm font-medium">{p.title}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5 text-xs">
                    <stage.icon className="size-3.5 text-brand-soft" />
                    {stage.label}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Progress value={p.progress} className="h-1.5 w-24" />
                    <span className="font-mono text-xs text-muted-foreground">{p.progress}%</span>
                  </div>
                </TableCell>
                <TableCell>
                  <ProcessStatus state={state} />
                </TableCell>
                <TableCell className="max-w-64 text-xs text-muted-foreground">
                  {projectNextAction(state)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1 text-xs text-brand-soft"
                    >
                      <Link to="/project/$projectId" params={{ projectId: p.id }}>
                        Abrir
                        <ArrowRight className="size-3" />
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        if (confirm(`Excluir "${p.title}"?`)) removeProject(p.id);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function ProductionMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "brand" | "warning" | "muted" | "error";
}) {
  const toneClass = {
    brand: "bg-brand",
    warning: "bg-warning",
    muted: "bg-muted-foreground/50",
    error: "bg-destructive",
  }[tone];
  return (
    <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <span className={cn("size-2 rounded-full", toneClass)} />
      <div>
        <p className="text-lg font-semibold tabular-nums">{value}</p>
        <p className="text-[11px] text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function projectNextAction(state: Project["state"]) {
  switch (state) {
    case "processing":
    case "configuring":
      return "A automação está executando esta etapa.";
    case "awaiting_human":
    case "awaiting_review":
      return "Há uma decisão ou revisão pendente para continuar.";
    case "not_started":
      return "Nenhuma produção foi iniciada.";
    case "blocked":
      return "Falta conectar ou configurar o executor desta etapa.";
    case "error":
      return "A etapa precisa de correção antes de continuar.";
    case "done":
    case "approved":
      return "Esta etapa está concluída; abra o projeto para avançar.";
    default:
      return "Abra o projeto para verificar a próxima etapa.";
  }
}

function liveProjectState(project: Project, executions: ProcessExecution[]): Project["state"] {
  const execution = executions.find(
    (item) => item.projectId === project.id && item.processType === project.currentStage,
  );
  if (!execution) return project.state;
  switch (execution.status) {
    case "running":
      return "processing";
    case "awaiting_human":
    case "awaiting_output":
      return "awaiting_human";
    case "blocked_executor":
      return "blocked";
    case "failed":
      return "error";
    default:
      return project.state;
  }
}

function productionSummaryText({
  running,
  waiting,
  blocked,
  idle,
}: {
  running: number;
  waiting: number;
  blocked: number;
  idle: number;
}) {
  const parts = [];
  if (running) parts.push(`${running} produção${running === 1 ? "" : "ões"} em execução`);
  if (waiting) parts.push(`${waiting} aguardando sua ação`);
  if (blocked) parts.push(`${blocked} bloqueada${blocked === 1 ? "" : "s"} por configuração`);
  if (idle) parts.push(`${idle} sem iniciar`);
  return parts.length
    ? `Resumo atual: ${parts.join(" · ")}.`
    : "Nenhum projeto de produção ativo no momento.";
}

function EmptyProjects({ channelId, channelName }: { channelId: string; channelName: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
      <div className="grid size-14 place-items-center rounded-2xl border border-border/60 bg-card">
        <FolderKanban className="size-6 text-brand-soft" />
      </div>
      <h2 className="mt-4 text-lg font-semibold">Nenhum projeto ainda</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Comece a produção de {channelName} criando o primeiro projeto.
      </p>
      <div className="mt-5">
        <NewProjectDialog
          channelId={channelId}
          trigger={
            <Button className="gap-1.5 gradient-brand text-primary-foreground">
              <Plus className="size-4" />
              Novo projeto
            </Button>
          }
        />
      </div>
    </div>
  );
}
