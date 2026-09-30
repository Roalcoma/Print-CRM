// Auto-scroll horizontal de un tablero kanban mientras se arrastra una tarjeta (HTML5 drag & drop):
// el navegador solo desplaza la ventana, no los contenedores con overflow propio.
// Al acercarse al borde izquierdo/derecho el tablero se desplaza, más rápido cuanto más cerca.
import { onUnmounted, type Ref } from 'vue';

const EDGE = 140;        // px desde el borde donde empieza a desplazar
const MAX_SPEED = 1400;  // px/s pegado al borde
const EASE = 10;         // respuesta de la velocidad (1/s): arranca y frena sin tirones
const STALE_MS = 500;    // sin dragover en este tiempo = se soltó o salió (con el ratón quieto llega espaciado)

export function useDragAutoScroll(container: Ref<HTMLElement | null>) {
  let target = 0;        // velocidad deseada según la posición del cursor (px/s)
  let velocity = 0;      // velocidad actual, suavizada hacia target
  let pos = 0;           // posición en float: scrollLeft redondea y perdería los pasos pequeños
  let raf = 0;
  let lastFrame = 0;
  let lastOver = 0;
  let saved: { snap: string; behavior: string } | null = null;

  function frame(now: number) {
    const el = container.value;
    if (!el) { raf = 0; return; }
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    if (now - lastOver > STALE_MS) target = 0;
    velocity += (target - velocity) * Math.min(1, dt * EASE);
    if (target === 0 && Math.abs(velocity) < 5) { velocity = 0; raf = 0; return; }

    const max = el.scrollWidth - el.clientWidth;
    pos = Math.max(0, Math.min(max, pos + velocity * dt));
    el.scrollLeft = pos;
    if ((pos <= 0 && velocity < 0) || (pos >= max && velocity > 0)) velocity = 0;
    raf = requestAnimationFrame(frame);
  }

  function onDragOver(e: DragEvent) {
    const el = container.value;
    if (!el) return;
    lastOver = performance.now();
    const { left, right } = el.getBoundingClientRect();
    const edge = Math.min(EDGE, (right - left) / 4);
    // Curva cuadrática: lento al entrar en la zona, rápido solo pegado al borde
    const ramp = (d: number) => MAX_SPEED * Math.min(1, Math.max(0, 1 - d / edge)) ** 2;
    const x = e.clientX;
    target = x < left + edge ? -ramp(x - left) : x > right - edge ? ramp(right - x) : 0;

    if (target !== 0 && !raf) {
      if (!saved) {
        // scroll-snap devolvería cada paso a la columna más cercana: se suspende hasta soltar
        saved = { snap: el.style.scrollSnapType, behavior: el.style.scrollBehavior };
        el.style.scrollSnapType = 'none';
        el.style.scrollBehavior = 'auto';
      }
      pos = el.scrollLeft;
      lastFrame = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }

  // Al soltar o cancelar el arrastre
  function stop() {
    target = 0; velocity = 0;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    const el = container.value;
    if (el && saved) { el.style.scrollSnapType = saved.snap; el.style.scrollBehavior = saved.behavior; saved = null; }
  }

  onUnmounted(stop);

  return { onDragOver, stop };
}
