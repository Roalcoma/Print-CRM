// Notificaciones push. Se usa el token NATIVO del dispositivo (FCM en Android, APNs en iOS): el
// servidor de Rocco envía directo por FCM HTTP v1, sin el servicio de push de Expo.
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { api } from './api';
import { getItem, KEYS, setItem } from './storage';

export type PushStatus = 'unknown' | 'ok' | 'not-configured' | 'denied' | 'emulator' | 'error';
let status: PushStatus = 'unknown';
const listeners = new Set<(s: PushStatus) => void>();
function setStatus(s: PushStatus) { status = s; listeners.forEach(l => l(s)); }
export function getPushStatus() { return status; }
export function onPushStatus(fn: (s: PushStatus) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

// En Android, FCM solo funciona si el APK se compiló con google-services.json.
export const pushConfigured: boolean =
  Platform.OS !== 'android' || Constants.expoConfig?.extra?.pushConfigured === true;

// Datos que manda el servidor en cada push.
export interface PushData {
  type?: 'new_lead' | 'new_message' | 'appointment_booked' | 'appointment_cancelled' | 'task_due' | 'wa_down' | 'system';
  orgId?: string;
  opportunityId?: string;
  conversationId?: string;
  contactId?: string;
  appointmentId?: string;
}

// Primer plano: mostrar banner, sonar y dejarla en la bandeja.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Los 4 canales que usa el servidor (android.notification.channel_id). Se crean al arrancar; en
// Android 13+ tiene que existir al menos uno antes de pedir el permiso.
export async function ensureChannels() {
  if (Platform.OS !== 'android') return;
  const I = Notifications.AndroidImportance;
  const vis = Notifications.AndroidNotificationVisibility.PRIVATE;
  await Promise.all([
    Notifications.setNotificationChannelAsync('leads', {
      name: 'Nuevos leads', importance: I.HIGH, vibrationPattern: [0, 250, 200, 250], lightColor: '#F69008', lockscreenVisibility: vis,
    }),
    Notifications.setNotificationChannelAsync('messages', {
      name: 'Mensajes', importance: I.HIGH, vibrationPattern: [0, 200], lightColor: '#F69008', lockscreenVisibility: vis,
    }),
    Notifications.setNotificationChannelAsync('agenda', { name: 'Agenda y tareas', importance: I.DEFAULT, lockscreenVisibility: vis }),
    Notifications.setNotificationChannelAsync('system', { name: 'Avisos del sistema', importance: I.DEFAULT, lockscreenVisibility: vis }),
  ]).catch(() => {});
}

// Pide permiso, obtiene el token nativo y lo registra en el servidor. Nunca lanza.
export async function registerForPush(): Promise<PushStatus> {
  try {
    if (!pushConfigured) { setStatus('not-configured'); return status; }
    if (!Device.isDevice) { setStatus('emulator'); return status; }
    await ensureChannels();
    let perm = await Notifications.getPermissionsAsync();
    if (!perm.granted && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync();
    if (!perm.granted) { setStatus('denied'); return status; }
    const { data } = await Notifications.getDevicePushTokenAsync();
    const token = typeof data === 'string' ? data : JSON.stringify(data);
    await sendToken(token);
    setStatus('ok');
  } catch (e) {
    console.warn('push:', e);
    setStatus('error');
  }
  return status;
}

async function sendToken(token: string) {
  await api.post('/me/push-tokens', {
    token,
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    device_name: Device.deviceName ?? Device.modelName ?? undefined,
  });
  await setItem(KEYS.pushToken, token);
}

// FCM puede rotar el token: se vuelve a registrar.
export function watchTokenRotation(): () => void {
  const sub = Notifications.addPushTokenListener(t => {
    const token = typeof t.data === 'string' ? t.data : JSON.stringify(t.data);
    sendToken(token).catch(() => {});
  });
  return () => sub.remove();
}

// Al cerrar sesión: el servidor deja de enviar a este dispositivo.
export async function unregisterPush() {
  const token = await getItem(KEYS.pushToken);
  if (token) await api.del('/me/push-tokens', { token }, { timeoutMs: 6000 }).catch(() => {});
  await setItem(KEYS.pushToken, null);
  await Notifications.dismissAllNotificationsAsync().catch(() => {});
}

// Los datos pueden venir en content.data o, en Android, en el RemoteMessage de FCM.
export function pushDataOf(n: Notifications.Notification): PushData {
  const content = n.request.content.data as Record<string, unknown> | null;
  if (content && Object.keys(content).length) return content as PushData;
  const trigger = n.request.trigger as { remoteMessage?: { data?: Record<string, string> } } | null;
  const remote = trigger?.remoteMessage?.data;
  if (remote) {
    if (typeof remote.body === 'string') {
      try { return { ...remote, ...JSON.parse(remote.body) } as PushData; } catch { /* no es JSON */ }
    }
    return remote as PushData;
  }
  return {};
}

// Ruta a la que lleva tocar la notificación.
export function routeForPush(d: PushData): string {
  if (d.type === 'new_lead' && d.opportunityId) return `/lead/${d.opportunityId}`;
  if (d.type === 'new_message' && d.conversationId) return `/chat/${d.conversationId}`;
  return '/';
}
