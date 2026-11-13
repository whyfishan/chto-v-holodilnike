// Ингредиенты борща «слоями» (как в референсе) на первом экране.
// При прокрутке «башня» плывёт по центру страницы ПОЗАДИ карточек (они полупрозрачные),
// а в конце страницы ингредиенты по очереди ныряют в тарелку — уже поверх неё.
// Положение считается из прокрутки, поэтому при прокрутке вверх всё «отматывается».
(() => {
  const tower = document.getElementById('tower');
  const plate = document.getElementById('plate');
  const plateBox = document.getElementById('plateBox');
  if (!tower || !plate) return;
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const mkLayer = (cls) => {
    const l = document.createElement('div');
    l.className = 'fall-layer ' + cls;
    l.setAttribute('aria-hidden', 'true');
    document.body.appendChild(l);
    return l;
  };
  const back = mkLayer('fall-layer--back');   // позади контента
  const front = mkLayer('fall-layer--front'); // поверх тарелки — для «прыжка» в неё

  const slots = [...tower.querySelectorAll('.slot')];
  const items = slots.map((slot, i) => {
    const img = slot.querySelector('img').cloneNode();
    img.className = 'fall-item';
    back.appendChild(img);
    const rot = parseFloat(slot.style.getPropertyValue('--r')) || 0;
    return { slot, img, i, rot, lbl: slot.querySelector('.lbl'), inFront: false };
  });
  document.documentElement.classList.add('fall-on');

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  let queued = false;
  function frame() {
    queued = false;
    const vw = innerWidth;
    const vh = innerHeight;
    const y = scrollY;
    const maxScroll = document.documentElement.scrollHeight - vh;
    const mobile = vw < 700;
    const n = items.length;

    // Сколько «уехал» первый экран. Ингредиенты срываются ПО ОЧЕРЕДИ (на телефоне — парами),
    // а не всей башней сразу; на телефоне путь растянут на большую прокрутку — переход мягче.
    // отсчёт от прокрутки: пока страницу не листали — башня стоит ровно на месте
    const P = clamp(Math.max(0, y - 30) / (vh * (mobile ? 0.55 : 0.6)), 0, 2);
    const smoothK = mobile ? 0.1 : 0.18; // насколько быстро «догоняют» цель (меньше — плавнее)
    let settled = true;
    let liftSum = 0;

    // Колонна по центру экрана: те же слои, чуть плотнее
    const colX = vw / 2;
    const step = Math.min(vh * 0.085, mobile ? 70 : 84);
    const colTop = vh / 2 - (step * (n - 1)) / 2;

    const pr = plate.getBoundingClientRect();
    let dive = clamp((vh - pr.top) / (vh * 0.75));
    if (y >= maxScroll - 2) dive = 1;

    let landed = 0;
    items.forEach((it) => {
      const r = it.slot.getBoundingClientRect();
      const size = r.width;
      // 1) место в «башне» на первом экране
      const sx = r.left + r.width / 2;
      const sy = r.top + r.height / 2;
      // 2) колонна по центру, лёгкое покачивание
      const sway = Math.sin(y / 260 + it.i * 0.9) * (mobile ? 8 : 18);
      const cx = colX + sway;
      const cy = colTop + it.i * step;
      // 3) прыжок в тарелку, по очереди — снизу вверх, как падают слои
      const order = n - 1 - it.i;
      // целевые значения прогресса…
      const start = mobile ? Math.floor(it.i / 2) * 0.24 : it.i * 0.08;
      const liftT = clamp((P - start) / 0.55);
      const diT = clamp((dive - order * 0.045) / 0.6);
      // …и мягкое «догоняние»: даже если прокрутка дёрганая, картинка едет плавно
      if (it.ls === undefined) { it.ls = liftT; it.ds = diT; }
      it.ls += (liftT - it.ls) * smoothK;
      it.ds += (diT - it.ds) * smoothK;
      if (Math.abs(liftT - it.ls) < 0.001) it.ls = liftT; else settled = false;
      if (Math.abs(diT - it.ds) < 0.001) it.ds = diT; else settled = false;
      const lift = ease(it.ls);
      const di = ease(it.ds);
      liftSum += lift;
      const visL = Math.max(pr.left, 0);
      const visR = Math.min(pr.right, vw);
      const tx = visL + (visR - visL) * (0.5 + (it.i - (n - 1) / 2) * 0.04);
      const ty = pr.top + pr.height * 0.4;

      let x = lerp(sx, cx, lift);
      let yy = lerp(sy, cy, lift);
      x = lerp(x, tx, di);
      yy = lerp(yy, ty, di) - Math.sin(di * Math.PI) * vh * 0.06;

      let scale = lerp(1, mobile ? 1.05 : 0.95, lift);
      scale = lerp(scale, 0.3, di);
      const rot = it.rot + Math.sin(y / 300 + it.i) * 6 * lift + di * (it.i % 2 ? 120 : -120);
      // позади карточек — чуть приглушены, чтобы не спорить с текстом
      let opacity = lerp(1, mobile ? 0.55 : 0.75, lift);
      opacity = lerp(opacity, 1, clamp(di * 3));
      if (di > 0.85) opacity = clamp((1 - di) / 0.15);
      if (di > 0.97) landed++;

      // во время прыжка — переносим в передний слой, чтобы падать В тарелку, а не за неё
      const wantFront = di > 0.02;
      if (wantFront !== it.inFront) { (wantFront ? front : back).appendChild(it.img); it.inFront = wantFront; }

      // ширину меняем только когда она правда изменилась — иначе браузер каждый кадр пересчитывает раскладку
      if (it.w !== size) { it.img.style.width = size + 'px'; it.w = size; }
      const op = opacity.toFixed(2);
      if (it.op !== op) { it.img.style.opacity = op; it.op = op; }
      it.img.style.transform = `translate(${(x - size / 2).toFixed(1)}px, ${(yy - size / 2).toFixed(1)}px) rotate(${rot.toFixed(1)}deg) scale(${scale.toFixed(3)})`;
      if (it.lbl) { const lo = clamp(1 - lift * 3).toFixed(2); if (it.lo !== lo) { it.lbl.style.opacity = lo; it.lo = lo; } }
    });
    if (plateBox) plateBox.classList.toggle('full', landed === n);
    // оранжевое свечение за башней гаснет по мере того, как ингредиенты уезжают
    const glow = (1 - liftSum / n).toFixed(2);
    if (glow !== lastGlow) { tower.parentElement.style.setProperty('--glow', glow); lastGlow = glow; }
    if (!settled) request(); // ещё догоняют цель — рисуем следующий кадр
  }
  let lastGlow = '';

  const request = () => { if (!queued) { queued = true; requestAnimationFrame(frame); } };
  addEventListener('scroll', request, { passive: true });
  addEventListener('resize', request);
  addEventListener('load', request);
  plate.addEventListener('load', request);
  request();
})();
