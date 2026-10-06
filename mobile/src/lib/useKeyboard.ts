// Altura del teclado en pantalla. Con edge-to-edge (Android 15+, por defecto en Expo) la ventana ya
// no se redimensiona al abrir el teclado, así que cada pantalla reserva ese espacio a mano.
import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function useKeyboardHeight(): number {
  const [h, setH] = useState(0);
  const { bottom } = useSafeAreaInsets();
  useEffect(() => {
    const show = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hide = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s1 = Keyboard.addListener(show, e => setH(e.endCoordinates.height));
    const s2 = Keyboard.addListener(hide, () => setH(0));
    return () => { s1.remove(); s2.remove(); };
  }, []);
  // En Android la altura que informa el teclado no incluye la barra de navegación que queda debajo.
  return h > 0 && Platform.OS === 'android' ? h + bottom : h;
}
