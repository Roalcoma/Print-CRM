// Almacenamiento cifrado del dispositivo (Keystore en Android, Keychain en iOS).
import * as SecureStore from 'expo-secure-store';

export const KEYS = {
  token: 'rocco_token',
  user: 'rocco_user',
  apiUrl: 'rocco_api_url',
  biometric: 'rocco_biometric',
  pushToken: 'rocco_push_token',
  pipeline: 'rocco_pipeline',
} as const;

export async function getItem(key: string): Promise<string | null> {
  try { return await SecureStore.getItemAsync(key); } catch { return null; }
}
export async function setItem(key: string, value: string | null): Promise<void> {
  try {
    if (value === null) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, value);
  } catch { /* almacenamiento no disponible: se pierde solo la persistencia */ }
}
