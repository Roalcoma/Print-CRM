// Auto-scroll horizontal de un tablero kanban mientras se arrastra una tarjeta (HTML5 drag & drop):
// el navegador solo desplaza la ventana, no los contenedores con overflow propio.
// Al acercarse al borde izquierdo/derecho el tablero se desplaza, más rápido cuanto más cerca.
import { onUnmounted, type Ref } from 'vue';

const EDGE = 120;       // px desde el borde donde empieza a desplazar
const MAX_SPEED = 28;   // px por frame en el mismo borde

export function useDragAutoScroll(container: Ref<HTMLElement | null>) {
  let speed = 0;
  let raf = 0;
  let lastOver = 0;
  let savedSnap: string | null = null;

  // scroll-snap devolvería cada paso pequeño a la columna más cercana: se suspende mientras desplaza
  function release() {
    raf = 0; speed = 0;
    const el = container.value;
    if (el && savedSnap !== null) { el.style.scrollSnapType = savedSnap; savedSnap = null; }
  }

  function tick() {
    const el = container.value;
    // dragover se dispara continuamente mientras se arrastra; si deja de llegar, se soltó o salió
    if (!el || speed === 0 || performance.now() - lastOver > 150) { release(); return; }
    el.scrollLeft += speed;
    raf = requestAnimationFrame(tick);
  }

  function onDragOver(e: DragEvent) {
    const el = container.value;
    if (!el) return;
    lastOver = performance.now();
    const { left, right } = el.getBoundingClientRect();
    const edge = Math.min(EDGE, (right - left) / 4);
    const x = e.clientX;
    const ramp = (d: number) => Math.ceil(MAX_SPEED * Math.min(1, 1 - d / edge));
    if (x < left + edge)       speed = -ramp(x - left);
    else if (x > right - edge) speed =  ramp(right - x);
    else                       speed = 0;
    if (speed !== 0 && !raf) {
      if (savedSnap === null) { savedSnap = el.style.scrollSnapType; el.style.scrollSnapType = 'none'; }
      raf = requestAnimationFrame(tick);
    }
  }

  function stop() { speed = 0; }

  onUnmounted(() => { if (raf) cancelAnimationFrame(raf); });

  return { onDragOver, stop };
}
