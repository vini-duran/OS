import type { ChannelResearchConfig } from "@/lib/domain";
import type { PluginCapability, PluginFieldContract } from "@/lib/plugin-contract";

export function isChannelResearchConfig(value: unknown): value is ChannelResearchConfig {
  if (!value || typeof value !== "object") return false;
  const plan = value as Partial<ChannelResearchConfig>;
  return (
    typeof plan.pluginId === "string" &&
    typeof plan.capabilityId === "string" &&
    plan.cadence === "manual" &&
    !!plan.configuration &&
    typeof plan.configuration === "object" &&
    typeof plan.recordsKey === "string" &&
    typeof plan.summaryKey === "string" &&
    typeof plan.minimumBriefRecords === "number" &&
    Number.isInteger(plan.minimumBriefRecords) &&
    plan.minimumBriefRecords >= 1
  );
}

export function researchOutputContract(capability: PluginCapability): PluginFieldContract[] {
  return capability.outputPorts.map((port) => ({
    portKey: port.key,
    key: port.key,
    label: port.label,
    type: port.producedTypes[0],
    required: port.required,
    presentation: port.presentation,
  }));
}
