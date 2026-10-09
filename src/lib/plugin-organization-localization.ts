import type { AppLanguage } from "./app-preferences";

export const pluginOrganizationMessages = {
  organizeLibrary: ["Organizar biblioteca", "Organize library", "Organizar biblioteca"],
  organizeLibraryDescription: [
    "Crie seções, mova plugins entre elas e marque favoritos. Nada aqui instala, ativa ou remove plugins.",
    "Create sections, move plugins between them and mark favorites. Nothing here installs, enables or removes plugins.",
    "Crea secciones, mueve plugins entre ellas y marca favoritos. Nada aquí instala, activa ni elimina plugins.",
  ],
  createSection: ["Criar seção", "Create section", "Crear sección"],
  sectionName: ["Nome da seção", "Section name", "Nombre de la sección"],
  sectionNamePlaceholder: ["Ex.: Narração", "E.g.: Narration", "Ej.: Narración"],
  renameSection: ["Renomear", "Rename", "Renombrar"],
  removeSection: ["Remover", "Remove", "Eliminar"],
  sectionRemovedKeepsPlugins: [
    "Os plugins da seção voltam para Sem seção. Nenhum plugin será desinstalado.",
    "Plugins in the section return to No section. No plugin will be uninstalled.",
    "Los plugins de la sección vuelven a Sin sección. No se desinstalará ningún plugin.",
  ],
  moveToSection: ["Mover para a seção", "Move to section", "Mover a la sección"],
  section: ["Seção", "Section", "Sección"],
  allSections: ["Todas as seções", "All sections", "Todas las secciones"],
  favoritesOnly: ["Somente favoritos", "Favorites only", "Solo favoritos"],
  favorite: ["Favoritar", "Favorite", "Marcar como favorito"],
  unfavorite: ["Remover dos favoritos", "Remove from favorites", "Quitar de favoritos"],
  dragToReorder: ["Arraste para reorganizar", "Drag to reorder", "Arrastra para reordenar"],
  saveConflict: [
    "A biblioteca mudou em outra aba. A organização foi recarregada.",
    "The library changed in another tab. The organization was reloaded.",
    "La biblioteca cambió en otra pestaña. La organización se recargó.",
  ],
  saveFailed: [
    "Não foi possível salvar a organização",
    "Could not save the organization",
    "No se pudo guardar la organización",
  ],
  loadFailed: [
    "Não foi possível carregar a organização",
    "Could not load the organization",
    "No se pudo cargar la organización",
  ],
  retry: ["Tentar novamente", "Try again", "Intentar de nuevo"],
  close: ["Fechar", "Close", "Cerrar"],
  save: ["Salvar", "Save", "Guardar"],
  saving: ["Salvando…", "Saving…", "Guardando…"],
  invalidSectionName: [
    "Escolha um nome com até 80 caracteres.",
    "Choose a name with up to 80 characters.",
    "Elige un nombre de hasta 80 caracteres.",
  ],
  hiddenInOrganization: [
    "Oculto na galeria — visível aqui para recuperação",
    "Hidden from the gallery — visible here for recovery",
    "Oculto en la galería — visible aquí para recuperarlo",
  ],
  noSectionPlugins: [
    "Nenhum plugin nesta seção.",
    "No plugins in this section.",
    "No hay plugins en esta sección.",
  ],
  cardSize: ["Tamanho dos cards", "Card size", "Tamaño de las tarjetas"],
  cardSizeSmall: ["Pequeno", "Small", "Pequeño"],
  cardSizeMedium: ["Médio", "Medium", "Mediano"],
  cardSizeLarge: ["Grande", "Large", "Grande"],
  favoritesSectionOption: ["Favoritos", "Favorites", "Favoritos"],
  dragReorderHelp: [
    "Arraste o ícone no canto inferior direito de um card para reorganizar a seção atual.",
    "Drag the icon in the bottom-right corner of a card to reorder the current section.",
    "Arrastra el icono de la esquina inferior derecha de una tarjeta para reordenar la sección actual.",
  ],
  externalComponentsTitle: ["Componentes externos", "External components", "Componentes externos"],
  externalComponentsDescription: [
    "Consulte os componentes e suas instruções. Instale somente os plugins que você precisa pela opção Instalar plugin.",
    "Browse the components and their instructions. Install only the plugins you need via the Install plugin option.",
    "Consulta los componentes y sus instrucciones. Instala solo los plugins que necesites con la opción Instalar plugin.",
  ],
  consultPluginsDescription: [
    "Mesmo fluxo para qualquer autor",
    "Same flow for any author",
    "Mismo flujo para cualquier autor",
  ],
  browserBridgeDescription: [
    "Somente para automação web",
    "For web automation only",
    "Solo para automatización web",
  ],
  pluginSkillDescription: [
    "Para criar com um agente de IA",
    "Create with an AI agent",
    "Para crear con un agente de IA",
  ],
  consultPlugins: ["Consultar plugins", "Browse plugins", "Consultar plugins"],
  configureBrowserBridge: [
    "Configurar Browser Bridge",
    "Set up Browser Bridge",
    "Configurar Browser Bridge",
  ],
  consultPluginSkill: [
    "Consultar skill de plugins",
    "Browse plugin skill",
    "Consultar skill de plugins",
  ],
} as const;

export type PluginOrganizationMessageKey = keyof typeof pluginOrganizationMessages;

export function pluginOrganizationText(key: PluginOrganizationMessageKey, language: AppLanguage) {
  return pluginOrganizationMessages[key][language === "en" ? 1 : language === "es" ? 2 : 0];
}

const defaultSectionLabels: Record<string, [english: string, spanish: string]> = {
  generation: ["Generation", "Generación"],
  editing: ["Editing", "Edición"],
  publishing: ["Publishing", "Publicación"],
  utilities: ["Utilities", "Utilidades"],
  none: ["No section", "Sin sección"],
};

const defaultSectionPortuguese: Record<string, string> = {
  generation: "Geração",
  editing: "Edição",
  publishing: "Publicação",
  utilities: "Utilidades",
  none: "Sem seção",
};

/**
 * Rótulos das seções padrão traduzidos. Nomes editados pelo usuário são
 * devolvidos sem tradução.
 */
export function pluginOrganizationSectionLabel(
  sectionId: string,
  customName: string | undefined,
  language: AppLanguage,
): string {
  if (customName && customName.trim()) return customName;
  if (language === "en") return defaultSectionLabels[sectionId]?.[0] ?? sectionId;
  if (language === "es") return defaultSectionLabels[sectionId]?.[1] ?? sectionId;
  return defaultSectionPortuguese[sectionId] ?? sectionId;
}
