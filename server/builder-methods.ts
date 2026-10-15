import { z } from "zod";
import { isDeepStrictEqual } from "node:util";
import {
  PROCESS_META,
  PROCESS_ORDER,
  type Channel,
  type ProcessMethod,
  type StrategicCollection,
  type UniversalProcess,
} from "../src/lib/domain";
import { getMethodConfigurationIssue, normalizeMethodBlocks } from "../src/lib/human-workflow";
import { areInputShapesCompatible, areValueShapesCompatible } from "../src/lib/data-shape";
import { processMethodV3Schema } from "../src/lib/method-contract-v3";
import { effectiveProcessOrder, validateProcessDependencies } from "../src/lib/process-order";
import type { RegisteredPlugin } from "./plugin-runner";
import { pluginConnectionRequired } from "../src/lib/plugin-contract";
import { validateLocalProfileExecution } from "./profile-execution-policy";
import {
  isNativeHumanDatetimeShape,
  proveNativeHumanDatetimeGraphs,
  type NativeHumanDatetimeProof,
} from "./native-human-datetime-contract";
const methodSchema = processMethodV3Schema.refine((method) => method.blocks.length > 0, {
  message: "O Método precisa ter pelo menos um bloco.",
  path: ["blocks"],
});

export const BUILDER_METHOD_CONTRACT = {
  universalProcesses: PROCESS_ORDER.map((id) => ({ id, label: PROCESS_META[id].label })),
  blockTypes: ["BUSCAR", "ESCOLHER", "CRIAR", "VALIDAR"],
  operators: ["IA", "Humano", "Código"],
  strategicFields: {
    kind: "content",
    families: ["text", "image", "audio", "video"],
    textFormats:
      "JSON, SRT e outros formatos textuais aceitos explicitamente pela porta continuam sendo text; não são interpretados automaticamente como relações pelo Core.",
    associations:
      "O plugin produtor fornece IDs canônicos das entradas ao modelo e valida seu formato textual; o plugin consumidor resolve as referências pela proveniência das entregas. O Core não decide associações editoriais. Exemplo: roteiro → personagens → referências → prompts com IDs → cenas consistentes.",
    internalFields:
      "Preserve contratos internos existentes. Decisão de VALIDAR, identidade de ESCOLHER e Histórico do Canal são mecanismos internos, não campos estratégicos configuráveis. Recibos internos explícitos de plugin (porta internal:true opt-in, portKey explícita, shape exato fechado, sem approval produzido por plugin) podem transportar proveniência via previous_block ou previous_process com blockId; aprovação humana nativa pode consumir/exibir esses recibos. Sem inferência automática de porta e sem novos controles/registros arbitrários.",
  },
  processOutputs: {
    theme: [
      {
        key: "theme",
        shape: { kind: "content", family: "text", cardinality: "one", representation: "inline" },
      },
    ],
    title: [
      {
        key: "title",
        shape: { kind: "content", family: "text", cardinality: "one", representation: "inline" },
      },
    ],
    thumbnail: [
      {
        key: "thumbnail",
        shape: { kind: "content", family: "image", cardinality: "one", representation: "artifact" },
      },
    ],
    script: [
      {
        key: "script",
        shape: { kind: "content", family: "text", cardinality: "one", representation: "inline" },
      },
    ],
    narration: [
      {
        key: "audio",
        shape: { kind: "content", family: "audio", cardinality: "one", representation: "artifact" },
      },
    ],
    assets: [
      {
        key: "images",
        shape: {
          kind: "content",
          family: "image",
          cardinality: "many",
          representation: "artifact",
        },
      },
      {
        key: "videos",
        shape: {
          kind: "content",
          family: "video",
          cardinality: "many",
          representation: "artifact",
        },
      },
    ],
    editing: [
      {
        key: "video",
        shape: { kind: "content", family: "video", cardinality: "one", representation: "artifact" },
      },
    ],
    publishing: [{ key: "url", shape: { kind: "control", control: "url", cardinality: "one" } }],
  },
  strategyGuidance: {
    blockGranularity:
      "Cada Bloco representa uma transformação estratégica observável, não uma tela ou modo conveniente de plugin.",
    layerResponsibilities: {
      method:
        "Define intenção, composição, bindings e entregas que possuem valor estratégico próprio.",
      core: "Possui identidade, estado, work units, deliveries, artifacts, perfis, leases, tentativas, distribuição e recovery.",
      plugin:
        "Executa a particularidade do provedor e pode manter subtarefas internas necessárias para cumprir uma capability.",
      browserBridge:
        "Transporta operações de navegador autorizadas e versionadas; não define estratégia nem recovery.",
      profile:
        "É recurso físico local do Core, reutilizável somente por vínculos explícitos e nunca vira etapa do Método.",
    },
    splitWhen: [
      "A etapa produz uma entrega intermediária útil, reutilizável ou inspecionável.",
      "A etapa muda a família, a representação ou o significado do resultado.",
      "A etapa possui validação, retry, executor, configuração, custo ou falha independentes.",
      "Preservar a etapa evita repetir trabalho concluído e melhora proveniência ou recuperação parcial.",
    ],
    combineWhen:
      "Combine somente detalhes internos inseparáveis da mesma ação, sem entrega intermediária estrategicamente útil nem decisão própria.",
    avoidExtraBlocksFor: [
      "itens de uma coleção many",
      "tentativas, retry, fallback ou reconciliação",
      "perfis, lanes e leases",
      "login já preparado, navegação, upload, polling, download ou parsing",
      "validação técnica de página, arquivo ou resposta",
    ],
    example:
      "Gerar imagens e animá-las deve ser, por padrão, CRIAR images → VALIDAR opcional → CRIAR videos; use um único Bloco apenas se as imagens forem detalhe interno descartável e o contrato exigir somente o vídeo final.",
  },
  rules: [
    "Crie entradas e entregas estratégicas somente com kind: content e família text, image, audio ou video. Não crie schemas de controle ou registros para o usuário configurar.",
    "Use somente os oito processos, quatro tipos de bloco e três operadores declarados.",
    "Defina a estratégia e as fronteiras dos Blocos antes de escolher plugin ou capability.",
    "Não colapse etapas estratégicas apenas porque uma capability oferece um modo combinado.",
    "Não crie Blocos para itens, perfis, tentativas ou operações técnicas internas da capability.",
    "Referências previous_block devem apontar para um bloco anterior do mesmo Método.",
    "Referências previous_process devem apontar para um processo universal anterior.",
    "Nunca inclua segredos, tokens, IDs de execução, projeto, entrega ou item no Método.",
    "connectionId é uma associação local e nunca deve entrar em um pacote portátil.",
  ],
} as const;

