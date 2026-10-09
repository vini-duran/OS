import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAppPreferences } from "@/lib/app-preferences";
import {
  pluginProfileNamedUrlsMessageForCode,
  pluginProfileNamedUrlsText,
} from "@/lib/plugin-profile-named-urls-localization";

export type PluginProfileNamedUrlEntry = {
  id: string;
  name: string;
  url: string;
  createdAt: string;
  updatedAt: string;
};

type NamedUrlsResponse = {
  entries?: PluginProfileNamedUrlEntry[];
  revision?: string;
  error?: string;
  code?: string;
};

export function PluginProfileNamedUrls({
  pluginId,
  profileId,
}: {
  pluginId: string;
  profileId: string;
}) {
  const { language } = useAppPreferences();
  const [entries, setEntries] = useState<PluginProfileNamedUrlEntry[]>([]);
  const [revision, setRevision] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftUrl, setDraftUrl] = useState("");
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [editName, setEditName] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [removingEntry, setRemovingEntry] = useState<PluginProfileNamedUrlEntry | null>(null);

  const endpoint = `/api/plugins/${encodeURIComponent(pluginId)}/profile-bindings/${encodeURIComponent(profileId)}/named-urls`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(endpoint);
      const result = (await response.json()) as NamedUrlsResponse;
      if (!response.ok) throw new Error(result.code ?? "INVALID_URL");
      setEntries(result.entries ?? []);
      setRevision(typeof result.revision === "string" ? result.revision : "");
      setNotice(null);
    } catch (error) {
      const code = error instanceof Error ? error.message : "INVALID_URL";
      setNotice(pluginProfileNamedUrlsMessageForCode(code, language));
    } finally {
      setLoading(false);
    }
  }, [endpoint, language]);

  useEffect(() => {
    void load();
  }, [load]);

  async function parseError(response: Response, fallback: string) {
    let code = fallback;
    try {
      const result = (await response.json()) as NamedUrlsResponse;
      if (typeof result.code === "string" && result.code) code = result.code;
    } catch {
      // Keep the fallback code; the list and drafts stay untouched.
    }
    return code;
  }

  async function handleCreate(event?: React.FormEvent) {
    event?.preventDefault();
    setSaving(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draftName, url: draftUrl, revision }),
      });
      if (response.status === 409 || response.status === 404 || response.status === 400) {
        const code = await parseError(response, "INVALID_URL");
        if (code === "STALE_REVISION" || code === "MISSING_REVISION") {
          await load();
          setNotice(pluginProfileNamedUrlsMessageForCode(code, language));
          return;
        }
        setNotice(pluginProfileNamedUrlsMessageForCode(code, language));
        return;
      }
      if (!response.ok) {
        const code = await parseError(response, "INVALID_URL");
        setNotice(pluginProfileNamedUrlsMessageForCode(code, language));
        return;
      }
      const result = (await response.json()) as NamedUrlsResponse;
      setEntries(result.entries ?? []);
      setRevision(typeof result.revision === "string" ? result.revision : "");
      setNotice(null);
      setDraftName("");
      setDraftUrl("");
      setAdding(false);
    } catch {
      setNotice(pluginProfileNamedUrlsText("saveFailed", language));
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(entry: PluginProfileNamedUrlEntry, event?: React.FormEvent) {
    event?.preventDefault();
    setSaving(true);
    try {
      const response = await fetch(`${endpoint}/${encodeURIComponent(entry.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, url: editUrl, revision }),
      });
      if (!response.ok) {
        const code = await parseError(response, "INVALID_URL");
        if (code === "STALE_REVISION" || code === "MISSING_REVISION") {
          await load();
        }
        setNotice(pluginProfileNamedUrlsMessageForCode(code, language));
        return;
      }
      const result = (await response.json()) as NamedUrlsResponse;
      setEntries(result.entries ?? []);
      setRevision(typeof result.revision === "string" ? result.revision : "");
      setNotice(null);
      setEditingId(undefined);
    } catch {
      setNotice(pluginProfileNamedUrlsText("saveFailed", language));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(entry: PluginProfileNamedUrlEntry) {
    setSaving(true);
    try {
      const response = await fetch(`${endpoint}/${encodeURIComponent(entry.id)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision }),
      });
      if (!response.ok) {
        const code = await parseError(response, "INVALID_URL");
        if (code === "STALE_REVISION" || code === "MISSING_REVISION") {
          await load();
        }
        setNotice(pluginProfileNamedUrlsMessageForCode(code, language));
        return;
      }
      const result = (await response.json()) as NamedUrlsResponse;
      setEntries(result.entries ?? []);
      setRevision(typeof result.revision === "string" ? result.revision : "");
      setNotice(null);
      if (editingId === entry.id) setEditingId(undefined);
      setRemovingEntry(null);
    } catch {
      setNotice(pluginProfileNamedUrlsText("removeFailed", language));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      aria-label={pluginProfileNamedUrlsText("profileProjects", language)}
      className="mt-2 rounded-md border border-border/70 bg-muted/20 p-2.5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-[11px] font-semibold">
          {pluginProfileNamedUrlsText("profileProjects", language)}
        </h4>
        <span className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-[11px]"
            disabled={loading}
            onClick={() => void load()}
          >
            <RefreshCw className={loading ? "size-3 animate-spin" : "size-3"} />
            {pluginProfileNamedUrlsText("refresh", language)}
          </Button>
          {!adding && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1 px-2 text-[11px]"
              onClick={() => {
                setAdding(true);
                setEditingId(undefined);
              }}
            >
              <Plus className="size-3" />
              {pluginProfileNamedUrlsText("addUrl", language)}
            </Button>
          )}
        </span>
      </div>

      {notice && (
        <p role="alert" className="mt-2 text-[11px] text-warning">
          {notice}
        </p>
      )}

      {loading ? (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <LoaderCircle className="size-3.5 animate-spin" />
          {pluginProfileNamedUrlsText("loading", language)}
        </p>
      ) : entries.length === 0 && !adding ? (
        <p className="mt-2 rounded border border-dashed border-border p-3 text-center text-[11px] text-muted-foreground">
          {pluginProfileNamedUrlsText("emptyState", language)}
        </p>
      ) : null}

      {adding && (
        <form
          className="mt-2 space-y-2 rounded border border-border bg-background/60 p-2.5"
          onSubmit={(event) => void handleCreate(event)}
        >
          <div className="space-y-1">
            <Label htmlFor={`named-url-name-${profileId}`} className="text-[11px]">
              {pluginProfileNamedUrlsText("projectName", language)}
            </Label>
            <Input
              id={`named-url-name-${profileId}`}
              value={draftName}
              maxLength={100}
              autoComplete="off"
              onChange={(event) => setDraftName(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`named-url-url-${profileId}`} className="text-[11px]">
              {pluginProfileNamedUrlsText("projectUrl", language)}
            </Label>
            <Input
              id={`named-url-url-${profileId}`}
              value={draftUrl}
              inputMode="url"
              autoComplete="off"
              placeholder="https://"
              className="min-w-0"
              onChange={(event) => setDraftUrl(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" className="h-7 text-[11px]" disabled={saving}>
              {saving && <LoaderCircle className="mr-1 size-3 animate-spin" />}
              {pluginProfileNamedUrlsText("save", language)}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-[11px]"
              disabled={saving}
              onClick={() => setAdding(false)}
            >
              {pluginProfileNamedUrlsText("cancel", language)}
            </Button>
          </div>
        </form>
      )}

      {!loading && entries.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {entries.map((entry) => {
            const editing = editingId === entry.id;
            return (
              <li
                key={entry.id}
                className="min-w-0 rounded border border-border/70 bg-background/60 p-2"
              >
                {editing ? (
                  <form className="space-y-2" onSubmit={(event) => void handleUpdate(entry, event)}>
                    <div className="space-y-1">
                      <Label htmlFor={`named-url-edit-name-${entry.id}`} className="text-[11px]">
                        {pluginProfileNamedUrlsText("projectName", language)}
                      </Label>
                      <Input
                        id={`named-url-edit-name-${entry.id}`}
                        value={editName}
                        maxLength={100}
                        autoComplete="off"
                        onChange={(event) => setEditName(event.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`named-url-edit-url-${entry.id}`} className="text-[11px]">
                        {pluginProfileNamedUrlsText("projectUrl", language)}
                      </Label>
                      <Input
                        id={`named-url-edit-url-${entry.id}`}
                        value={editUrl}
                        inputMode="url"
                        autoComplete="off"
                        className="min-w-0"
                        onChange={(event) => setEditUrl(event.target.value)}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" size="sm" className="h-7 text-[11px]" disabled={saving}>
                        {saving && <LoaderCircle className="mr-1 size-3 animate-spin" />}
                        {pluginProfileNamedUrlsText("save", language)}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[11px]"
                        disabled={saving}
                        onClick={() => setEditingId(undefined)}
                      >
                        {pluginProfileNamedUrlsText("cancel", language)}
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="flex min-w-0 items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-medium" data-i18n-ignore>
                        {entry.name}
                      </p>
                      <p className="truncate text-[10px] text-muted-foreground" data-i18n-ignore>
                        {entry.url}
                      </p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        aria-label={`${pluginProfileNamedUrlsText("editUrl", language)} ${entry.name}`}
                        onClick={() => {
                          setAdding(false);
                          setEditingId(entry.id);
                          setEditName(entry.name);
                          setEditUrl(entry.url);
                        }}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-7 text-destructive"
                        aria-label={`${pluginProfileNamedUrlsText("removeUrl", language)} ${entry.name}`}
                        disabled={saving}
                        onClick={() => {
                          setNotice(null);
                          setRemovingEntry(entry);
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Dialog
        open={Boolean(removingEntry)}
        onOpenChange={(open) => {
          if (!open && !saving) setRemovingEntry(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{pluginProfileNamedUrlsText("removeUrl", language)}</DialogTitle>
            <DialogDescription>
              {pluginProfileNamedUrlsText("confirmRemove", language)}
            </DialogDescription>
          </DialogHeader>
          <p className="break-words text-sm">{removingEntry?.name}</p>
          {notice && (
            <p role="alert" className="text-sm text-warning">
              {notice}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={saving}
              onClick={() => setRemovingEntry(null)}
            >
              {pluginProfileNamedUrlsText("cancel", language)}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={saving}
              onClick={() => {
                if (removingEntry) void handleRemove(removingEntry);
              }}
            >
              {saving && <LoaderCircle className="mr-1 size-3 animate-spin" />}
              {pluginProfileNamedUrlsText("removeUrl", language)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
