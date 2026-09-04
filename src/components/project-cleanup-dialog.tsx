import { useState } from "react";
import { AlertTriangle, CheckCircle2, LoaderCircle, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Channel, Project, StoredFile, StructuredRecord } from "@/lib/domain";
import {
  applyProjectCleanup,
  EMPTY_PROJECT_CLEANUP_STATUSES,
  formatCleanupBytes,
  previewProjectCleanup,
  projectCleanupConfigurationIssue,
  type ProjectCleanupFinalStatus,
  type ProjectCleanupResponse,
  type ProjectCleanupStatusKey,
  type ProjectCleanupStatuses,
} from "@/lib/project-cleanup";

const DESTINATIONS: Array<{ key: ProjectCleanupStatusKey; label: string }> = [
  { key: "cutmotions_final_status", label: "CutMotions" },
  { key: "instagram_final_status", label: "Instagram" },
  { key: "facebook_final_status", label: "Facebook" },
  { key: "youtube_final_status", label: "YouTube" },
];

const STATUS_OPTIONS: Array<{ value: ProjectCleanupFinalStatus | "detected"; label: string }> = [
  { value: "detected", label: "Usar estado detectado" },
  { value: "scheduled", label: "Agendado" },
  { value: "published", label: "Publicado" },
  { value: "deleted", label: "Apagado pelo operador" },
  { value: "rejected", label: "Reprovado pelo operador" },
  { value: "private", label: "Mantido privado" },
];

function recordNumber(records: StructuredRecord[] | undefined, key: string) {
  return (records ?? []).reduce((total, record) => {
    const value = record[key];
    return total + (typeof value === "number" && Number.isFinite(value) ? value : 0);
  }, 0);
}

function terminalDestinations(records: StructuredRecord[] | undefined) {
  return Boolean(records?.length) && records!.every((record) => record.terminal === true);
}