export type BuilderConnection = {
  id: string;
  name: string;
  // null significa cofre não consultado.
  connected: boolean | null;
  credentialStatus?: "not_checked";
};
export type BuilderPluginContext = {
  plugin: RegisteredPlugin;
  enabled: boolean;
  connections: BuilderConnection[];
  profiles: Array<{ id: string; name: string; alias: string }>;
};

export type BuilderValidationResult = {
  ok: boolean;
  methods?: Partial<Record<UniversalProcess, ProcessMethod>>;
  errors: string[];
  warnings: string[];
};

function shapeContainsApproval(shape: unknown): boolean {
  if (!shape || typeof shape !== "object") return false;
  const candidate = shape as { kind?: string; control?: string; fields?: Array<{ shape?: unknown }> };
  if (candidate.kind === "control" && candidate.control === "approval") return true;
  if (candidate.kind === "record" && Array.isArray(candidate.fields)) {
    return candidate.fields.some((field) => shapeContainsApproval(field?.shape));
  }
  return false;
}

function isClosedInternalRecordShape(shape: unknown): boolean {
  if (!shape || typeof shape !== "object") return false;
  const record = shape as {
    kind?: string;
    cardinality?: string;
    open?: unknown;
    fields?: Array<{ key?: unknown; shape?: unknown; cardinality?: unknown }>;
  };
  if (record.kind !== "record") return false;
  if (record.open === true) return false;
  if (!Array.isArray(record.fields) || record.fields.length === 0) return false;
  if (shapeContainsApproval(shape)) return false;
  for (const field of record.fields) {
    if (!field || typeof field.key !== "string" || !field.key.trim()) return false;
    const inner = field.shape as { kind?: string; open?: unknown; cardinality?: string } | undefined;
    if (!inner || (inner.kind !== "content" && inner.kind !== "control")) return false;
    if (inner.open === true) return false;
    if (!inner.cardinality) return false;
  }
  return true;
}

function isInternalReceiptShape(shape: unknown): boolean {
  if (!shape || typeof shape !== "object") return false;
  const candidate = shape as { kind?: string; control?: string; cardinality?: string };
  if (candidate.kind === "content") return false;
  if (candidate.kind === "control") {
    if (candidate.control === "approval") return false;
    return Boolean(candidate.cardinality);
  }
  return isClosedInternalRecordShape(shape);
}

function isApprovalOneShape(shape: unknown): boolean {
  return isDeepStrictEqual(shape, { kind: "control", control: "approval", cardinality: "one" });
}

function capabilityMatchesBlock(
  capability: { operator?: string; blockTypes?: string[]; processTypes?: string[] },
  block: { operator?: string; type?: string },
  processType: string,
): boolean {
  if (!capability) return false;
  if (capability.operator !== block.operator) return false;
  if (!capability.blockTypes?.includes(block.type ?? "")) return false;
  if (capability.processTypes && !capability.processTypes.includes(processType)) return false;
  return true;
}

