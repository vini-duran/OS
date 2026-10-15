import { isDeepStrictEqual } from "node:util";
import type { ActionBlock, ProcessMethod } from "../src/lib/domain";

export const NATIVE_HUMAN_DATETIME_SHAPE = {
  kind: "control",
  control: "datetime",
  cardinality: "one",
} as const;

export const NATIVE_APPROVAL_ONE_SHAPE = {
  kind: "control",
  control: "approval",
  cardinality: "one",
} as const;

export function isNativeHumanDatetimeShape(shape: unknown): boolean {
  return isDeepStrictEqual(shape, { ...NATIVE_HUMAN_DATETIME_SHAPE });
}

export function isNativeApprovalOneShape(shape: unknown): boolean {
  return isDeepStrictEqual(shape, { ...NATIVE_APPROVAL_ONE_SHAPE });
}

type MinimalCapability = {
  id?: string;
  operator?: string;
  blockTypes?: string[];
  processTypes?: string[];
  inputPorts: Array<{ key: string; shape: unknown; internal?: unknown }>;
};

export type DatetimePluginContext = {
  plugin: {
    id: string;
    executable?: boolean;
    manifest: { capabilities: MinimalCapability[] };
  };
  enabled: boolean;
};

export type NativeHumanDatetimeProof = {
  producerBlockId: string;
  producerOutputKey: string;
  approvalBlockId: string;
  reviewInputId: string;
  consumerBlockId: string;
  dateInputId: string;
  approvalInputId: string;
};

function hasFabricatedDefault(output: ActionBlock["outputs"] extends (infer T)[] | undefined ? T : never): boolean {
  const candidate = output as unknown as { default?: unknown; defaultValue?: unknown };
  return candidate.default !== undefined || candidate.defaultValue !== undefined;
}

function isQualifyingProducer(block: ActionBlock, outputKey: string): boolean {
  if (block.type !== "CRIAR" || block.operator !== "Humano" || block.plugin) return false;
  const output = block.outputs?.find((item) => item.key === outputKey);
  if (!output || !isNativeHumanDatetimeShape(output.shape)) return false;
  if (hasFabricatedDefault(output as never)) return false;
  return true;
}

function capabilityMatches(
  capability: MinimalCapability,
  block: ActionBlock,
  processType: string,
): boolean {
  if (capability.operator !== block.operator) return false;
  if (!capability.blockTypes?.includes(block.type)) return false;
  if (capability.processTypes && !capability.processTypes.includes(processType)) return false;
  return true;
}

function resolveCapability(
  plugins: DatetimePluginContext[],
  pluginId: string | undefined,
  capabilityId: string | undefined,
) {
  if (!pluginId || !capabilityId) return undefined;
  const entry = plugins.find((item) => item.plugin.id === pluginId);
  const capability = entry?.plugin.manifest.capabilities.find((item) => item.id === capabilityId);
  if (!entry || !capability) return undefined;
  return { entry, capability };
}

/**
 * Prova o grafo completo no mesmo processo: CRIAR/Humano datetime →
 * VALIDAR/Humano approval com mesmo alvo → consumidor plugin com duas
 * entradas marcadas explícitas (data + aprovação). Sem atalho entre processos.
 */
export function proveNativeHumanDatetimeGraphs(args: {
  method: ProcessMethod;
  processType: string;
  plugins: DatetimePluginContext[];
  originalInputPortKeys: Map<string, string | undefined>;
}): NativeHumanDatetimeProof[] {
  const { method, processType, plugins, originalInputPortKeys } = args;
  const proofs: NativeHumanDatetimeProof[] = [];
  const blocks = method.blocks ?? [];
  for (let producerIndex = 0; producerIndex < blocks.length; producerIndex += 1) {
    const producer = blocks[producerIndex];
    const dateOutputs = (producer.outputs ?? []).filter((output) =>
      isNativeHumanDatetimeShape(output.shape),
    );
    for (const dateOutput of dateOutputs) {
      if (!isQualifyingProducer(producer, dateOutput.key)) continue;
      for (let approvalIndex = producerIndex + 1; approvalIndex < blocks.length; approvalIndex += 1) {
        const approval = blocks[approvalIndex];
        if (approval.type !== "VALIDAR" || approval.operator !== "Humano" || approval.plugin) continue;
        if (approval.validation?.mode !== "approval") continue;
        if (
          approval.validation.targetBlockId !== producer.id ||
          approval.validation.targetOutputKey !== dateOutput.key
        ) continue;
        const decision = approval.outputs?.find((item) => item.key === "decision");
        if (!decision || !isNativeApprovalOneShape(decision.shape)) continue;
        const reviewInput = (approval.inputs ?? []).find(
          (input) =>
            isNativeHumanDatetimeShape(input.shape) &&
            input.binding.kind === "previous_block" &&
            input.binding.blockId === producer.id &&
            input.binding.outputKey === dateOutput.key &&
            !input.portKey,
        );
        if (!reviewInput) continue;
        for (let consumerIndex = approvalIndex + 1; consumerIndex < blocks.length; consumerIndex += 1) {
          const consumer = blocks[consumerIndex];
          if (!consumer.plugin) continue;
          const resolved = resolveCapability(plugins, consumer.plugin.pluginId, consumer.plugin.capabilityId);
          if (!resolved || !resolved.entry.enabled || !resolved.entry.plugin.executable) continue;
          if (!capabilityMatches(resolved.capability, consumer, processType)) continue;
          const dateInput = (consumer.inputs ?? []).find((input) => {
            if (!isNativeHumanDatetimeShape(input.shape)) return false;
            if (input.binding.kind !== "previous_block") return false;
            if (input.binding.blockId !== producer.id || input.binding.outputKey !== dateOutput.key) return false;
            const original = originalInputPortKeys.get(`${processType}/${consumer.id}/${input.id}`);
            if (!original || input.portKey !== original) return false;
            const port = resolved.capability.inputPorts.find((item) => item.key === original);
            if (!port) return false;
            return port.internal === true && isDeepStrictEqual(port.shape, input.shape);
          });
          const approvalInput = (consumer.inputs ?? []).find((input) => {
            if (!isNativeApprovalOneShape(input.shape)) return false;
            if (input.id === dateInput?.id) return false;
            if (input.binding.kind !== "previous_block") return false;
            if (input.binding.blockId !== approval.id || input.binding.outputKey !== "decision") return false;
            const original = originalInputPortKeys.get(`${processType}/${consumer.id}/${input.id}`);
            if (!original || input.portKey !== original) return false;
            const port = resolved.capability.inputPorts.find((item) => item.key === original);
            if (!port) return false;
            return port.internal === true && isDeepStrictEqual(port.shape, input.shape);
          });
          if (!dateInput || !approvalInput) continue;
          proofs.push({
            producerBlockId: producer.id,
            producerOutputKey: dateOutput.key,
            approvalBlockId: approval.id,
            reviewInputId: reviewInput.id,
            consumerBlockId: consumer.id,
            dateInputId: dateInput.id,
            approvalInputId: approvalInput.id,
          });
        }
      }
    }
  }
  return proofs;
}
