// Raíz: proveedores, splash, protección de rutas por sesión y apertura desde notificaciones.
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { useFonts } from 'expo-font';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/lib/auth';
import { UnreadProvider } from '@/lib/unread';
import { ToastProvider } from '@/components/Toast';
import { LockScreen } from '@/components/LockScreen';
import { ensureChannels, pushDataOf, registerForPush, routeForPush, watchTokenRotation } from '@/lib/push';
import { emit } from '@/lib/events';
import { colors } from '@/lib/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});
ensureChannels();

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <UnreadProvider>
          <ToastProvider>
            <StatusBar style="dark" />
            <Navigation />
          </ToastProvider>
        </UnreadProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function Navigation() {
  const { status, user, locked } = useAuth();
  const [fontsLoaded] = useFonts({ ...Ionicons.font, ...MaterialCommunityIcons.font });
  const signedIn = status === 'signedIn';
  const mustChange = signedIn && user?.mustChangePassword === true;
  const ready = signedIn && !mustChange && !locked;

  useEffect(() => {
    if (status !== 'loading' && fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [status, fontsLoaded]);

  // Registrar el token push en cuanto hay sesión completa.
  useEffect(() => {
    if (!ready) return;
    registerForPush();
    return watchTokenRotation();
  }, [ready]);

  useNotificationRouting(ready);

  if (status === 'loading' || !fontsLoaded) return <View style={{ flex: 1, backgroundColor: colors.canvas }} />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas }, animation: 'slide_from_right' }}>
        <Stack.Protected guard={signedIn && !mustChange}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="lead/[id]" />
          <Stack.Screen name="chat/[id]" />
        </Stack.Protected>
        <Stack.Protected guard={mustChange}>
          <Stack.Screen name="change-password" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="login" />
        </Stack.Protected>
      </Stack>
      {signedIn && locked ? <LockScreen /> : null}
    </View>
  );
}

// Tocar una notificación (app cerrada, en segundo plano o abierta) lleva a su pantalla; si aún no hay
// sesión lista (cargando, bloqueada) se guarda y se navega al desbloquear.
function useNotificationRouting(ready: boolean) {
  const pending = useRef<string | null>(null);
  const handled = useRef(new Set<string>());
  const readyRef = useRef(ready);
  readyRef.current = ready;

  const go = (route: string) => {
    setTimeout(() => {
      if (route === '/') router.navigate('/');
      else router.push(route as never);
    }, 50);
  };

  useEffect(() => {
    const onResponse = (r: Notifications.NotificationResponse) => {
      const id = r.notification.request.identifier;
      if (handled.current.has(id)) return;
      handled.current.add(id);
      const route = routeForPush(pushDataOf(r.notification));
      if (readyRef.current) go(route); else pending.current = route;
    };
    const last = Notifications.getLastNotificationResponse();
    if (last) { onResponse(last); Notifications.clearLastNotificationResponse(); }
    const s1 = Notifications.addNotificationResponseReceivedListener(onResponse);
    // Con la app abierta: refrescar lo que corresponda (el banner lo muestra el handler de push.ts).
    const s2 = Notifications.addNotificationReceivedListener(n => {
      const d = pushDataOf(n);
      if (d.type === 'new_message') emit('push:message', d);
      else if (d.type === 'new_lead') emit('push:lead', d);
    });
    return () => { s1.remove(); s2.remove(); };
  }, []);

  useEffect(() => {
    if (ready && pending.current) { go(pending.current); pending.current = null; }
  }, [ready]);
}
