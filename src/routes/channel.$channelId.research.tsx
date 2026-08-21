import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FileCheck2, LoaderCircle, Play, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ChannelResearchBrief, ChannelResearchRun } from "@/lib/domain";
import { updateChannel, useChannel } from "@/lib/store";

export const Route = createFileRoute("/channel/$channelId/research")({ component: ChannelResearchPage });

function date(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function ChannelResearchPage() {
  const { channelId } = Route.useParams();
  const channel = useChannel(channelId);
  const [runs, setRuns] = useState<ChannelResearchRun[]>([]);
  const [briefs, setBriefs] = useState<ChannelResearchBrief[]>([]);
  const [busy, setBusy] = useState<"plan" | "run" | "brief" | "approve" | "reload" | undefined>();

  const reload = useCallback(async () => {
    setBusy("reload");
    try {
      const [runsResponse, briefsResponse] = await Promise.all([
        fetch(`/api/channels/${encodeURIComponent(channelId)}/research/runs`),
        fetch(`/api/channels/${encodeURIComponent(channelId)}/research/briefs`),
      ]);
      const runsBody = (await runsResponse.json()) as { runs?: ChannelResearchRun[]; error?: string };
      const briefsBody = (await briefsResponse.json()) as { briefs?: ChannelResearchBrief[]; error?: string };
      if (!runsResponse.ok) throw new Error(runsBody.error ?? "Não foi possível ler as pesquisas.");
      if (!briefsResponse.ok) throw new Error(briefsBody.error ?? "Não foi possível ler os briefs.");
      setRuns(runsBody.runs ?? []); setBriefs(briefsBody.briefs ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar a pesquisa.");
    } finally { setBusy(undefined); }
  }, [channelId]);

  useEffect(() => { void reload(); }, [reload]);
  const completed = useMemo(() => runs.filter((run) => run.status === "completed"), [runs]);

  async function request(path: string, mode: "plan" | "run" | "brief" | "approve") {
    setBusy(mode);
    try {
      const response = await fetch(`/api/channels/${encodeURIComponent(channelId)}/research/${path}`, { method: "POST" });
      const body = (await response.json()) as { error?: string; run?: ChannelResearchRun; brief?: ChannelResearchBrief; id?: string };
      if (!response.ok) throw new Error(body.error ?? "A operação não foi concluída.");
      if (mode === "plan") { updateChannel(body as never); toast.success("Plano criado a partir do Radar do Método Tema."); }
      if (mode === "run") { toast.success("Snapshot factual concluído. Nenhum tema foi criado."); }
      if (mode === "brief") { toast.success("Brief factual local criado: 0 tokens."); }
      if (mode === "approve") { toast.success("Brief aprovado para a Biblioteca Estratégica."); }
      await reload();
    } catch (error) { toast.error(error instanceof Error ? error.message : "A operação falhou."); }
    finally { setBusy(undefined); }
  }

  if (!channel) return null;
  const plan = channel.research;
  return (
    <AppShell>
      <TopBar showNewProject={false} breadcrumbs={[{ label: "Canal" }, { label: channel.name }, { label: "Pesquisa" }]} title="Pesquisa estratégica" subtitle="Factual, no nível do canal. Não cria Tema, Título, Thumbnail ou Roteiro automaticamente." actions={<Button variant="outline" size="sm" onClick={() => void reload()} disabled={!!busy}><RefreshCw className={`mr-1.5 size-3.5 ${busy === "reload" ? "animate-spin" : ""}`} />Atualizar</Button>} />
      <main className="flex-1 space-y-5 px-4 py-6 sm:px-6 lg:px-8">
        {!plan ? <section className="mx-auto max-w-2xl rounded-lg border border-border bg-card p-6"><Search className="size-5 text-brand" /><h2 className="mt-3 font-semibold">Pesquisa ainda não conectada</h2><p className="mt-1 text-sm text-muted-foreground">O plano reaproveita exatamente o Radar BUSCAR que já existe no Método Tema. Ele não altera suas consultas.</p><Button className="mt-4" onClick={() => void request("plan/from-theme", "plan")} disabled={!!busy}>{busy === "plan" && <LoaderCircle className="mr-1.5 size-3.5 animate-spin" />}Conectar Radar do Tema</Button></section> : <>
          <section className="grid gap-3 md:grid-cols-3"><Metric label="Executor" value="Radar do canal" detail="Rodada manual; nenhuma agenda oculta." /><Metric label="Brief" value="Local · 0 tokens" detail="Só passa ao Tema após aprovação." /><Metric label="Mínimo" value={`${plan.minimumBriefRecords} registros`} detail="Antes de permitir criar um brief." /></section>
          <section className="rounded-lg border border-border bg-card p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">1. Coleta factual</h2><p className="mt-1 text-xs text-muted-foreground">Usa as consultas já configuradas no Radar. Não chama OpenAI nem inicia produção.</p></div><Button onClick={() => void request("runs", "run")} disabled={!!busy}>{busy === "run" ? <LoaderCircle className="mr-1.5 size-3.5 animate-spin" /> : <Play className="mr-1.5 size-3.5" />}Executar pesquisa</Button></div></section>
          <section className="rounded-lg border border-border bg-card p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">2. Brief estratégico</h2><p className="mt-1 text-xs text-muted-foreground">Separa observado, inferência/hipótese, anti-cópia e limitações. Não usa IA.</p></div><Button variant="outline" onClick={() => void request("briefs", "brief")} disabled={!completed.length || !!busy}>{busy === "brief" && <LoaderCircle className="mr-1.5 size-3.5 animate-spin" />}Gerar brief</Button></div><div className="mt-4 space-y-3">{briefs.length ? briefs.slice(0, 3).map((brief) => <article key={brief.id} className="rounded-md border border-border/70 p-3"><div className="flex items-center justify-between gap-2"><Badge variant={brief.status === "approved" ? "default" : "secondary"}>{brief.status === "approved" ? "Aprovado" : "Draft factual"}</Badge>{brief.status === "draft" && <Button size="sm" onClick={() => void request(`briefs/${encodeURIComponent(brief.id)}/approve`, "approve")} disabled={!!busy}>{busy === "approve" && <LoaderCircle className="mr-1.5 size-3.5 animate-spin" />}Aprovar para Tema</Button>}</div><p className="mt-3 text-xs text-muted-foreground">{brief.summary}</p></article>) : <p className="mt-4 text-xs text-muted-foreground">Após uma coleta concluída, gere aqui o primeiro brief.</p>}</div></section>
          <section className="rounded-lg border border-border bg-card"><header className="border-b border-border px-4 py-3"><h2 className="text-sm font-semibold">Snapshots recentes</h2></header>{runs.length ? <div className="divide-y divide-border">{runs.map((run) => <div key={run.id} className="flex items-center justify-between gap-4 px-4 py-3 text-xs"><div><p className="font-medium">{run.status === "completed" ? "Concluído" : "Falhou"} · {run.records.length} registros</p><p className="mt-0.5 text-muted-foreground">{date(run.startedAt)} {run.error ? `· ${run.error.message}` : ""}</p></div>{run.status === "completed" && <FileCheck2 className="size-4 text-success" />}</div>)}</div> : <p className="px-4 py-8 text-sm text-muted-foreground">Nenhuma coleta executada.</p>}</section>
        </>}
      </main>
    </AppShell>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) { return <div className="rounded-lg border border-border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>; }
