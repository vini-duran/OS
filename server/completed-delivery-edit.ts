import { isDeepStrictEqual } from "node:util";
import type { ActionBlock, BlockExecution, RuntimeValue } from "../src/lib/domain";
import { isEmptyRuntimeValue } from "../src/lib/human-workflow";
import { getPresentationRestrictionIssue } from "../src/lib/presentation";
import { validateRuntimeValueAgainstShape } from "../src/lib/runtime-value-validation";
import { isNativeHumanDatetimeShape } from "./native-human-datetime-contract";

export type CompletedDeliveryEditExecutionContext = {
  methodSnapshot: { blocks: ActionBlock[] };
  blocks: Array<Pick<BlockExecution, "blockId" | "status">>;
};

/** Preserve machine provenance and native decisions when editing completed content. */
export function validateCompletedDeliveryEdit(
  block: ActionBlock,
  currentValues: Record<string, RuntimeValue>,
  submitted: unknown,
  executionContext?: CompletedDeliveryEditExecutionContext,
):
  | { ok: true; values: Record<string, RuntimeValue> }
  | { ok: false; status: 400 | 409; error: string } {
  if (!submitted || typeof submitted !== "object" || Array.isArray(submitted)) {
    return { ok: false, status: 400, error: "Valores de entrega inválidos." };
  }
  const incoming = submitted as Record<string, RuntimeValue>;
  const outputs = block.outputs ?? [];
  const allowedKeys = new Set(outputs.map((field) => field.key));
  const unknownKeys = Object.keys(incoming).filter((key) => !allowedKeys.has(key));
  if (unknownKeys.length) {
    return { ok: false, status: 400, error: `Campos de entrega desconhecidos: ${unknownKeys.join(", ")}.` };
  }
  const values = Object.fromEntries(
    outputs.map((field) => [field.key, incoming[field.key] ?? null]),
  ) as Record<string, RuntimeValue>;
  for (const field of outputs) {
    // The snapshot itself retains this restriction if a plugin is removed or upgraded.
    const machineInternal = Boolean(block.plugin) && field.shape.kind !== "content";
    const nativeDecision = block.type === "VALIDAR" && field.shape.kind === "control" &&
      field.shape.control === "approval";
    if ((machineInternal || nativeDecision) &&
      !isDeepStrictEqual(values[field.key], currentValues[field.key] ?? null)) {
      return {
        ok: false,
        status: 409,
        error: `“${field.label}” é um recibo ou decisão da execução e não pode ser alterado por edição de entrega. Use a validação ou reconciliação da etapa.`,
      };
    }
  }
  const changedDates = outputs.filter(
      (field) =>
        isNativeHumanDatetimeShape(field.shape) &&
        !isDeepStrictEqual(values[field.key], currentValues[field.key] ?? null),
    );
  if (changedDates.length && !executionContext) {
    return { ok: false, status: 400, error: "Recarregue a execução antes de alterar a data; é necessário conferir a aprovação e o consumo da etapa." };
  }
  if (executionContext) {
    if (changedDates.length) {
      const changedKeys = new Set(changedDates.map((field) => field.key));
      const snapshotBlocks = executionContext.methodSnapshot.blocks ?? [];
      const editedIndex = snapshotBlocks.findIndex((item) => item.id === block.id);
      if (editedIndex < 0) {
        return { ok: false, status: 400, error: "O bloco da data não pertence ao snapshot desta execução." };
      }
      const statusByBlock = new Map(
        executionContext.blocks.map((item) => [item.blockId, item.status] as const),
      );
      const isBeyondPending = (blockId: string) => {
        const status = statusByBlock.get(blockId);
        return status !== "pending" && status !== "blocked_executor";
      };
      for (let index = editedIndex + 1; index < snapshotBlocks.length; index += 1) {
        const downstream = snapshotBlocks[index];
        const targetsChangedDate =
          downstream.type === "VALIDAR" &&
          downstream.validation?.targetBlockId === block.id &&
          downstream.validation.targetOutputKey !== undefined &&
          changedKeys.has(downstream.validation.targetOutputKey);
        const consumesChangedDate = (downstream.inputs ?? []).some(
          (input) =>
            input.binding.kind === "previous_block" &&
            input.binding.blockId === block.id &&
            changedKeys.has(input.binding.outputKey),
        );
        if ((targetsChangedDate || consumesChangedDate) && isBeyondPending(downstream.id)) {
          const label = changedDates[0]?.label ?? "Data";
          return {
            ok: false,
            status: 409,
            error: `“${label}” foi alterado após revisão ou consumo. Crie uma nova aprovação ou reconciliação para a nova data; entregas concluídas não são ajustadas automaticamente.`,
          };
        }
      }
    }
  }
  const issues: string[] = [];
  for (const field of outputs) {
    const value = values[field.key];
    if (isEmptyRuntimeValue(value)) {
      if (field.required) issues.push(`Preencha: ${field.label}.`);
      continue;
    }
    const materialIssues = validateRuntimeValueAgainstShape(field.shape, value, field.key);
    if (materialIssues.length) {
      issues.push(`${field.label}: ${materialIssues[0].message}`);
      continue;
    }
    const restriction = getPresentationRestrictionIssue(field.shape, field.presentation, value);
    if (restriction) issues.push(`${field.label}: ${restriction}`);
  }
  if (issues.length) return { ok: false, status: 400, error: issues.join(" ") };
  return { ok: true, values };
}