export function ProjectCleanupDialog({ project, channel }: { project: Project; channel: Channel }) {
  const [open, setOpen] = useState(false);
  const [statuses, setStatuses] = useState<ProjectCleanupStatuses>({
    ...EMPTY_PROJECT_CLEANUP_STATUSES,
  });
  const [preview, setPreview] = useState<ProjectCleanupResponse>();
  const [result, setResult] = useState<ProjectCleanupResponse>();
  const [busy, setBusy] = useState<"preview" | "apply">();
  const [error, setError] = useState<string>();
  const configurationIssue = projectCleanupConfigurationIssue(channel.projectCleanup);
  const checks = preview?.values.publication_checks;
  const receipt = preview?.values.retention_preview;
  const readyToApply = receipt && terminalDestinations(checks);
  const removableFiles = recordNumber(preview?.values.retention_records, "files_removed");
  const removableBytes = recordNumber(preview?.values.retention_records, "bytes_freed");
  const preservedFiles = recordNumber(preview?.values.retention_records, "files_preserved");

  function updateStatus(key: ProjectCleanupStatusKey, value: string) {
    setStatuses((current) => ({
      ...current,
      [key]: value === "detected" ? "" : (value as ProjectCleanupFinalStatus),
    }));
    setPreview(undefined);
    setResult(undefined);
    setError(undefined);
  }

  async function generatePreview() {
    setBusy("preview");
    setError(undefined);
    setResult(undefined);
    try {
      const next = await previewProjectCleanup(project.id, statuses);
      setPreview(next);
      toast.success("Prévia concluída", { description: "Nenhum arquivo foi removido." });
    } catch (nextError) {
      setPreview(undefined);
      setError(nextError instanceof Error ? nextError.message : "Não foi possível gerar a prévia.");
    } finally {
      setBusy(undefined);
    }
  }

  async function applyCleanup() {
    if (!receipt || !readyToApply) return;
    setBusy("apply");
    setError(undefined);
    try {
      const next = await applyProjectCleanup(project.id, receipt as StoredFile, statuses);
      setResult(next);
      toast.success("Produção limpa", {
        description: "O histórico leve foi preservado e somente a produção aberta foi tratada.",
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "A limpeza não pôde ser aplicada.");
    } finally {
      setBusy(undefined);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (busy) return;
    setOpen(nextOpen);
    if (!nextOpen) {
      setPreview(undefined);
      setResult(undefined);
      setError(undefined);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-9 gap-1.5 border-destructive/45 text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={Boolean(configurationIssue)}
          title={configurationIssue}
        >
          <Trash2 className="size-4" />
          Limpar produção
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Limpar somente a produção {project.title}</DialogTitle>
          <DialogDescription>
            Esta ação é manual e isolada pelo ID deste projeto. Ela nunca é iniciada por publicação,
            avanço automático ou “Executar novamente”.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <section className="rounded-lg border border-success/40 bg-success/10 p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
              <div>
                <p className="text-sm font-semibold">Limpeza concluída para esta produção</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {String(result.values.retention_summary ?? "O histórico leve foi preservado.")}
                </p>
              </div>
            </div>
          </section>
        ) : (
          <>
            <section className="rounded-lg border border-border/70 bg-background/40 p-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-brand-soft" />
                <div>
                  <p className="text-sm font-semibold">Duas etapas obrigatórias</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Primeiro gere uma prévia sem exclusão. O botão destrutivo só aparece depois que
                    os destinos estiverem encerrados e a prévia pertencer a esta produção.
                  </p>
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold">Exceções finais de publicação</h3>
                <p className="text-xs text-muted-foreground">
                  Deixe “detectado” quando o ContentFlow já possuir um estado final válido.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {DESTINATIONS.map((destination) => (
                  <div key={destination.key} className="space-y-1.5">
                    <Label>{destination.label}</Label>
                    <Select
                      value={statuses[destination.key] || "detected"}
                      onValueChange={(value) => updateStatus(destination.key, value)}
                      disabled={Boolean(busy)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </section>

            {preview ? (
              <section className="space-y-3 rounded-lg border border-border/70 p-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Remover
                    </p>
                    <p className="text-lg font-semibold">{removableFiles} arquivos</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Liberar
                    </p>
                    <p className="text-lg font-semibold">{formatCleanupBytes(removableBytes)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Preservar
                    </p>
                    <p className="text-lg font-semibold">{preservedFiles} arquivos leves</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {String(preview.values.retention_summary ?? "Prévia concluída sem exclusão.")}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(checks ?? []).map((record, index) => (
                    <div
                      key={`${String(record.area ?? "destino")}-${index}`}
                      className="flex items-center justify-between rounded border border-border/60 px-3 py-2 text-xs"
                    >
                      <span>{String(record.area ?? "Destino")}</span>
                      <span className={record.terminal === true ? "text-success" : "text-warning"}>
                        {String(record.status ?? "ausente")}
                      </span>
                    </div>
                  ))}
                </div>
                {!readyToApply ? (
                  <p className="flex items-center gap-2 text-xs text-warning">
                    <AlertTriangle className="size-4" />
                    Há destinos sem estado final. Ajuste somente as exceções acima e gere outra
                    prévia.
                  </p>
                ) : null}
              </section>
            ) : null}

            {error ? (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            ) : null}
          </>
        )}

        <DialogFooter>
          {result ? (
            <Button onClick={() => setOpen(false)}>Fechar</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={Boolean(busy)}>
                Cancelar
              </Button>
              <Button
                variant="outline"
                onClick={() => void generatePreview()}
                disabled={Boolean(busy)}
              >
                {busy === "preview" ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : null}
                {preview ? "Atualizar prévia" : "Gerar prévia segura"}
              </Button>
              <Button
                variant="destructive"
                onClick={() => void applyCleanup()}
                disabled={!readyToApply || Boolean(busy)}
              >
                {busy === "apply" ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : null}
                Confirmar e limpar esta produção
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
