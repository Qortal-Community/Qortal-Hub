import type { MouseEvent as ReactMouseEvent } from 'react';

type SupportedEvent = ReactMouseEvent<HTMLElement> | MouseEvent;

type CustomAction = {
  id: string;
  label: string;
  onSelect: () => void;
  enabled?: boolean;
};

type PendingMenu = {
  actions: Record<string, () => void>;
  cleanupTimeout?: number;
};

type NativeContextMenuEvent = {
  requestId: string;
  actionId: string;
};

type NativeContextDetails = {
  hasSelection?: boolean;
  selectionText?: string;
  isEditable?: boolean;
  linkURL?: string;
};

const EDITABLE_SELECTOR =
  'input, textarea, [contenteditable="true"], [contenteditable=""]';
export const NATIVE_CONTEXT_MENU_ATTR = 'data-no-electron-context-menu';

const pendingMenus = new Map<string, PendingMenu>();
let actionListenerCleanup: (() => void) | null = null;
let defaultListenerRegistered = false;

const canUseNativeMenu = () =>
  typeof window !== 'undefined' && !!window.nativeContextMenu?.showMenu;

const isEditableElement = (element?: HTMLElement | null) => {
  if (!element) return false;
  if (element.isContentEditable) return true;
  return element.matches?.(EDITABLE_SELECTOR) ?? false;
};

const findLinkTarget = (element?: HTMLElement | null) => {
  if (!element?.closest) return undefined;
  const anchor = element.closest('a[href]') as HTMLAnchorElement | null;
  if (anchor?.href) {
    return anchor.href;
  }
  const qortalNode = element.closest('[data-url]') as HTMLElement | null;
  if (!qortalNode) return undefined;
  const raw = qortalNode.getAttribute('data-url') || '';
  const lower = raw.trim().toLowerCase();
  if (lower.startsWith('qortal://') || lower.startsWith('qortal:')) {
    return raw;
  }
  return undefined;
};

const hasSelectedText = (target?: HTMLElement | null) => {
  if (typeof window === 'undefined') return false;
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return false;
  const text = selection.toString();
  if (!text || !text.trim().length) return false;
  if (!target) return true;
  try {
    return selection.containsNode(target, true);
  } catch {
    return false;
  }
};

const hasNativeOptOut = (element?: HTMLElement | null) =>
  !!element?.closest?.(`[${NATIVE_CONTEXT_MENU_ATTR}]`);

const buildContextDetails = (event: SupportedEvent): NativeContextDetails => {
  if (typeof window === 'undefined') return {};
  const target = (event.target ||
    (event as any).srcElement) as HTMLElement | null;
  const selection = window.getSelection();
  const selectionText = selection?.toString() ?? '';
  const selectionIncludesTarget = hasSelectedText(target);
  return {
    hasSelection: selectionIncludesTarget,
    selectionText: selectionIncludesTarget ? selectionText : undefined,
    isEditable: isEditableElement(target),
    linkURL: findLinkTarget(target),
  };
};

const registerActionListener = () => {
  if (actionListenerCleanup || !canUseNativeMenu()) return;
  const api = window.nativeContextMenu;
  if (!api?.onAction) return;
  actionListenerCleanup = api.onAction((event: NativeContextMenuEvent) => {
    if (!event) return;
    const pending = pendingMenus.get(event.requestId);
    if (!pending) return;
    if (pending.cleanupTimeout) {
      window.clearTimeout(pending.cleanupTimeout);
    }
    pendingMenus.delete(event.requestId);
    pending.actions[event.actionId]?.();
  });
};

const shouldShowMenu = (
  context: NativeContextDetails,
  actions: CustomAction[]
) => {
  const hasDefaults =
    context.isEditable ||
    !!context.linkURL ||
    !!(context.selectionText && context.selectionText.trim().length > 0) ||
    context.hasSelection;
  const hasCustom = actions.length > 0;
  return hasDefaults || hasCustom;
};

const normalizeActions = (actions?: CustomAction[]) =>
  Array.isArray(actions)
    ? actions.filter(
        (action): action is CustomAction =>
          !!action &&
          typeof action.id === 'string' &&
          action.id.length > 0 &&
          typeof action.label === 'string' &&
          action.label.length > 0 &&
          typeof action.onSelect === 'function'
      )
    : [];

const generateRequestId = () =>
  `native-menu-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const openNativeContextMenu = (
  event: SupportedEvent,
  options?: { actions?: CustomAction[] }
) => {
  if (!canUseNativeMenu()) return false;

  const context = buildContextDetails(event);
  const customActions = normalizeActions(options?.actions);
  if (!shouldShowMenu(context, customActions)) {
    return false;
  }

  registerActionListener();
  event.preventDefault?.();
  event.stopPropagation?.();

  const requestId = generateRequestId();
  const actionMap: Record<string, () => void> = {};
  customActions.forEach((action) => {
    actionMap[action.id] = action.onSelect;
  });

  const cleanupTimeout =
    typeof window === 'undefined'
      ? undefined
      : window.setTimeout(() => {
          pendingMenus.delete(requestId);
        }, 10000);

  pendingMenus.set(requestId, { actions: actionMap, cleanupTimeout });

  window.nativeContextMenu?.showMenu({
    requestId,
    context,
    actions: customActions.map(({ id, label, enabled = true }) => ({
      id,
      label,
      enabled,
    })),
  });

  return true;
};

export const shouldAllowNativeContextMenu = (event: SupportedEvent) => {
  const target = (event.target ||
    (event as any).srcElement) as HTMLElement | null;
  if (!target) return false;
  if (hasNativeOptOut(target)) return true;
  if (isEditableElement(target)) return true;
  return hasSelectedText(target);
};

export const initializeNativeContextMenu = () => {
  if (defaultListenerRegistered || !canUseNativeMenu()) {
    return;
  }
  defaultListenerRegistered = true;
  window.addEventListener(
    'contextmenu',
    (event) => {
      const target = (event.target ||
        (event as any).srcElement) as HTMLElement | null;
      if (!target) return;
      if (hasNativeOptOut(target)) return;

      const editable = isEditableElement(target);
      const selection = hasSelectedText(target);

      if (!editable && !selection) {
        return;
      }

      openNativeContextMenu(event);
    },
    true
  );
};
