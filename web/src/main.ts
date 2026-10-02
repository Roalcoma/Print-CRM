import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { router } from './router';
import App from './App.vue';
import { showToast } from './composables/useToast';
import './style.css';

const app = createApp(App).use(createPinia()).use(router);

// Red de seguridad: cualquier error no capturado (render, watchers, handlers async con
// try/finally sin catch, promesas sueltas) se muestra como toast en vez de perderse en
// la consola o dejar la pantalla a medias. No relanza: la app sigue funcionando.
function reportError(err: unknown) {
  // 401: api.ts ya redirige a /login; un fetch abortado al navegar no es un error del usuario
  if (err instanceof Error && (err.name === 'SessionExpiredError' || err.name === 'AbortError')) return;
  console.error(err);
  const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  showToast(`Algo salió mal${msg ? `: ${msg}` : ''}`, 'error');
}

app.config.errorHandler = err => reportError(err);
window.addEventListener('unhandledrejection', e => {
  e.preventDefault();   // ya se informa con el toast
  reportError(e.reason);
});

app.mount('#app');
