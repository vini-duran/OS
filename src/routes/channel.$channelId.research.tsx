import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CircleAlert, Copy, ExternalLink, LoaderCircle, Play, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ChannelResearchBrief, ChannelResearchRun } from "@/lib/domain";
import { useChannel } from "@/lib/store";

export const Route = createFileRoute("/channel/$channelId/research")({
  component: ChannelResearchPage,
});

function compact(value: unknown) {
  return typeof value === "number" ? new Intl.NumberFormat("pt-BR").format(value) : "—";
}

function dateTime(value?: string) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf())
    ? "—"
    : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(parsed);
}

function ChannelResearchPage() {
  const { channelId } = Route.useParams();
  const channel = useChannel(channelId);
  const [runs, setRuns] = useState<ChannelResearchRun[]>([]);
  const [briefs, setBriefs] = useState<ChannelResearchBrief[]>([]);
  const [briefing, setBriefing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [selectedTranscriptIds, setSelectedTranscriptIds] = useState<string[]>([]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/channels/${encodeURIComponent(channelId)}/research/daily/runs`,
      );
      const body = (await response.json()) as { runs?: ChannelResearchRun[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Não foi possível carregar as pesquisas.");
      setRuns(body.runs ?? []);
      const briefResponse = await fetch(
        `/api/channels/${encodeURIComponent(channelId)}/research/weekly/briefs`,
      );
      const briefBody = (await briefResponse.json()) as { briefs?: ChannelResearchBrief[] };
      if (briefResponse.ok) setBriefs(briefBody.briefs ?? []);
      const selectionResponse = await fetch(
        `/api/channels/${encodeURIComponent(channelId)}/research/faceless-selections`,
      );
      if (selectionResponse.ok) {
        const selectionBody = (await selectionResponse.json()) as {
          selections?: { videoId: string }[];
        };
        setSelectedTranscriptIds((selectionBody.selections ?? []).map((item) => item.videoId));
      }
    } catch (error) {
      toast.error("Não foi possível carregar a pesquisa", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!runs.some((run) => run.status === "running")) return undefined;
    const timer = window.setInterval(() => void reload(), 5_000);
    return () => window.clearInterval(timer);
  }, [reload, runs]);

  const latest = runs[0];
  const completed = useMemo(() => runs.filter((run) => run.status === "completed"), [runs]);

  async function runDailyResearch() {
    if (!channel?.research) return;
    const quota = channel.research.maxEstimatedQuotaUnits;
    if (
      !window.confirm(
        `Executar a pesquisa factual V2 agora? Até ${channel.research.targetRawVideos.toLocaleString("pt-BR")} registros brutos, ${channel.research.maxSearchCalls} páginas de busca e ${quota.toLocaleString("pt-BR")} requests estimados. Ela não gera tema, roteiro, mídia nem brief aprovado.`,
      )
    )
      return;
    setRunning(true);
    try {
      const response = await fetch(
        `/api/channels/${encodeURIComponent(channelId)}/research/daily/runs`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
      );
      const body = (await response.json()) as { run?: ChannelResearchRun; error?: string };
      if (!response.ok) throw new Error(body.error ?? "A pesquisa não foi concluída.");
      if (body.run)
        setRuns((current) => [body.run!, ...current.filter((run) => run.id !== body.run!.id)]);
      toast.success("Snapshot diário concluído. Ele ainda não aprova nem altera o Tema.");
    } catch (error) {
      toast.error("A pesquisa diária falhou", {
        description: error instanceof Error ? error.message : undefined,
      });
      await reload();
    } finally {
      setRunning(false);
    }
  }

  async function createBrief() {
    setBriefing(true);
    try {
      const response = await fetch(
        `/api/channels/${encodeURIComponent(channelId)}/research/weekly/briefs`,
        { method: "POST" },
      );
      const body = (await response.json()) as { brief?: ChannelResearchBrief; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Não foi possível gerar o brief.");
      if (body.brief) setBriefs((current) => [body.brief!, ...current]);
      toast.success("Brief factual local criado. Consumo de IA: 0 tokens.");
    } catch (error) {
      toast.error("Não foi possível criar o brief", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBriefing(false);
    }
  }
  async function approveBrief(briefId: string) {
    try {
      const response = await fetch(
        `/api/channels/${encodeURIComponent(channelId)}/research/weekly/briefs/${encodeURIComponent(briefId)}/approve`,
        { method: "POST" },
      );
      const body = (await response.json()) as { brief?: ChannelResearchBrief; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Não foi possível aprovar o brief.");
      if (body.brief)
        setBriefs((current) =>
          current.map((brief) => (brief.id === body.brief!.id ? body.brief! : brief)),
        );
      toast.success("Brief aprovado e enviado à coleção que alimenta o Método Tema.");
    } catch (error) {
      toast.error("Não foi possível aprovar", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }

  async function selectForTranscript(videoId: string, url?: string) {
    const response = await fetch(
      `/api/channels/${encodeURIComponent(channelId)}/research/faceless-selections`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, url }),
      },
    );
    if (!response.ok) {
      toast.error("Não foi possível salvar a seleção para transcrição.");
      return;
    }
    setSelectedTranscriptIds((current) =>
      current.includes(videoId) ? current : [...current, videoId],
    );
    toast.success("Vídeo selecionado como referência para transcrição.");
  }

  if (!channel) return null;
  const plan = channel.research;

  return (
    <AppShell>
      <TopBar
        showNewProject={false}
        breadcrumbs={[{ label: "Canais" }, { label: channel.name }, { label: "Pesquisa diária" }]}
        title="Pesquisa diária"
        subtitle="Monitor factual do YouTube no nível do canal — não é um Método por vídeo."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void reload()}
              disabled={loading || running}
            >
              <RefreshCw className={`mr-1.5 size-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
            </Button>
            <Button size="sm" onClick={() => void runDailyResearch()} disabled={!plan || running}>
              {running ? (
                <LoaderCircle className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <Play className="mr-1.5 size-3.5" />
              )}
              Executar agora
            </Button>
          </div>
        }
      />
      <main className="flex-1 space-y-5 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {!plan ? (
          <section className="mx-auto max-w-2xl rounded-lg border border-destructive/40 bg-card p-6">
            <CircleAlert className="size-5 text-destructive" />
            <h2 className="mt-3 font-semibold">Pesquisa diária não configurada</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Este canal ainda não recebeu um plano de monitoramento factual.
            </p>
          </section>
        ) : (
          <>
            <section className="grid gap-3 lg:grid-cols-3">
              <Metric
                label="Cadência"
                value="Manual diária"
                detail="Nenhuma chamada é agendada ou escondida."
              />
              <Metric
                label="Plano atual"
                value={`${plan.queries.length} consultas`}
                detail={`${plan.region} · ${plan.language} · vídeos acima de 3 min`}
              />
              <Metric
                label="Teto da rodada"
                value={`${compact(plan.targetRawVideos)} vídeos brutos`}
                detail={`${plan.maxSearchCalls ?? plan.queries.length} páginas · até ${plan.maxCommentVideoSamples ?? 0} amostras de comentários · ${compact(plan.maxEstimatedQuotaUnits)} requests estimados`}
              />
            </section>

            <section className="rounded-lg border border-border bg-card p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">Plano de descoberta Spanish</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    México-core como lente de pesquisa; não prova nacionalidade da audiência. Dados
                    são observados, não hipótese editorial.
                  </p>
                </div>
                <Badge variant="secondary">Plugin YouTube separado</Badge>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {plan.queries.map((query) => (
                  <span
                    key={query.id}
                    className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-xs"
                  >
                    <span className="font-medium">
                      {query.referenceLane === "core_faceless" ? "Core" : "Bending"}
                    </span>{" "}
                    · {query.text}
                  </span>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-border bg-card p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">Brief semanal para o Tema</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Consolida snapshots em um draft factual. O fallback local usa 0 tokens; a única
                    aprovação humana libera o Tema.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void createBrief()}
                  disabled={!completed.length || briefing}
                >
                  {briefing ? (
                    <LoaderCircle className="mr-1.5 size-3.5 animate-spin" />
                  ) : (
                    <Play className="mr-1.5 size-3.5" />
                  )}
                  Gerar brief (0 tokens)
                </Button>
              </div>
              {!briefs.length ? (
                <p className="mt-4 text-xs text-muted-foreground">
                  Sem brief ainda. Primeiro execute um snapshot diário; depois gere a síntese local.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {briefs.slice(0, 3).map((brief) => (
                    <article key={brief.id} className="rounded-md border border-border/70 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <Badge variant={brief.status === "approved" ? "default" : "secondary"}>
                            {brief.status === "approved" ? "Aprovado" : "Draft factual"}
                          </Badge>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {brief.sourceVideoCount} vídeos · 0 tokens · fallback local
                          </span>
                        </div>
                        {brief.status === "draft" && (
                          <Button size="sm" onClick={() => void approveBrief(brief.id)}>
                            Aprovar para Tema
                          </Button>
                        )}
                      </div>
                      <p className="mt-3 whitespace-pre-wrap text-xs text-muted-foreground">
                        {brief.summary}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {brief.usage.fallbackReason}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-lg border border-border bg-card">
              <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5">
                <div>
                  <h2 className="text-sm font-semibold">Snapshots recentes</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {completed.length} concluído(s). Um snapshot nunca aprova sozinho a Pesquisa
                    semanal.
                  </p>
                </div>
                {latest && (
                  <span className="text-xs text-muted-foreground">
                    Último: {dateTime(latest.startedAt)}
                  </span>
                )}
              </header>
              {loading ? (
                <div className="flex items-center gap-2 px-5 py-8 text-sm text-muted-foreground">
                  <LoaderCircle className="size-4 animate-spin" /> Carregando…
                </div>
              ) : !runs.length ? (
                <div className="px-5 py-8 text-sm text-muted-foreground">
                  Ainda não há pesquisas executadas. Use “Executar agora” quando quiser iniciar o
                  primeiro snapshot factual.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {runs.map((run) => (
                    <ResearchRunCard
                      key={run.id}
                      run={run}
                      selectedTranscriptIds={selectedTranscriptIds}
                      onSelectForTranscript={selectForTranscript}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </AppShell>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function ResearchRunCard({
  run,
  selectedTranscriptIds,
  onSelectForTranscript,
}: {
  run: ChannelResearchRun;
  selectedTranscriptIds: string[];
  onSelectForTranscript: (videoId: string, url?: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const estimated =
    typeof run.usage?.estimatedQuotaUnits === "number" ? run.usage.estimatedQuotaUnits : undefined;
  return (
    <article className="px-4 py-3.5 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={
                run.status === "completed"
                  ? "default"
                  : run.status === "failed"
                    ? "destructive"
                    : "secondary"
              }
            >
              {run.status === "completed"
                ? "Concluída"
                : run.status === "failed"
                  ? "Falhou"
                  : "Em execução"}
            </Badge>
            <span className="text-sm font-medium">{dateTime(run.startedAt)}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {run.videos.length} vídeos na prévia ·{" "}
            {estimated ? `${compact(estimated)} quota estimada` : "pré-flight indisponível"}
          </p>
          {run.error && (
            <p className="mt-1 text-xs text-destructive">
              {run.error.code}: {run.error.message}
            </p>
          )}
        </div>
        {run.status === "completed" && (
          <div className="flex flex-wrap gap-2">
            {run.artifacts?.map((artifact) => (
              <Button key={artifact.id} variant="outline" size="sm" asChild>
                <a href={artifact.url} download={artifact.name}>
                  Baixar base completa
                </a>
              </Button>
            ))}
            <Button variant="outline" size="sm" onClick={() => setOpen((value) => !value)}>
              {open ? "Ocultar dados" : "Ver dados"}
            </Button>
          </div>
        )}
      </div>
      {open && (
        <div className="mt-4 overflow-x-auto rounded-md border border-border/70">
          <table className="min-w-[760px] w-full text-left text-xs">
            <thead className="bg-secondary/40 text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Vídeo</th>
                <th className="px-3 py-2">Canal</th>
                <th className="px-3 py-2">Views</th>
                <th className="px-3 py-2">Inscritos</th>
                <th className="px-3 py-2">Comentários</th>
                <th className="px-3 py-2">Consulta</th>
                <th className="px-3 py-2">Faceless</th>
              </tr>
            </thead>
            <tbody>
              {run.videos.slice(0, 5).map((video, index) => (
                <tr
                  key={`${String(video.video_id)}-${index}`}
                  className="border-t border-border/60"
                >
                  <td className="max-w-72 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <a
                        className="inline-flex items-center gap-1 hover:underline"
                        href={typeof video.video_url === "string" ? video.video_url : undefined}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {String(video.title ?? "—").slice(0, 90)}{" "}
                        <ExternalLink className="size-3" />
                      </a>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Copiar URL do vídeo"
                        title="Copiar URL"
                        onClick={() => {
                          const url = typeof video.video_url === "string" ? video.video_url : "";
                          if (!url || !navigator.clipboard) {
                            toast.error("A URL deste vídeo não está disponível.");
                            return;
                          }
                          void navigator.clipboard.writeText(url).then(
                            () => toast.success("URL copiada."),
                            () => toast.error("Não foi possível copiar a URL."),
                          );
                        }}
                      >
                        <Copy className="size-3.5" />
                      </Button>
                    </div>
                  </td>
                  <td className="px-3 py-2">{String(video.channel_title ?? "—")}</td>
                  <td className="px-3 py-2">{compact(video.view_count)}</td>
                  <td className="px-3 py-2">{compact(video.subscriber_count)}</td>
                  <td className="px-3 py-2">{compact(video.comment_count)}</td>
                  <td className="px-3 py-2">{String(video.search_query ?? "—")}</td>
                  <td className="px-3 py-2">
                    <Button
                      size="sm"
                      variant={
                        selectedTranscriptIds.includes(String(video.video_id))
                          ? "default"
                          : "outline"
                      }
                      onClick={() =>
                        void onSelectForTranscript(
                          String(video.video_id),
                          String(video.video_url ?? ""),
                        )
                      }
                    >
                      {selectedTranscriptIds.includes(String(video.video_id))
                        ? "Selecionado"
                        : "Usar como referência"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
            Mostrando os 5 melhores registros. Se o vídeo tiver um mecanismo, gancho ou estrutura
            útil, clique em “Usar como referência”. Ele entra na fila de transcrição; ser faceless
            não é obrigatório. Os demais não entram na fila.
          </p>
        </div>
      )}
    </article>
  );
}
