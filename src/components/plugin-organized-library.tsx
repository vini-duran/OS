import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Star } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AppLanguage } from "@/lib/app-preferences";
import { pluginCardGridStyle, type PluginCardSize } from "@/lib/plugin-card-size";
import {
  matchesOrganizationFilter,
  organizationItemFor,
  resolveSectionListing,
  type OrganizationCardFilter,
  type PluginOrganization,
} from "@/lib/plugin-organization";
import {
  pluginOrganizationSectionLabel,
  pluginOrganizationText,
} from "@/lib/plugin-organization-localization";

export type OrganizedLibraryCardFilter = OrganizationCardFilter & {
  matchesBaseFilter: (pluginId: string) => boolean;
};

type PluginOrganizedLibraryProps = {
  organization: PluginOrganization;
  inventoryIds: string[];
  filter: OrganizedLibraryCardFilter;
  cardSize: PluginCardSize;
  language: AppLanguage;
  disabled: boolean;
  renderCard: (pluginId: string) => ReactNode;
  pluginNameFor: (pluginId: string) => string;
  onToggleFavorite: (pluginId: string) => void;
  onReorderSection: (sectionId: string, visibleOrderedIds: string[]) => void;
};

export function PluginOrganizedLibrary({
  organization,
  inventoryIds,
  filter,
  cardSize,
  language,
  disabled,
  renderCard,
  pluginNameFor,
  onToggleFavorite,
  onReorderSection,
}: PluginOrganizedLibraryProps) {
  const listing = resolveSectionListing(organization, inventoryIds);
  const sections =
    filter.sectionId === "all"
      ? organization.sections
      : organization.sections.filter((section) => section.id === filter.sectionId);

  return (
    <div className="mt-4 space-y-6">
      {sections.map((section) => {
        const visibleIds = (listing[section.id] ?? []).filter(
          (pluginId) =>
            filter.matchesBaseFilter(pluginId) &&
            matchesOrganizationFilter(organization, pluginId, filter),
        );
        if (visibleIds.length === 0) return null;
        return (
          <PluginOrganizationSectionGrid
            key={section.id}
            sectionId={section.id}
            sectionName={section.name}
            visibleIds={visibleIds}
            cardSize={cardSize}
            language={language}
            disabled={disabled}
            renderCard={renderCard}
            pluginNameFor={pluginNameFor}
            isFavorite={(pluginId) => organizationItemFor(organization, pluginId).favorite}
            onToggleFavorite={onToggleFavorite}
            onReorderSection={onReorderSection}
          />
        );
      })}
    </div>
  );
}

function PluginOrganizationSectionGrid({
  sectionId,
  sectionName,
  visibleIds,
  cardSize,
  language,
  disabled,
  renderCard,
  pluginNameFor,
  isFavorite,
  onToggleFavorite,
  onReorderSection,
}: {
  sectionId: string;
  sectionName: string | undefined;
  visibleIds: string[];
  cardSize: PluginCardSize;
  language: AppLanguage;
  disabled: boolean;
  renderCard: (pluginId: string) => ReactNode;
  pluginNameFor: (pluginId: string) => string;
  isFavorite: (pluginId: string) => boolean;
  onToggleFavorite: (pluginId: string) => void;
  onReorderSection: (sectionId: string, visibleOrderedIds: string[]) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (disabled || !over || active.id === over.id) return;
    const oldIndex = visibleIds.indexOf(String(active.id));
    const newIndex = visibleIds.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    onReorderSection(sectionId, arrayMove(visibleIds, oldIndex, newIndex));
  }

  return (
    <section aria-label={pluginOrganizationSectionLabel(sectionId, sectionName, language)}>
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">
          {pluginOrganizationSectionLabel(sectionId, sectionName, language)}
        </h2>
        <Badge variant="secondary" className="text-[10px]">
          {visibleIds.length}
        </Badge>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={visibleIds} strategy={rectSortingStrategy}>
          <div className="mt-3 grid gap-3" style={pluginCardGridStyle(cardSize)}>
            {visibleIds.map((pluginId) => (
              <SortablePluginCard
                key={pluginId}
                pluginId={pluginId}
                pluginName={pluginNameFor(pluginId)}
                favorite={isFavorite(pluginId)}
                disabled={disabled}
                language={language}
                onToggleFavorite={() => onToggleFavorite(pluginId)}
              >
                {renderCard(pluginId)}
              </SortablePluginCard>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </section>
  );
}

function SortablePluginCard({
  pluginId,
  pluginName,
  favorite,
  disabled,
  language,
  onToggleFavorite,
  children,
}: {
  pluginId: string;
  pluginName: string;
  favorite: boolean;
  disabled: boolean;
  language: AppLanguage;
  onToggleFavorite: () => void;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: pluginId,
    disabled,
  });
  const favoriteLabel = favorite
    ? pluginOrganizationText("unfavorite", language)
    : pluginOrganizationText("favorite", language);
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("relative", isDragging && "z-10 opacity-70")}
    >
      {children}
      <button
        type="button"
        aria-label={`${favoriteLabel}: ${pluginName}`}
        title={favoriteLabel}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          onToggleFavorite();
        }}
        className="absolute left-2 top-2 grid size-7 place-items-center rounded-md border border-border/60 bg-background/85 text-muted-foreground shadow-sm backdrop-blur transition hover:text-amber-500 disabled:cursor-default disabled:opacity-40"
      >
        <Star className={cn("size-3.5", favorite && "fill-amber-400 text-amber-400")} />
      </button>
      <span className="absolute bottom-2 right-2">
        <button
          type="button"
          aria-label={`${pluginOrganizationText("dragToReorder", language)}: ${pluginName}`}
          title={pluginOrganizationText("dragToReorder", language)}
          disabled={disabled}
          className="grid size-7 place-items-center rounded-md border border-border/60 bg-background/85 text-muted-foreground shadow-sm backdrop-blur transition hover:bg-muted hover:text-foreground disabled:cursor-default disabled:opacity-40"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-3.5" />
        </button>
      </span>
    </div>
  );
}