function findPluginCapability(
  plugins: BuilderPluginContext[],
  pluginId: string | undefined,
  capabilityId: string | undefined,
) {
  if (!pluginId || !capabilityId) return undefined;
  const entry = plugins.find((candidate) => candidate.plugin.id === pluginId);
  if (!entry) return undefined;
  const capability = entry.plugin.manifest.capabilities.find(
    (candidate) => candidate.id === capabilityId,
  );
  if (!capability) return undefined;
  return { entry, capability };
}

function isGenuineInternalPluginOutput(args: {
  processType: string;
  block: ProcessMethod["blocks"][number];
  output: { id?: string; shape?: unknown; portKey?: string };
  plugins: BuilderPluginContext[];
  originalPortKey: string | undefined;
}): boolean {
  const { processType, block, output, plugins, originalPortKey } = args;
  if (!originalPortKey) return false;
  if (output.portKey !== originalPortKey) return false;
  if (!isInternalReceiptShape(output.shape)) return false;
  if (!block.plugin) return false;
  const resolved = findPluginCapability(
    plugins,
    block.plugin.pluginId,
    block.plugin.capabilityId,
  );
  if (!resolved) return false;
  if (!resolved.entry.enabled || !resolved.entry.plugin.executable) return false;
  if (!capabilityMatchesBlock(resolved.capability as never, block as never, processType))
    return false;
  const port = (resolved.capability.outputPorts as Array<Record<string, unknown>>).find(
    (candidate) => candidate.key === originalPortKey,
  );
  if (!port || port.internal !== true) return false;
  return isDeepStrictEqual(port.shape, output.shape);
}

function isNativeApprovalOutput(args: {
  sourceMethod: ProcessMethod | undefined;
  sourceBlock: ProcessMethod["blocks"][number] | undefined;
  sourceOutput: { key?: string; shape?: unknown } | undefined;
}): boolean {
  const { sourceMethod, sourceBlock, sourceOutput } = args;
  if (!sourceMethod || !sourceBlock || !sourceOutput) return false;
  if (sourceBlock.type !== "VALIDAR" || sourceBlock.operator !== "Humano") return false;
  if (sourceBlock.plugin) return false;
  if (sourceBlock.validation?.mode !== "approval") return false;
  if (sourceOutput.key !== "decision") return false;
  if (!isApprovalOneShape(sourceOutput.shape)) return false;
  const targetId = sourceBlock.validation?.targetBlockId;
  const targetKey = sourceBlock.validation?.targetOutputKey;
  if (!targetId || !targetKey) return false;
  const targetIndex = sourceMethod.blocks.findIndex((candidate) => candidate.id === targetId);
  const sourceIndex = sourceMethod.blocks.findIndex((candidate) => candidate.id === sourceBlock.id);
  if (targetIndex < 0 || targetIndex >= sourceIndex) return false;
  const targetBlock = sourceMethod.blocks[targetIndex];
  if (targetBlock.type === "VALIDAR") return false;
  return Boolean(
    targetBlock.outputs?.some((output) => output.key === targetKey),
  );
}

function isProvenNativeHumanDatetimeField(
  proofs: NativeHumanDatetimeProof[],
  blockId: string,
  field: { id?: string; key?: string; shape?: unknown },
): boolean {
  if (!isNativeHumanDatetimeShape(field.shape)) return false;
  return proofs.some(
    (proof) =>
      (proof.producerBlockId === blockId && field.key === proof.producerOutputKey) ||
      (proof.approvalBlockId === blockId && field.id === proof.reviewInputId) ||
      (proof.consumerBlockId === blockId && field.id === proof.dateInputId),
  );
}

