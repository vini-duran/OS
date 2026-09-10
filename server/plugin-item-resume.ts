import type { PersistentPluginJob } from "./plugin-job-store";

/** Explicit recovery, not automatic retry: the caller reconciles external effects first. */
export function prepareItemJobResume(
  job: PersistentPluginJob,
  options: {
    pluginVersion: string;
    timeoutMs: number;
    reconciliationNote: string;
    now?: Date;
  },
): PersistentPluginJob {
  const item = job.itemOrchestration;
  if (job.status !== "failed" || job.cancelRequested || job.jobId)
    throw new Error(
      "Somente um job sequencial falho, sem cancelamento ou job remoto, pode ser retomado.",
    );
  if (
    !item ||
    !Number.isInteger(item.currentIndex) ||
    item.currentIndex < 1 ||
    item.currentIndex >= item.items.length
  )
    throw new Error("Não existe cursor parcial válido para retomar.");
  const key =
    job.request.outputContract.find((f) => f.portKey === item.outputPort)?.key ?? item.outputPort;
  const saved = job.partialValues[key];
  if (
    !Array.isArray(saved) ||
    saved.length !== item.currentIndex ||
    item.itemIds.length !== item.items.length
  )
    throw new Error("As entregas salvas não correspondem ao cursor; nenhuma retomada foi feita.");
  if (
    !options.pluginVersion ||
    !Number.isFinite(options.timeoutMs) ||
    options.timeoutMs < 1000 ||
    options.timeoutMs > 86_400_000 ||
    !options.reconciliationNote?.trim() ||
    options.reconciliationNote.length > 1000
  )
    throw new Error("Metadados da retomada inválidos.");
  const now = options.now ?? new Date();
  return {
    ...structuredClone(job),
    pluginVersion: options.pluginVersion,
    status: "starting",
    nextPollAt: now.toISOString(),
    deadlineAt: new Date(now.getTime() + options.timeoutMs).toISOString(),
    // New logical dispatch identities without discarding prior deliveries/cursor.
    retryCount: job.retryCount + 1,
    error: undefined,
    message: `Retomando item ${item.currentIndex + 1}/${item.items.length}; ${item.currentIndex} entregas preservadas.`,
    updatedAt: now.toISOString(),
    recoveryHistory: [
      ...(job.recoveryHistory ?? []),
      {
        at: now.toISOString(),
        previousPluginVersion: job.pluginVersion,
        previousError: job.error,
        currentIndex: item.currentIndex,
        reconciliationNote: options.reconciliationNote,
      },
    ],
  };
}
