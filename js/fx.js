/* fx.js — мелкие эффекты: свечение за курсором и волна от нажатия на кнопки */

(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // мягкое свечение следует за мышью (на телефонах скрыто)
  if (matchMedia('(hover: hover)').matches) {
    const glow = document.createElement('div');
    glow.className = 'cursorglow';
    document.body.append(glow);
    let x = 0, y = 0, queued = false;
    addEventListener('pointermove', e => {
      x = e.clientX; y = e.clientY; glow.style.opacity = 1;
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { glow.style.transform = `translate(${x}px,${y}px)`; queued = false; });
    }, { passive: true });
    document.addEventListener('pointerleave', () => { glow.style.opacity = 0; });
  }

  // волна расходится от точки нажатия
  document.addEventListener('pointerdown', e => {
    const el = e.target.closest('.btn, .icon-btn, .tab, .it');
    if (!el) return;
    const box = el.getBoundingClientRect(), size = Math.max(box.width, box.height) * 2.2, wave = document.createElement('span');
    wave.className = 'ripple';
    wave.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - box.left - size / 2}px;top:${e.clientY - box.top - size / 2}px`;
    el.append(wave);
    setTimeout(() => wave.remove(), 700);
  });
})();
