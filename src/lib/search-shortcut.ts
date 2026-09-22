import { useEffect, useRef, type RefObject } from "react";

export const FOCUS_SEARCH_EVENT = "contentflow:focus-search" as const;

export interface FocusSearchEventDetail {
  source?: string;
  timestamp?: number;
}

export type FocusSearchCustomEvent = CustomEvent<FocusSearchEventDetail>;

declare global {
  interface WindowEventMap {
    [FOCUS_SEARCH_EVENT]: FocusSearchCustomEvent;
  }
}

/**
 * Checks if a KeyboardEvent matches the global search shortcut:
 * Meta+F (macOS Command+F) or Ctrl+F (Windows/Linux Control+F).
 */
export function isKeyboardShortcutForSearch(event: KeyboardEvent): boolean {
  if (event.defaultPrevented) return false;
  if (!event.metaKey && !event.ctrlKey) return false;
  if (event.altKey || event.shiftKey) return false;

  const key = event.key ? event.key.toLowerCase() : "";
  if (key === "f") return true;
  if (!key || key === "unidentified") {
    return event.code === "KeyF";
  }
  return false;
}

/**
 * Checks whether an element is an editable field:
 * input, textarea, select, or contenteditable.
 */
export function isEditableElement(element: unknown): boolean {
  if (!element || typeof element !== "object") return false;
  if (!("tagName" in element)) return false;

  const el = element as Element;
  const tagName = typeof el.tagName === "string" ? el.tagName.toUpperCase() : "";
  if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
    return true;
  }

  if ("isContentEditable" in el && Boolean((el as HTMLElement).isContentEditable)) {
    return true;
  }

  if (typeof el.getAttribute === "function") {
    const contentEditable = el.getAttribute("contenteditable");
    if (contentEditable === "true" || contentEditable === "") {
      return true;
    }
  }

  if (typeof el.closest === "function") {
    if (el.closest('[contenteditable="true"], [contenteditable=""]')) {
      return true;
    }
  }

  return false;
}

/**
 * Decides whether the search shortcut should be intercepted.
 * Never intercepts if the active element or event target is an editable element.
 */
export function shouldInterceptSearchShortcut(
  event: KeyboardEvent,
  activeDoc?: Document | null,
): boolean {
  if (!isKeyboardShortcutForSearch(event)) {
    return false;
  }

  const doc = activeDoc ?? (typeof document !== "undefined" ? document : null);
  if (doc?.activeElement && isEditableElement(doc.activeElement)) {
    return false;
  }

  if (event.target && isEditableElement(event.target)) {
    return false;
  }

  return true;
}

/**
 * Dispatches the centralized typed DOM event to request workplace search focus.
 */
export function dispatchFocusSearch(
  target: EventTarget | null = typeof window !== "undefined" ? window : null,
  detail: FocusSearchEventDetail = { source: "keyboard-shortcut" },
): boolean {
  if (!target || typeof target.dispatchEvent !== "function") return false;

  const fullDetail: FocusSearchEventDetail = {
    timestamp: Date.now(),
    ...detail,
  };

  let event: CustomEvent<FocusSearchEventDetail>;
  if (typeof CustomEvent === "function") {
    event = new CustomEvent(FOCUS_SEARCH_EVENT, {
      bubbles: true,
      cancelable: true,
      detail: fullDetail,
    });
  } else {
    event = {
      type: FOCUS_SEARCH_EVENT,
      bubbles: true,
      cancelable: true,
      detail: fullDetail,
    } as unknown as CustomEvent<FocusSearchEventDetail>;
  }

  return target.dispatchEvent(event);
}

/**
 * Global keydown handler for Meta+F and Ctrl+F.
 * Intercepts search shortcut and triggers focus search DOM event.
 */
export function handleSearchShortcutKeyDown(
  event: KeyboardEvent,
  activeDoc?: Document | null,
  dispatchTarget?: EventTarget | null,
): boolean {
  if (!shouldInterceptSearchShortcut(event, activeDoc)) {
    return false;
  }

  event.preventDefault();
  const target = dispatchTarget ?? (typeof window !== "undefined" ? window : null);
  dispatchFocusSearch(target, { source: "global-shortcut" });
  return true;
}

/**
 * Global hook to be mounted in the AppShell/layout.
 * Intercepts Meta+F and Ctrl+F globally and fires the typed focus-search event.
 */
export function useGlobalSearchShortcut(): void {
  useEffect(() => {
    if (typeof window === "undefined") return;

    function onKeyDown(event: KeyboardEvent) {
      handleSearchShortcutKeyDown(event);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);
}

/**
 * Hook for workplaces and views to consume the focus-search DOM event.
 * Focuses (and optionally selects) the target search input, or executes a callback.
 */
export function useFocusSearchShortcut(
  target: RefObject<HTMLInputElement | null> | (() => void),
  options?: { selectOnFocus?: boolean },
): void {
  const targetRef = useRef(target);
  targetRef.current = target;

  useEffect(() => {
    if (typeof window === "undefined") return;

    function handleFocusSearch() {
      const current = targetRef.current;
      if (typeof current === "function") {
        current();
      } else if (current?.current) {
        current.current.focus();
        if (options?.selectOnFocus !== false) {
          current.current.select?.();
        }
      }
    }

    window.addEventListener(FOCUS_SEARCH_EVENT, handleFocusSearch as EventListener);
    return () => {
      window.removeEventListener(FOCUS_SEARCH_EVENT, handleFocusSearch as EventListener);
    };
  }, [options?.selectOnFocus]);
}