function validatePluginConfiguration(
  blockLabel: string,
  block: ProcessMethod["blocks"][number],
  validationTarget: ProcessMethod["blocks"][number] | undefined,
  plugins: BuilderPluginContext[],
  errors: string[],
  warnings: string[],
) {
  if (!block.plugin) return;
  const entry = plugins.find((candidate) => candidate.plugin.id === block.plugin?.pluginId);
  if (!entry) {
    errors.push(`${blockLabel}: plugin “${block.plugin.pluginId}” não está instalado.`);
    return;
  }
  const capability = entry.plugin.manifest.capabilities.find(
    (candidate) => candidate.id === block.plugin?.capabilityId,
  );
  if (!capability) {
    errors.push(`${blockLabel}: capacidade “${block.plugin.capabilityId}” não existe no plugin.`);
    return;
  }
  if (capability.operator !== block.operator)
    errors.push(`${blockLabel}: operador incompatível com o plugin.`);
  if (!capability.blockTypes.includes(block.type))
    errors.push(`${blockLabel}: tipo de bloco incompatível com o plugin.`);
  if (
    capability.processTypes &&
    !capability.processTypes.includes(blockLabel.split("/")[0] as UniversalProcess)
  ) {
    errors.push(`${blockLabel}: processo incompatível com o plugin.`);
  }
  const requiresConnection = pluginConnectionRequired(entry.plugin.manifest);
  block.plugin.connectionRequired = requiresConnection;
  if (requiresConnection) {
    const connection = entry.connections.find((item) => item.id === block.plugin?.connectionId);
    if (!connection?.connected)
      errors.push(`${blockLabel}: selecione uma conexão local ativa para o plugin.`);
  }
  if (!entry.enabled || !entry.plugin.executable)
    warnings.push(`${blockLabel}: plugin instalado, mas indisponível para execução no momento.`);

  const profileValidation = validateLocalProfileExecution({
    policy: block.plugin.profileExecution,
    profileSetup: entry.plugin.manifest.profileSetup,
    isBoundProfile: (profileId) => entry.profiles.some((profile) => profile.id === profileId),
  });
  if (profileValidation.error) errors.push(`${blockLabel}: ${profileValidation.error}`);
  else if (profileValidation.policy) block.plugin.profileExecution = profileValidation.policy;

  const occupiedInputPorts = new Set<string>();
  const assignedInputPorts = new Set<string>();
  for (const input of block.inputs ?? []) {
    const compatible = capability.inputPorts.filter((port) =>
      areValueShapesCompatible(input.shape, port.shape),
    );
    if (input.portKey) {
      const selected = compatible.find((port) => port.key === input.portKey);
      if (!selected)
        errors.push(`${blockLabel}: porta da entrada “${input.label}” é incompatível.`);
      else if (
        (selected as { internal?: unknown }).internal === true &&
        !isDeepStrictEqual(selected.shape, input.shape)
      )
        errors.push(`${blockLabel}: porta da entrada “${input.label}” é incompatível.`);
      else if (occupiedInputPorts.has(selected.key))
        errors.push(`${blockLabel}: a porta da entrada “${input.label}” já está ocupada.`);
      else {
        assignedInputPorts.add(selected.key);
        occupiedInputPorts.add(selected.key);
      }
    } else {
      const candidates = compatible.filter(
        (port) =>
          (port as { internal?: unknown }).internal !== true &&
          !occupiedInputPorts.has(port.key),
      );
      if (candidates.length === 1) {
        const selected = candidates[0];
        input.portKey = selected.key;
        assignedInputPorts.add(selected.key);
        occupiedInputPorts.add(selected.key);
      } else if (candidates.length === 0) {
        const internalExact = (capability.inputPorts as Array<Record<string, unknown>>).some(
          (port) => port.internal === true && isDeepStrictEqual(port.shape, input.shape),
        );
        if (internalExact)
          errors.push(`${blockLabel}: informe portKey para a entrada ambígua “${input.label}”.`);
        else errors.push(`${blockLabel}: nenhuma porta aceita a entrada “${input.label}”.`);
      } else errors.push(`${blockLabel}: informe portKey para a entrada ambígua “${input.label}”.`);
    }
  }
  if (block.type === "VALIDAR") {
    const targetOutput = validationTarget?.outputs?.find(
      (output) => output.key === block.validation?.targetOutputKey,
    );
    if (targetOutput) {
      const candidates = capability.inputPorts.filter(
        (port) =>
          areValueShapesCompatible(targetOutput.shape, port.shape) &&
          !assignedInputPorts.has(port.key),
      );
      if (block.validation?.targetPortKey) {
        const selected = candidates.find((port) => port.key === block.validation?.targetPortKey);
        if (!selected)
          errors.push(`${blockLabel}: porta do alvo de validação é incompatível ou está ocupada.`);
        else if (
          (selected as { internal?: unknown }).internal === true &&
          !isDeepStrictEqual(selected.shape, targetOutput.shape)
        )
          errors.push(`${blockLabel}: porta do alvo de validação é incompatível ou está ocupada.`);
        else {
          assignedInputPorts.add(selected.key);
          occupiedInputPorts.add(selected.key);
        }
      } else if (
        candidates.filter((port) => (port as { internal?: unknown }).internal !== true).length === 1 &&
        candidates.some((port) => (port as { internal?: unknown }).internal !== true)
      ) {
        const selected = candidates.find(
          (port) => (port as { internal?: unknown }).internal !== true,
        )!;
        block.validation!.targetPortKey = selected.key;
        assignedInputPorts.add(selected.key);
        occupiedInputPorts.add(selected.key);
      } else if (candidates.length === 0) {
        errors.push(`${blockLabel}: nenhuma porta aceita o alvo de validação.`);
      } else {
        errors.push(`${blockLabel}: informe targetPortKey para o alvo de validação ambíguo.`);
      }
    } else if (block.validation?.targetPortKey) {
      errors.push(`${blockLabel}: targetPortKey exige targetOutputKey válido.`);
    }
  }
  for (const output of block.outputs ?? []) {
    if (output.portKey) {
      const port = (capability.outputPorts as Array<Record<string, unknown>>).find(
        (candidate) => candidate.key === output.portKey,
      );
      if (!port) {
        errors.push(`${blockLabel}: porta da saída “${output.label}” é incompatível.`);
      } else if (port.internal === true) {
        if (!isDeepStrictEqual(port.shape, output.shape))
          errors.push(`${blockLabel}: porta da saída “${output.label}” é incompatível.`);
      } else if (
        !(capability.outputPorts as Array<{ key: string; shape: unknown }>).some(
          (candidate) =>
            candidate.key === output.portKey &&
            areValueShapesCompatible(candidate.shape as never, output.shape as never),
        )
      ) {
        errors.push(`${blockLabel}: porta da saída “${output.label}” é incompatível.`);
      }
    } else {
      const candidates = capability.outputPorts.filter(
        (port) =>
          (port as { internal?: unknown }).internal !== true &&
          areValueShapesCompatible(port.shape, output.shape),
      );
      if (candidates.length === 1) output.portKey = candidates[0].key;
      else if (candidates.length === 0) {
        const internalExact = (capability.outputPorts as Array<Record<string, unknown>>).some(
          (port) => port.internal === true && isDeepStrictEqual(port.shape, output.shape),
        );
        if (internalExact)
          errors.push(`${blockLabel}: informe portKey para a saída ambígua “${output.label}”.`);
        else errors.push(`${blockLabel}: nenhuma porta produz a saída “${output.label}”.`);
      } else errors.push(`${blockLabel}: informe portKey para a saída ambígua “${output.label}”.`);
    }
  }
  for (const port of capability.inputPorts.filter((item) => item.required)) {
    if (!assignedInputPorts.has(port.key))
      errors.push(`${blockLabel}: falta a entrada obrigatória do plugin “${port.label}”.`);
  }
  for (const port of capability.outputPorts.filter((item) => item.required)) {
    if (!(block.outputs ?? []).some((output) => output.portKey === port.key))
      errors.push(`${blockLabel}: falta a saída obrigatória do plugin “${port.label}”.`);
  }
  const configSchema = capability.blockConfigSchema;
  for (const key of configSchema.required ?? []) {
    if (block.plugin.configuration[key] === undefined || block.plugin.configuration[key] === "") {
      errors.push(`${blockLabel}: falta a configuração obrigatória do plugin “${key}”.`);
    }
  }
}

