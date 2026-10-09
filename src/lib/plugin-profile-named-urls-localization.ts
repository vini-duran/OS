import type { AppLanguage } from "./app-preferences";

export const pluginProfileNamedUrlsMessages = {
  profileProjects: [
    "Projetos deste perfil",
    "Projects on this profile",
    "Proyectos de este perfil",
  ],
  addUrl: ["Adicionar URL", "Add URL", "Añadir URL"],
  projectName: ["Nome do projeto", "Project name", "Nombre del proyecto"],
  projectUrl: ["URL do projeto", "Project URL", "URL del proyecto"],
  save: ["Salvar", "Save", "Guardar"],
  cancel: ["Cancelar", "Cancel", "Cancelar"],
  editUrl: ["Editar URL", "Edit URL", "Editar URL"],
  removeUrl: ["Remover URL", "Remove URL", "Eliminar URL"],
  emptyState: [
    "Nenhuma URL cadastrada neste perfil.",
    "No URLs saved on this profile.",
    "No hay URLs guardadas en este perfil.",
  ],
  loading: ["Carregando projetos…", "Loading projects…", "Cargando proyectos…"],
  refresh: ["Atualizar", "Refresh", "Actualizar"],
  loadFailed: [
    "Não foi possível carregar os projetos",
    "Could not load the projects",
    "No se pudieron cargar los proyectos",
  ],
  saveFailed: [
    "Não foi possível salvar a URL",
    "Could not save the URL",
    "No se pudo guardar la URL",
  ],
  removeFailed: [
    "Não foi possível remover a URL",
    "Could not remove the URL",
    "No se pudo eliminar la URL",
  ],
  confirmRemove: [
    "Remover esta URL deste perfil?",
    "Remove this URL from this profile?",
    "¿Eliminar esta URL de este perfil?",
  ],
  staleRevision: [
    "A lista mudou em outra aba. Ela foi recarregada.",
    "The list changed in another tab. It was reloaded.",
    "La lista cambió en otra pestaña. Se recargó.",
  ],
  duplicateUrl: [
    "Esta URL já está cadastrada neste perfil.",
    "This URL is already saved on this profile.",
    "Esta URL ya está guardada en este perfil.",
  ],
  invalidName: [
    "Informe um nome com até 100 caracteres.",
    "Enter a name with up to 100 characters.",
    "Introduce un nombre de hasta 100 caracteres.",
  ],
  invalidUrl: [
    "Informe uma URL HTTPS válida permitida por este plugin.",
    "Enter a valid HTTPS URL allowed by this plugin.",
    "Introduce una URL HTTPS válida permitida por este plugin.",
  ],
  notEnabled: [
    "Este plugin não oferece projetos neste perfil.",
    "This plugin does not offer projects on this profile.",
    "Este plugin no ofrece proyectos en este perfil.",
  ],
  notBound: [
    "Vínculo de perfil não encontrado.",
    "Profile binding not found.",
    "Vínculo de perfil no encontrado.",
  ],
  notFound: ["URL não encontrada.", "URL not found.", "URL no encontrada."],
  operationFailed: [
    "Não foi possível concluir a operação. Tente novamente.",
    "Could not complete the operation. Try again.",
    "No se pudo completar la operación. Inténtalo de nuevo.",
  ],
} as const;

export type PluginProfileNamedUrlsMessageKey = keyof typeof pluginProfileNamedUrlsMessages;

export function pluginProfileNamedUrlsText(
  key: PluginProfileNamedUrlsMessageKey,
  language: AppLanguage,
) {
  return pluginProfileNamedUrlsMessages[key][language === "en" ? 1 : language === "es" ? 2 : 0];
}

export type PluginProfileNamedUrlApiCode =
  | "NOT_ENABLED"
  | "NOT_BOUND"
  | "NOT_FOUND"
  | "FOREIGN_ENTRY"
  | "STALE_REVISION"
  | "MISSING_REVISION"
  | "INVALID_NAME"
  | "INVALID_URL"
  | "URL_NOT_HTTPS"
  | "URL_HAS_CREDENTIALS"
  | "URL_TOO_LONG"
  | "HOST_NOT_ALLOWED"
  | "PATH_NOT_ALLOWED"
  | "DUPLICATE_URL"
  | "EMPTY_UPDATE";

export function pluginProfileNamedUrlsMessageForCode(
  code: PluginProfileNamedUrlApiCode | string | undefined,
  language: AppLanguage,
): string {
  switch (code) {
    case "STALE_REVISION":
    case "MISSING_REVISION":
      return pluginProfileNamedUrlsText("staleRevision", language);
    case "DUPLICATE_URL":
      return pluginProfileNamedUrlsText("duplicateUrl", language);
    case "INVALID_NAME":
    case "EMPTY_UPDATE":
      return pluginProfileNamedUrlsText("invalidName", language);
    case "NOT_ENABLED":
      return pluginProfileNamedUrlsText("notEnabled", language);
    case "NOT_BOUND":
      return pluginProfileNamedUrlsText("notBound", language);
    case "NOT_FOUND":
    case "FOREIGN_ENTRY":
      return pluginProfileNamedUrlsText("notFound", language);
    case "INVALID_URL":
    case "URL_NOT_HTTPS":
    case "URL_HAS_CREDENTIALS":
    case "URL_TOO_LONG":
    case "HOST_NOT_ALLOWED":
    case "PATH_NOT_ALLOWED":
      return pluginProfileNamedUrlsText("invalidUrl", language);
    default:
      return pluginProfileNamedUrlsText("operationFailed", language);
  }
}
