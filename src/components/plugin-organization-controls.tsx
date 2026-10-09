import { useState } from "react";
import { Pencil, Plus, SlidersHorizontal, Star, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AppLanguage } from "@/lib/app-preferences";
import {
  PLUGIN_ORGANIZATION_BUILT_IN_SECTION_IDS,
  PLUGIN_ORGANIZATION_NONE_SECTION_ID,
  organizationItemFor,
  resolveSectionListing,
  type PluginOrganization,
} from "@/lib/plugin-organization";
import {
  pluginOrganizationSectionLabel,
  pluginOrganizationText,
} from "@/lib/plugin-organization-localization";

export type OrganizationInventoryEntry = {
  id: string;
  name: string;
};

export function OrganizeLibraryButton({
  language,
  disabled,
  onClick,
}: {
  language: AppLanguage;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button size="sm" variant="outline" className="gap-1.5" disabled={disabled} onClick={onClick}>
      <SlidersHorizontal className="size-4" />
      {pluginOrganizationText("organizeLibrary", language)}
    </Button>
  );
}

export function PluginOrganizationFilters({
  organization,
  sectionId,
  favoritesOnly,
  language,
  disabled,
  onSectionChange,
  onFavoritesChange,
}: {
  organization: PluginOrganization;
  sectionId: string | "all";
  favoritesOnly: boolean;
  language: AppLanguage;
  disabled: boolean;
  onSectionChange: (sectionId: string | "all") => void;
  onFavoritesChange: (favoritesOnly: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={sectionId}
        disabled={disabled}
        onValueChange={(value) => onSectionChange(value as string | "all")}
      >
        <SelectTrigger className="w-44" aria-label={pluginOrganizationText("section", language)}>
          <SelectValue placeholder={pluginOrganizationText("allSections", language)} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{pluginOrganizationText("allSections", language)}</SelectItem>
          {organization.sections.map((section) => (
            <SelectItem key={section.id} value={section.id}>
              {pluginOrganizationSectionLabel(section.id, section.name, language)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        size="sm"
        variant={favoritesOnly ? "default" : "outline"}
        className="gap-1.5"
        aria-pressed={favoritesOnly}
        disabled={disabled}
        onClick={() => onFavoritesChange(!favoritesOnly)}
      >
        <Star className={favoritesOnly ? "size-3.5 fill-current" : "size-3.5"} />
        {pluginOrganizationText("favoritesOnly", language)}
      </Button>
    </div>
  );
}

type PluginOrganizationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organization: PluginOrganization;
  inventory: OrganizationInventoryEntry[];
  language: AppLanguage;
  disabled: boolean;
  mutationError: string | null;
  onCreateSection: (name: string) => void;
  onRenameSection: (sectionId: string, name: string) => void;
  onRemoveSection: (sectionId: string) => void;
  onMovePlugin: (pluginId: string, sectionId: string) => void;
};

export function PluginOrganizationDialog({
  open,
  onOpenChange,
  organization,
  inventory,
  language,
  disabled,
  mutationError,
  onCreateSection,
  onRenameSection,
  onRemoveSection,
  onMovePlugin,
}: PluginOrganizationDialogProps) {
  const [newSectionName, setNewSectionName] = useState("");
  const [renameDrafts, setRenameDrafts] = useState<Record<string, string>>({});
  const [renamingId, setRenamingId] = useState<string>();
  const inventoryIds = inventory.map((entry) => entry.id);
  const listing = resolveSectionListing(organization, inventoryIds);
  const names = new Map(inventory.map((entry) => [entry.id, entry.name]));

  function submitCreate() {
    onCreateSection(newSectionName);
    setNewSectionName("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{pluginOrganizationText("organizeLibrary", language)}</DialogTitle>
          <DialogDescription>
            {pluginOrganizationText("organizeLibraryDescription", language)}
          </DialogDescription>
        </DialogHeader>

        {mutationError && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive"
          >
            {mutationError}
          </p>
        )}

        <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-3">
          <Label htmlFor="new-organization-section">
            {pluginOrganizationText("createSection", language)}
          </Label>
          <div className="flex gap-2">
            <Input
              id="new-organization-section"
              value={newSectionName}
              disabled={disabled}
              placeholder={pluginOrganizationText("sectionNamePlaceholder", language)}
              onChange={(event) => setNewSectionName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && newSectionName.trim()) submitCreate();
              }}
            />
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              disabled={disabled || !newSectionName.trim()}
              onClick={submitCreate}
            >
              <Plus className="size-3.5" />
              {pluginOrganizationText("createSection", language)}
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          {organization.sections.map((section) => {
            const pluginIds = listing[section.id] ?? [];
            const removable =
              section.id !== PLUGIN_ORGANIZATION_NONE_SECTION_ID &&
              !(PLUGIN_ORGANIZATION_BUILT_IN_SECTION_IDS as readonly string[]).includes(section.id);
            const renamable = section.id !== PLUGIN_ORGANIZATION_NONE_SECTION_ID;
            const renaming = renamingId === section.id;
            return (
              <section
                key={section.id}
                className="rounded-xl border border-border bg-card/40 p-3"
                aria-label={pluginOrganizationSectionLabel(section.id, section.name, language)}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-xs font-semibold">
                    {pluginOrganizationSectionLabel(section.id, section.name, language)}
                  </h3>
                  <Badge variant="secondary" className="text-[9px]">
                    {pluginIds.length}
                  </Badge>
                  {renamable && !renaming && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="ml-auto gap-1.5"
                      disabled={disabled}
                      onClick={() => {
                        setRenamingId(section.id);
                        setRenameDrafts((current) => ({
                          ...current,
                          [section.id]:
                            current[section.id] ??
                            pluginOrganizationSectionLabel(section.id, section.name, language),
                        }));
                      }}
                    >
                      <Pencil className="size-3.5" />
                      {pluginOrganizationText("renameSection", language)}
                    </Button>
                  )}
                  {removable && !renaming && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className={`gap-1.5 text-destructive ${renamable ? "" : "ml-auto"}`}
                      disabled={disabled}
                      onClick={() => {
                        const label = pluginOrganizationSectionLabel(
                          section.id,
                          section.name,
                          language,
                        );
                        if (
                          window.confirm(
                            `${pluginOrganizationText("removeSection", language)} "${label}"? ${pluginOrganizationText("sectionRemovedKeepsPlugins", language)}`,
                          )
                        ) {
                          onRemoveSection(section.id);
                        }
                      }}
                    >
                      <Trash2 className="size-3.5" />
                      {pluginOrganizationText("removeSection", language)}
                    </Button>
                  )}
                </div>

                {renaming && (
                  <div className="mt-2 flex gap-2">
                    <Input
                      value={renameDrafts[section.id] ?? ""}
                      disabled={disabled}
                      aria-label={pluginOrganizationText("sectionName", language)}
                      onChange={(event) =>
                        setRenameDrafts((current) => ({
                          ...current,
                          [section.id]: event.target.value,
                        }))
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          onRenameSection(section.id, renameDrafts[section.id] ?? "");
                          setRenamingId(undefined);
                        }
                        if (event.key === "Escape") setRenamingId(undefined);
                      }}
                    />
                    <Button
                      type="button"
                      size="sm"
                      disabled={disabled}
                      onClick={() => {
                        onRenameSection(section.id, renameDrafts[section.id] ?? "");
                        setRenamingId(undefined);
                      }}
                    >
                      {pluginOrganizationText("save", language)}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setRenamingId(undefined)}
                    >
                      {pluginOrganizationText("close", language)}
                    </Button>
                  </div>
                )}

                {pluginIds.length ? (
                  <ul className="mt-2 space-y-1.5">
                    {pluginIds.map((pluginId) => {
                      const item = organizationItemFor(organization, pluginId);
                      return (
                        <li
                          key={pluginId}
                          className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/50 px-2.5 py-1.5"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium" data-i18n-ignore>
                              {names.get(pluginId) ?? pluginId}
                            </p>
                            {item.hidden && (
                              <p className="mt-0.5 text-[10px] text-muted-foreground">
                                {pluginOrganizationText("hiddenInOrganization", language)}
                              </p>
                            )}
                          </div>
                          <Select
                            value={item.section}
                            disabled={disabled}
                            onValueChange={(value) => onMovePlugin(pluginId, value)}
                          >
                            <SelectTrigger
                              className="h-7 w-40 text-[11px]"
                              aria-label={`${pluginOrganizationText("moveToSection", language)}: ${names.get(pluginId) ?? pluginId}`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {organization.sections.map((target) => (
                                <SelectItem key={target.id} value={target.id}>
                                  {pluginOrganizationSectionLabel(target.id, target.name, language)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {pluginOrganizationText("noSectionPlugins", language)}
                  </p>
                )}
              </section>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