export function validateBuilderMethods(input: {
  channel: Channel;
  methods: unknown;
  plugins: BuilderPluginContext[];
  collections: StrategicCollection[];
  migrationReview?: boolean;
}): BuilderValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const record = z.record(methodSchema).safeParse(input.methods);
  if (!record.success) {
    return {
      ok: false,
      errors: record.error.issues.map(
        (issue) => `${issue.path.join(".") || "methods"}: ${issue.message}`,
      ),
      warnings,
    };
  }
  const entries = Object.entries(record.data);
  if (!entries.length) return { ok: false, errors: ["Informe pelo menos um Método."], warnings };
  const methods: Partial<Record<UniversalProcess, ProcessMethod>> = {};
  const order = effectiveProcessOrder(input.channel);
  const positions = new Map(order.map((id, index) => [id, index]));
  const originalInputPortKeys = new Map<string, string | undefined>();
  const originalOutputPortKeys = new Map<string, string | undefined>();
  for (const [proposedKey, proposedMethod] of entries) {
    for (const proposedBlock of proposedMethod.blocks ?? []) {
      for (const proposedInput of proposedBlock.inputs ?? []) {
        originalInputPortKeys.set(
          `${proposedKey}/${proposedBlock.id}/${proposedInput.id}`,
          proposedInput.portKey,
        );
      }
      for (const proposedOutput of proposedBlock.outputs ?? []) {
        originalOutputPortKeys.set(
          `${proposedKey}/${proposedBlock.id}/${proposedOutput.id}`,
          proposedOutput.portKey,
        );
      }
    }
  }
  const completeNormalizedByProcess: Partial<Record<UniversalProcess, ProcessMethod>> = {};
  for (const [proposedKey, proposedMethod] of entries) {
    if (!PROCESS_ORDER.includes(proposedKey as UniversalProcess)) continue;
    const processType = proposedKey as UniversalProcess;
    if (proposedMethod.processType !== processType) continue;
    const normalizedBlocks = normalizeMethodBlocks(proposedMethod.blocks, processType);
    completeNormalizedByProcess[processType] = { ...proposedMethod, processType, blocks: normalizedBlocks };
  }
  const mergedCompleteMethods: Partial<Record<UniversalProcess, ProcessMethod>> = {
    ...input.channel.methods,
    ...completeNormalizedByProcess,
  };
  for (const [key, rawMethod] of entries) {
    if (!PROCESS_ORDER.includes(key as UniversalProcess)) {
      errors.push(`Processo universal desconhecido: “${key}”.`);
      continue;
    }
    const processType = key as UniversalProcess;
    if (rawMethod.processType !== processType) {
      errors.push(`${processType}: processType deve ser “${processType}”.`);
      continue;
    }
    const blocks = normalizeMethodBlocks(rawMethod.blocks, processType);
    const method: ProcessMethod = { ...rawMethod, processType, blocks };
    methods[processType] = method;
    const datetimeProofs: NativeHumanDatetimeProof[] = proveNativeHumanDatetimeGraphs({
      method,
      processType,
      plugins: input.plugins,
      originalInputPortKeys,
    });
    const ids = new Set<string>();
    for (const [index, block] of blocks.entries()) {
      const label = `${processType}/${block.name ?? block.type}`;
      const existingBlock = input.channel.methods[processType]?.blocks.find(
        (item) => item.id === block.id,
      );
      for (const field of [...(block.inputs ?? []), ...(block.outputs ?? [])]) {
        if (field.shape.kind === "content") continue;
        const existingField = [
          ...(existingBlock?.inputs ?? []),
          ...(existingBlock?.outputs ?? []),
        ].find((item) => item.id === field.id);
        const preserved =
          existingField &&
          isDeepStrictEqual(existingField.shape, field.shape) &&
          ("binding" in field
            ? "binding" in existingField && isDeepStrictEqual(existingField.binding, field.binding)
            : "key" in existingField && existingField.key === field.key);
        const nativeDecision =
          !("binding" in field) &&
          field.shape.kind === "control" &&
          field.shape.cardinality === "one" &&
          ((block.type === "VALIDAR" &&
            block.validation?.mode === "approval" &&
            field.key === "decision" &&
            field.shape.control === "approval") ||
            (block.type === "ESCOLHER" &&
              field.key === "selectedItemId" &&
              field.shape.control === "identifier"));
        const nativeHistory =
          "binding" in field &&
          field.binding.kind === "channel_history" &&
          field.shape.kind === "record";
        let internalException = false;
        if (!preserved && !nativeDecision && !nativeHistory) {
          const isOutput = !("binding" in field);
          if (isOutput) {
            const originalPortKey = originalOutputPortKeys.get(
              `${processType}/${block.id}/${field.id}`,
            );
            internalException = isGenuineInternalPluginOutput({
              processType,
              block,
              output: field as { id?: string; shape?: unknown; portKey?: string },
              plugins: input.plugins,
              originalPortKey,
            });
          } else {
            const inputField = field as unknown as {
              id?: string;
              shape?: unknown;
              portKey?: string;
              binding?: { kind?: string; blockId?: string; outputKey?: string; processType?: string };
              label?: string;
            };
            const binding = inputField.binding as
              | { kind: string; blockId?: string; outputKey?: string; processType?: string }
              | undefined;
            const bindingKind = binding?.kind;
            if (bindingKind === "previous_block" || bindingKind === "previous_process") {
              const consumerOriginalPortKey = originalInputPortKeys.get(
                `${processType}/${block.id}/${(inputField as { id?: string }).id}`,
              );
              const consumerHasPlugin = Boolean(block.plugin);
              const consumerIsHumanReview =
                block.type === "VALIDAR" &&
                block.operator === "Humano" &&
                !block.plugin &&
                block.validation?.mode === "approval";
              if (consumerIsHumanReview && !consumerOriginalPortKey && !(inputField as { portKey?: string }).portKey) {
                if (
                  bindingKind === "previous_block" &&
                  isInternalReceiptShape((inputField as { shape?: unknown }).shape)
                ) {
                  const sourceBlockId =
                    bindingKind === "previous_block"
                      ? (binding as { blockId?: string }).blockId
                      : undefined;
                  const sourceOutputKey = (binding as { outputKey?: string }).outputKey;
                  const sourceIndex = blocks.findIndex(
                    (candidate) => candidate.id === sourceBlockId,
                  );
                  const sourceBlock = sourceIndex >= 0 ? blocks[sourceIndex] : undefined;
                  const sourceOutput = sourceBlock?.outputs?.find(
                    (item) => item.key === sourceOutputKey,
                  );
                  if (
                    sourceIndex >= 0 &&
                    sourceIndex < index &&
                    sourceBlock &&
                    sourceOutput &&
                    isDeepStrictEqual(
                      sourceOutput.shape,
                      (inputField as { shape?: unknown }).shape,
                    )
                  ) {
                    const sourceOriginalKey = originalOutputPortKeys.get(
                      `${processType}/${sourceBlock.id}/${sourceOutput.id}`,
                    );
                    if (
                      isGenuineInternalPluginOutput({
                        processType,
                        block: sourceBlock,
                        output: sourceOutput as { id?: string; shape?: unknown; portKey?: string },
                        plugins: input.plugins,
                        originalPortKey: sourceOriginalKey,
                      }) &&
                      block.validation?.targetBlockId === sourceBlock.id &&
                      block.validation?.targetOutputKey === sourceOutput.key
                    ) {
                      internalException = true;
                    }
                  }
                }
              } else if (consumerHasPlugin && consumerOriginalPortKey) {
                const resolvedConsumer = findPluginCapability(
                  input.plugins,
                  block.plugin?.pluginId,
                  block.plugin?.capabilityId,
                );
                const consumerPort = resolvedConsumer?.capability.inputPorts.find(
                  (candidate) => candidate.key === consumerOriginalPortKey,
                ) as unknown as Record<string, unknown> | undefined;
                const consumerCapable =
                  Boolean(resolvedConsumer) &&
                  resolvedConsumer!.entry.enabled &&
                  Boolean(resolvedConsumer!.entry.plugin.executable) &&
                  capabilityMatchesBlock(
                    resolvedConsumer!.capability as never,
                    block as never,
                    processType,
                  ) &&
                  Boolean(consumerPort) &&
                  consumerPort!.internal === true &&
                  isDeepStrictEqual(
                    consumerPort!.shape,
                    (inputField as { shape?: unknown }).shape,
                  ) &&
                  (inputField as { portKey?: string }).portKey === consumerOriginalPortKey;
                if (consumerCapable) {
                  const inputShape = (inputField as { shape?: unknown }).shape;
                  if (isApprovalOneShape(inputShape)) {
                    let sourceMethod: ProcessMethod | undefined;
                    let sourceBlock: ProcessMethod["blocks"][number] | undefined;
                    let sourceOutput:
                      | { key?: string; shape?: unknown }
                      | undefined;
                    if (bindingKind === "previous_block") {
                      const sourceBlockId = (binding as { blockId?: string }).blockId;
                      const sourceOutputKey = (binding as { outputKey?: string }).outputKey;
                      const sourceIndex = blocks.findIndex(
                        (candidate) => candidate.id === sourceBlockId,
                      );
                      if (sourceIndex >= 0 && sourceIndex < index) {
                        sourceMethod = mergedCompleteMethods[processType];
                        sourceBlock = blocks[sourceIndex];
                        sourceOutput = sourceBlock?.outputs?.find(
                          (item) => item.key === sourceOutputKey,
                        );
                      }
                    } else {
                      const sourceProcess = (binding as { processType?: string }).processType as
                        | UniversalProcess
                        | undefined;
                      const sourceBlockId = (binding as { blockId?: string }).blockId;
                      const sourceOutputKey = (binding as { outputKey?: string }).outputKey;
                      if (
                        sourceProcess &&
                        sourceBlockId &&
                        (positions.get(sourceProcess) ?? Infinity) <
                          (positions.get(processType) ?? -1)
                      ) {
                        sourceMethod = mergedCompleteMethods[sourceProcess];
                        sourceBlock = sourceMethod?.blocks.find(
                          (candidate) => candidate.id === sourceBlockId,
                        );
                        sourceOutput = sourceBlock?.outputs?.find(
                          (item) => item.key === sourceOutputKey,
                        );
                      }
                    }
                    if (
                      isNativeApprovalOutput({ sourceMethod, sourceBlock, sourceOutput }) &&
                      sourceOutput &&
                      isDeepStrictEqual(sourceOutput.shape, inputShape)
                    ) {
                      internalException = true;
                    }
                  } else if (isInternalReceiptShape(inputShape)) {
                    if (bindingKind === "previous_block") {
                      const sourceBlockId = (binding as { blockId?: string }).blockId;
                      const sourceOutputKey = (binding as { outputKey?: string }).outputKey;
                      const sourceIndex = blocks.findIndex(
                        (candidate) => candidate.id === sourceBlockId,
                      );
                      const sourceBlock = sourceIndex >= 0 ? blocks[sourceIndex] : undefined;
                      const sourceOutput = sourceBlock?.outputs?.find(
                        (item) => item.key === sourceOutputKey,
                      );
                      if (
                        sourceIndex >= 0 &&
                        sourceIndex < index &&
                        sourceBlock &&
                        sourceOutput &&
                        isDeepStrictEqual(sourceOutput.shape, inputShape)
                      ) {
                        const sourceOriginalKey = originalOutputPortKeys.get(
                          `${processType}/${sourceBlock.id}/${sourceOutput.id}`,
                        );
                        if (
                          isGenuineInternalPluginOutput({
                            processType,
                            block: sourceBlock,
                            output: sourceOutput as {
                              id?: string;
                              shape?: unknown;
                              portKey?: string;
                            },
                            plugins: input.plugins,
                            originalPortKey: sourceOriginalKey,
                          })
                        ) {
                          internalException = true;
                        }
                      }
                    } else {
                      const sourceProcess = (binding as { processType?: string }).processType as
                        | UniversalProcess
                        | undefined;
                      const sourceBlockId = (binding as { blockId?: string }).blockId;
                      const sourceOutputKey = (binding as { outputKey?: string }).outputKey;
                      if (
                        sourceProcess &&
                        sourceBlockId &&
                        sourceOutputKey &&
                        (positions.get(sourceProcess) ?? Infinity) <
                          (positions.get(processType) ?? -1)
                      ) {
                        const sourceMethod = mergedCompleteMethods[sourceProcess];
                        const sourceBlock = sourceMethod?.blocks.find(
                          (candidate) => candidate.id === sourceBlockId,
                        );
                        const sourceOutput = sourceBlock?.outputs?.find(
                          (item) => item.key === sourceOutputKey,
                        );
                        if (sourceBlock && sourceOutput && sourceMethod) {
                          const proposedSourceKey = originalOutputPortKeys.get(
                            `${sourceProcess}/${sourceBlock.id}/${sourceOutput.id}`,
                          );
                          const sourceOriginalKey =
                            proposedSourceKey !== undefined
                              ? proposedSourceKey
                              : (sourceOutput as { portKey?: string }).portKey;
                          if (
                            isDeepStrictEqual(sourceOutput.shape, inputShape) &&
                            isGenuineInternalPluginOutput({
                              processType: sourceProcess,
                              block: sourceBlock,
                              output: sourceOutput as {
                                id?: string;
                                shape?: unknown;
                                portKey?: string;
                              },
                              plugins: input.plugins,
                              originalPortKey: sourceOriginalKey,
                            })
                          ) {
                            internalException = true;
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
        let datetimeException = false;
        if (!preserved && !nativeDecision && !nativeHistory && !internalException) {
          datetimeException = isProvenNativeHumanDatetimeField(
            datetimeProofs,
            block.id,
            field as { id?: string; key?: string; shape?: unknown },
          );
        }
        if (!preserved && !nativeDecision && !nativeHistory && !internalException && !datetimeException) {
          errors.push(
            `${label}: entradas e entregas estratégicas devem ser conteúdo (text, image, audio, video); preserve contratos internos existentes sem criar controles ou registros novos.`,
          );
        }
      }
      if (ids.has(block.id)) errors.push(`${label}: id de bloco duplicado.`);
      ids.add(block.id);
      if (block.order !== index) errors.push(`${label}: order deve ser ${index}.`);
      if (
        block.type === "ESCOLHER" &&
        block.collectionId &&
        !input.collections.some((item) => item.id === block.collectionId)
      ) {
        errors.push(`${label}: coleção estratégica não encontrada.`);
      }
      for (const binding of block.inputs ?? []) {
        const source = binding.binding;
        const sourceKind = source?.kind;
        if (sourceKind === "static" && !source.value.trim())
          errors.push(`${label}: a entrada estática “${binding.label}” não possui valor.`);
        if (sourceKind === "previous_block") {
          const sourceBlockId = source?.kind === "previous_block" ? source.blockId : undefined;
          const sourceOutputKey = source?.kind === "previous_block" ? source.outputKey : undefined;
          const sourceIndex = blocks.findIndex((candidate) => candidate.id === sourceBlockId);
          const sourceOutput = blocks[sourceIndex]?.outputs?.find(
            (item) => item.key === sourceOutputKey,
          );
          if (sourceIndex < 0 || sourceIndex >= index || !sourceOutput)
            errors.push(`${label}: referência inválida na entrada “${binding.label}”.`);
          else if (
            !sourceOutput.shape ||
            !areInputShapesCompatible(sourceOutput.shape, binding.shape)
          )
            errors.push(`${label}: tipo incompatível na entrada “${binding.label}”.`);
        }
      }
      const validationTarget =
        block.type === "VALIDAR"
          ? blocks.find((candidate) => candidate.id === block.validation?.targetBlockId)
          : undefined;
      validatePluginConfiguration(label, block, validationTarget, input.plugins, errors, warnings);
    }
    const issue = getMethodConfigurationIssue(method);
    if (issue) errors.push(`${processType}: ${issue}`);
    const finalOutputs = BUILDER_METHOD_CONTRACT.processOutputs[processType];
    if (
      !finalOutputs.some((finalOutput) =>
        blocks.some((block) =>
          block.outputs?.some(
            (output) =>
              output.key === finalOutput.key &&
              areValueShapesCompatible(output.shape, finalOutput.shape),
          ),
        ),
      )
    ) {
      warnings.push(
        `${processType}: nenhum bloco entrega diretamente um dos outputs canônicos (${finalOutputs.map((output) => output.key).join(", ")}); a saída final dependerá do preenchimento humano.`,
      );
    }
  }
  errors.push(
    ...validateProcessDependencies(
      order,
      { ...input.channel.methods, ...methods },
      input.migrationReview ? (Object.keys(methods) as UniversalProcess[]) : order,
    ),
  );
  return {
    ok: errors.length === 0,
    methods,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
  };
}
