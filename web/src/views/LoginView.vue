<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { Mail, Lock, User, Building2, ArrowRight, Loader2, Zap, Calendar, MessageCircle, BarChart3 } from 'lucide-vue-next';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const router = useRouter();

const mode = ref<'login' | 'register'>('login');
const email = ref('');
const password = ref('');
const name = ref('');
const organizationName = ref('');
const error = ref('');
const loading = ref(false);

async function submit() {
  error.value = '';
  loading.value = true;
  try {
    if (mode.value === 'login') {
      await auth.login(email.value, password.value);
    } else {
      await auth.register({
        organizationName: organizationName.value,
        name: name.value,
        email: email.value,
        password: password.value,
      });
    }
    router.push('/dashboard');
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Error inesperado';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login-root">

    <!-- ── Panel izquierdo (marca) ── -->
    <div class="brand-panel">
      <!-- Malla de fondo -->
      <div class="brand-grid" aria-hidden="true" />
      <!-- Glow central -->
      <div class="brand-glow" aria-hidden="true" />

      <div class="brand-content">
        <!-- Logo -->
        <div class="brand-logo-wrap">
          <img src="/logo.png" alt="Rocco" class="brand-logo" />
        </div>

        <!-- Tagline -->
        <h2 class="brand-title">Tu negocio,<br />bajo control.</h2>
        <p class="brand-sub">La plataforma de gestión para negocios que quieren crecer sin caos.</p>

        <!-- Features -->
        <ul class="brand-features">
          <li>
            <span class="feat-icon"><MessageCircle class="h-3.5 w-3.5" /></span>
            WhatsApp & redes sociales integradas
          </li>
          <li>
            <span class="feat-icon"><Zap class="h-3.5 w-3.5" /></span>
            Automatizaciones inteligentes
          </li>
          <li>
            <span class="feat-icon"><Calendar class="h-3.5 w-3.5" /></span>
            Gestión de citas y calendarios
          </li>
          <li>
            <span class="feat-icon"><BarChart3 class="h-3.5 w-3.5" /></span>
            Pipeline de oportunidades
          </li>
        </ul>
      </div>

      <p class="brand-copy">© {{ new Date().getFullYear() }} Árbol Áureo</p>
    </div>

    <!-- ── Panel derecho (formulario) ── -->
    <div class="form-panel">
      <div class="form-inner">

        <div class="mb-8">
          <h1 class="form-title">
            {{ mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta' }}
          </h1>
          <p class="form-sub">
            {{ mode === 'login' ? 'Bienvenido de vuelta. Accede a tu espacio.' : 'Registra tu organización y empieza hoy.' }}
          </p>
        </div>

        <form class="space-y-5" @submit.prevent="submit">
          <template v-if="mode === 'register'">
            <div class="field">
              <label class="field-label">Organización</label>
              <div class="field-wrap">
                <Building2 class="field-icon" />
                <input v-model="organizationName" required placeholder="Nombre de tu empresa" class="field-input" />
              </div>
            </div>
            <div class="field">
              <label class="field-label">Tu nombre</label>
              <div class="field-wrap">
                <User class="field-icon" />
                <input v-model="name" required placeholder="Nombre completo" class="field-input" />
              </div>
            </div>
          </template>

          <div class="field">
            <label class="field-label">Correo electrónico</label>
            <div class="field-wrap">
              <Mail class="field-icon" />
              <input v-model="email" type="email" required placeholder="correo@empresa.com" class="field-input" />
            </div>
          </div>

          <div class="field">
            <label class="field-label">Contraseña</label>
            <div class="field-wrap">
              <Lock class="field-icon" />
              <input v-model="password" type="password" required placeholder="••••••••" class="field-input" />
            </div>
          </div>

          <div v-if="error" class="error-box">
            {{ error }}
          </div>

          <button type="submit" :disabled="loading" class="submit-btn group">
            <Loader2 v-if="loading" class="h-4 w-4 animate-spin" />
            <template v-else>
              <span>{{ mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta' }}</span>
              <ArrowRight class="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" />
            </template>
          </button>
        </form>

        <p class="mt-6 text-center text-sm text-slate-500">
          {{ mode === 'login' ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?' }}
          <button
            class="ml-1 font-semibold text-[#F69008] hover:text-[#D97706] transition-colors cursor-pointer"
            @click="mode = mode === 'login' ? 'register' : 'login'"
          >
            {{ mode === 'login' ? 'Regístrate' : 'Inicia sesión' }}
          </button>
        </p>
      </div>
    </div>

  </div>
</template>

<style scoped>
/* ── Layout raíz ── */
.login-root {
  display: flex;
  min-height: 100vh;
  background: #0d0f14;
}

/* ── Panel izquierdo ── */
.brand-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 36%;
  min-height: 100vh;
  background: linear-gradient(160deg, #111318 0%, #1a1d25 60%, #141720 100%);
  overflow: hidden;
  padding: 3rem 2.5rem;
  flex-shrink: 0;
}

.brand-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(246,144,8,0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(246,144,8,0.06) 1px, transparent 1px);
  background-size: 40px 40px;
  mask-image: radial-gradient(ellipse 80% 80% at 50% 40%, black 30%, transparent 100%);
}

.brand-glow {
  position: absolute;
  width: 500px;
  height: 500px;
  background: radial-gradient(circle, rgba(246,144,8,0.12) 0%, transparent 65%);
  top: -100px;
  left: -80px;
  pointer-events: none;
}

.brand-content {
  position: relative;
  z-index: 1;
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.brand-logo-wrap {
  margin-bottom: 2.5rem;
}
.brand-logo {
  height: 48px;
  object-fit: contain;
  filter: drop-shadow(0 0 20px rgba(246,144,8,0.3));
}

.brand-title {
  font-size: 2.1rem;
  font-weight: 800;
  line-height: 1.15;
  color: #f1f5f9;
  letter-spacing: -0.02em;
  margin-bottom: 0.875rem;
}

.brand-sub {
  font-size: 0.9rem;
  color: #64748b;
  line-height: 1.6;
  max-width: 300px;
  margin-bottom: 2.5rem;
}

.brand-features {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}
.brand-features li {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  font-size: 0.8125rem;
  color: #94a3b8;
}
.feat-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 7px;
  background: rgba(246,144,8,0.12);
  color: #F69008;
  flex-shrink: 0;
}

.brand-copy {
  position: relative;
  z-index: 1;
  font-size: 0.7rem;
  color: #334155;
  margin-top: 2rem;
}

/* ── Panel derecho ── */
.form-panel {
  flex: 1;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 3rem 2rem;
}

.form-inner {
  width: 100%;
  max-width: 380px;
}

.form-title {
  font-size: 1.625rem;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: -0.02em;
  margin-bottom: 0.375rem;
}
.form-sub {
  font-size: 0.875rem;
  color: #64748b;
}

/* ── Campos ── */
.field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}
.field-label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: #374151;
}
.field-wrap {
  position: relative;
  display: flex;
  align-items: center;
}
.field-icon {
  position: absolute;
  left: 12px;
  width: 15px;
  height: 15px;
  color: #9ca3af;
  pointer-events: none;
}
.field-input {
  width: 100%;
  border-radius: 0.5rem;
  border: 1.5px solid #e5e7eb;
  background: #fafafa;
  padding: 0.625rem 0.875rem 0.625rem 2.375rem;
  font-size: 0.875rem;
  color: #111827;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
}
.field-input::placeholder { color: #9ca3af; }
.field-input:focus {
  border-color: #F69008;
  background: #fff;
  box-shadow: 0 0 0 3px rgba(246,144,8,0.1);
}

/* ── Error ── */
.error-box {
  padding: 0.625rem 0.875rem;
  border-radius: 0.5rem;
  background: #fef2f2;
  border: 1px solid #fecaca;
  font-size: 0.8125rem;
  color: #dc2626;
}

/* ── Botón ── */
.submit-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.7rem 1.25rem;
  border-radius: 0.5rem;
  font-size: 0.9rem;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(135deg, #F69008 0%, #e07c00 100%);
  border: none;
  cursor: pointer;
  transition: all 0.15s;
  box-shadow: 0 1px 3px rgba(246,144,8,0.4), 0 4px 12px rgba(246,144,8,0.2);
  letter-spacing: 0.01em;
}
.submit-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #fb9a0e 0%, #e88800 100%);
  box-shadow: 0 2px 6px rgba(246,144,8,0.5), 0 6px 20px rgba(246,144,8,0.25);
  transform: translateY(-1px);
}
.submit-btn:active:not(:disabled) { transform: translateY(0); }
.submit-btn:disabled { opacity: 0.55; cursor: not-allowed; }

/* ── Responsive ── */
@media (max-width: 768px) {
  .login-root { flex-direction: column; }
  .brand-panel {
    width: 100%;
    min-height: auto;
    padding: 2.5rem 1.5rem;
  }
  .brand-content { justify-content: flex-start; }
  .brand-title { font-size: 1.6rem; }
  .brand-features { display: none; }
  .form-panel { padding: 2rem 1.5rem; }
}
</style>
