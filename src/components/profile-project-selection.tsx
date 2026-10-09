import { useCallback, useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppPreferences } from "@/lib/app-preferences";
import type { PluginProfileSetup } from "@/lib/plugin-contract";
import { managedProjectUrlConfigurationKey } from "@/lib/profile-project-selection";

export type ProfileProjectCatalogEntry = {
  id: string;
  name: string;
  url: string;
};

export function ProfileProjectSelection({
  pluginId,
  profileSetup,
  profiles,
  projectSelections,
  onProjectSelectionsChange,
}: {
  pluginId: string;
  profileSetup: PluginProfileSetup;
  profiles: Array<{ id: string; name: string }>;
  projectSelections?: Record<string, string>;
  onProjectSelectionsChange: (projectSelections: Record<string, string> | undefined) => void;
}) {
  const { t } = useAppPreferences();
  const projectKey = managedProjectUrlConfigurationKey(profileSetup);
  const [catalogs, setCatalogs] = useState<Record<string, ProfileProjectCatalogEntry[]>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, boolean>>({});

  const loadCatalog = useCallback(
    async (profileId: string) => {
      setLoading((current) => ({ ...current, [profileId]: true }));
      setErrors((current) => ({ ...current, [profileId]: false }));
      try {
        const response = await fetch(
          `/api/plugins/${encodeURIComponent(pluginId)}/profile-bindings/${encodeURIComponent(profileId)}/named-urls`,
        );
        const result = (await response.json()) as {
          entries?: ProfileProjectCatalogEntry[];
        };
        if (!response.ok) throw new Error("load failed");
        setCatalogs((current) => ({ ...current, [profileId]: result.entries ?? [] }));
      } catch {
        setErrors((current) => ({ ...current, [profileId]: true }));
      } finally {
        setLoading((current) => ({ ...current, [profileId]: false }));
      }
    },
    [pluginId],
  );

  useEffect(() => {
    for (const profile of profiles) {
      if (catalogs[profile.id] === undefined && !loading[profile.id]) void loadCatalog(profile.id);
    }
  }, [profiles, catalogs, loading, loadCatalog]);

  if (!projectKey) return null;

  function selectProject(profileId: string, entryId: string) {
    const next = { ...(projectSelections ?? {}) };
    if (!entryId) delete next[profileId];
    else next[profileId] = entryId;
    // Drop selections for profiles no longer selected; never inherit or default.
    for (const key of Object.keys(next)) {
      if (!profiles.some((profile) => profile.id === key)) delete next[key];
    }
    onProjectSelectionsChange(Object.keys(next).length ? next : undefined);
  }

  return (
    <div className="space-y-2" data-testid="profile-project-selection">
      <div>
        <p className="text-[11px] font-medium">{t("Projeto nomeado por perfil")}</p>
        <p className="text-[10px] text-muted-foreground">
          {t("Escolha um projeto pelo nome para cada perfil selecionado.")}
        </p>
      </div>
      {profiles.map((profile) => {
        const entries = catalogs[profile.id] ?? [];
        const selected = projectSelections?.[profile.id] ?? "";
        const missing =
          Boolean(selected) && !loading[profile.id] && !errors[profile.id]
            ? !entries.some((entry) => entry.id === selected)
            : false;
        return (
          <div key={profile.id} className="space-y-1 rounded-md border border-border/70 p-2.5">
            <Label htmlFor={`project-${profile.id}`}>
              {t("Projeto")} · {profile.name}
            </Label>
            <Select value={selected} onValueChange={(value) => selectProject(profile.id, value)}>
              <SelectTrigger id={`project-${profile.id}`}>
                <SelectValue
                  placeholder={
                    loading[profile.id] ? t("Carregando projetos…") : t("Selecione o projeto")
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {entries.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {entry.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors[profile.id] && (
              <p className="text-[10px] text-destructive">
                {t("Não foi possível carregar os projetos deste perfil.")}{" "}
                <button
                  type="button"
                  className="underline"
                  onClick={() => void loadCatalog(profile.id)}
                >
                  {t("Tentar novamente")}
                </button>
              </p>
            )}
            {!loading[profile.id] && !errors[profile.id] && entries.length === 0 && (
              <p className="text-[10px] text-muted-foreground">
                {t("Nenhum projeto cadastrado neste perfil.")}{" "}
                {t("Cadastre URLs em Plugins, na seção Projetos deste perfil.")}{" "}
                <a className="underline" href="/plugins">
                  {t("Gerenciar projetos do perfil")}
                </a>
              </p>
            )}
            {missing && (
              <p className="text-[10px] text-destructive">
                {t("O projeto selecionado foi removido. Escolha outro projeto.")}{" "}
                <a className="underline" href="/plugins">
                  {t("Gerenciar projetos do perfil")}
                </a>
              </p>
            )}
            {!selected && !missing && entries.length > 0 && (
              <p className="text-[10px] text-muted-foreground">
                {t("Nenhum projeto selecionado para este perfil.")}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
