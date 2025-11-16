export {};

declare global {
  interface NativeContextMenuActionPayload {
    id: string;
    label: string;
    enabled?: boolean;
  }

  interface NativeContextMenuContextPayload {
    hasSelection?: boolean;
    selectionText?: string;
    isEditable?: boolean;
    linkURL?: string;
  }

  interface NativeContextMenuRequestPayload {
    requestId: string;
    actions?: NativeContextMenuActionPayload[];
    context?: NativeContextMenuContextPayload;
  }

  interface NativeContextMenuActionEvent {
    requestId: string;
    actionId: string;
  }

  interface NativeContextMenuAPI {
    showMenu: (payload: NativeContextMenuRequestPayload) => void;
    onAction: (
      callback: (event: NativeContextMenuActionEvent) => void
    ) => () => void;
  }

  interface Window {
    nativeContextMenu?: NativeContextMenuAPI;
  }
}
