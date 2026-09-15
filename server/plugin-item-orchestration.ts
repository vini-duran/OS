import { randomUUID } from "node:crypto";
import type {
  PluginCapability,
  PluginExecutionRequest,
  PluginInvocation,
} from "../src/lib/plugin-contract";
import type { RuntimeValue } from "../src/lib/domain";
import type { PersistentPluginJob } from "./plugin-job-store";

export function declaredItemOrchestration(
  capability: PluginCapability,
  request: PluginExecutionRequest,
) {
  const policy = capability.execution.itemOrchestration;
  const items = policy ? request.inputs[policy.inputPort] : undefined;
  if (!policy || !Array.isArray(items) || items.length < 2) return undefined;
  return {
    inputPort: policy.inputPort,
    outputPort: policy.outputPort,
    combinedOutputPort: policy.combinedOutputPort,
    items: structuredClone(items) as RuntimeValue[],
    itemIds: items.map(() => randomUUID()),
    currentIndex: 0,
  } satisfies NonNullable<PersistentPluginJob["itemOrchestration"]>;
}

export function invocationRequestForJob(job: PersistentPluginJob, invocation: PluginInvocation) {
  const configuration = { ...job.request.configuration };
  const fallback = job.profileFallback;
  if (fallback)
    configuration[fallback.configurationKey] = fallback.candidates[fallback.activeIndex];
  const activeProfile = fallback?.candidates[fallback.activeIndex];
  const conversation =
    job.request.conversation?.mode === "reuse" &&
    job.request.conversation.sourceProfile &&
    activeProfile &&
    job.request.conversation.sourceProfile !== activeProfile
      ? {
          mode: "new" as const,
          fallbackContext: job.request.conversation.fallbackContext,
          continuationMessage: job.request.conversation.continuationMessage,
        }
      : job.request.conversation;
  const inputs = { ...job.request.inputs };
  const item = job.itemOrchestration;
  if (item) inputs[item.inputPort] = structuredClone(item.items[item.currentIndex]);
  const itemOutputKey = item
    ? (job.request.outputContract.find((field) => field.portKey === item.outputPort)?.key ??
      item.outputPort)
    : undefined;
  const completedItems = itemOutputKey ? job.partialValues[itemOutputKey] : undefined;
  const currentAttempt = job.request.attempt + job.retryCount;
  const target = job.request.recoveryAuthorization?.target;
  const isAuthorized =
    invocation.mode === "start" &&
    job.retryCount === 0 &&
    Boolean(
      target &&
        target.executionId === job.request.executionId &&
        target.blockId === job.request.blockId &&
        target.attempt === currentAttempt,
    );
  const recoveryAuthorization = isAuthorized ? job.request.recoveryAuthorization : undefined;
  return {
    ...job.request,
    // A retry explícita é uma nova tentativa lógica. Avançar o número impede
    // que bridges idempotentes reproduzam do cache os comandos da tentativa
    // anterior (por exemplo, "preencher" e "enviar" em uma nova aba vazia).
    attempt: currentAttempt,
    recoveryAuthorization,
    invocation,
    configuration,
    conversation,
    inputs,
    batch: item
      ? {
          itemId: item.itemIds[item.currentIndex],
          index: item.currentIndex,
          total: item.items.length,
          completedItems: Array.isArray(completedItems)
            ? structuredClone(completedItems)
            : undefined,
        }
      : undefined,
  } satisfies PluginExecutionRequest;
}

export function requestForNextOrchestratedItem(
  job: PersistentPluginJob,
  input: {
    conversationId?: string;
    sourceProfile?: string;
    fallbackContext?: string;
  },
) {
  if (!input.conversationId) return job.request;
  return {
    ...job.request,
    conversation: {
      mode: "reuse" as const,
      id: input.conversationId,
      sourceProfile: input.sourceProfile,
      fallbackContext: input.fallbackContext,
    },
  } satisfies PluginExecutionRequest;
}

export function appendOrchestratedOutput(
  current: Record<string, RuntimeValue>,
  incoming: Record<string, RuntimeValue>,
  outputKey: string,
) {
  const next = { ...current, ...incoming };
  const priorItems = Array.isArray(current[outputKey]) ? current[outputKey] : [];
  const incomingItems = Array.isArray(incoming[outputKey])
    ? incoming[outputKey]
    : incoming[outputKey] === undefined
      ? []
      : [incoming[outputKey]];
  next[outputKey] = [...priorItems, ...incomingItems] as RuntimeValue;
  return next;
}

export function combineOrchestratedTextOutput(
  values: Record<string, RuntimeValue>,
  itemOutputKey: string,
  combinedOutputKey?: string,
) {
  if (!combinedOutputKey) return values;
  const items = values[itemOutputKey];
  if (!Array.isArray(items) || !items.every((item) => typeof item === "string")) return values;
  return { ...values, [combinedOutputKey]: items.join("\n\n") };
}
