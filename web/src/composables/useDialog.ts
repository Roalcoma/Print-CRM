import { ref, shallowRef } from 'vue';

interface DialogState {
  type: 'alert' | 'confirm';
  title?: string;
  message: string;
  confirmLabel?: string;
  resolve: (value: boolean) => void;
}

export const dialogState = ref<DialogState | null>(null);

function openDialog(state: Omit<DialogState, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => {
    dialogState.value = { ...state, resolve };
  });
}

export function useDialog() {
  function alert(message: string, title?: string) {
    return openDialog({ type: 'alert', message, title });
  }
  function confirm(message: string, title?: string, confirmLabel = 'Confirmar') {
    return openDialog({ type: 'confirm', message, title, confirmLabel });
  }
  return { alert, confirm };
}
