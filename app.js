(() => {
  const $ = (s) => document.querySelector(s);
  const byId = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));
  const STORE_KEY = 'holodilnik-produkty';

  const SHOPS = [
    { id: 'lavka', name: 'Купить в Яндекс Лавке', url: (q) => 'https://lavka.yandex.ru/search?text=' + encodeURIComponent(q) },
  ];

  // ----- состояние -----
  let selected = new Set();
  let activeCat = 'all';
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    if (Array.isArray(saved)) selected = new Set(saved.filter((id) => byId[id]));
  } catch (e) { /* хранилище недоступно — просто начинаем с нуля */ }

  const save = () => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify([...selected])); } catch (e) { /* ничего */ }
  };

  const norm = (s) => s.toLowerCase().replace(/ё/g, 'е').trim();
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const minutes = (m) => (m >= 60 ? `${Math.floor(m / 60)} ч${m % 60 ? ' ' + (m % 60) + ' мин' : ''}` : `${m} мин`);
  const plural = (n, one, few, many) => {
    const a = n % 10, b = n % 100;
    if (a === 1 && b !== 11) return one;
    if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
    return many;
  };
  // «Хлеб / батон» → «Хлеб», «Пепперони (салями)» → «Пепперони» — чище поиск в магазине
  const searchName = (n) => n.split(' / ')[0].replace(/\s*\(.*\)/, '').trim();
  const shopsHTML = (productName) =>
    `<span class="shops">${SHOPS.map((s) =>
      `<a class="shop shop--${s.id}" href="${s.url(searchName(productName))}" target="_blank" rel="noopener" title="Найти «${esc(productName)}» в Яндекс Лавке">${s.name}</a>`
    ).join('')}</span>`;

  // ----- продукты -----
  function renderGroups() {
    $('#groups').innerHTML = GROUPS.map((g) => {
      const items = PRODUCTS.filter((p) => p.g === g.id);
      return `<div class="group" data-group="${g.id}">
        <h3><span aria-hidden="true">${g.icon}</span>${g.name}<small data-gcount="${g.id}"></small></h3>
        <div class="chips">${items.map((p) =>
          `<button type="button" class="chip" data-id="${p.id}" aria-pressed="${selected.has(p.id)}">${p.name}</button>`
        ).join('')}</div>
      </div>`;
    }).join('') + '<p class="empty-search" id="emptySearch">Такого продукта пока нет в списке.</p>';
  }

  function syncChips() {
    document.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', selected.has(c.dataset.id)));
    GROUPS.forEach((g) => {
      const n = PRODUCTS.filter((p) => p.g === g.id && selected.has(p.id)).length;
      const el = document.querySelector(`[data-gcount="${g.id}"]`);
      if (el) el.textContent = n ? `выбрано ${n}` : '';
    });
    const n = selected.size;
    $('#pickCount').textContent = n;
    $('#topCount').textContent = n;
    $('#mobileCount').textContent = n;
    $('#mobileBar').classList.toggle('show', n > 0);
  }

  function filterChips(q) {
    const nq = norm(q);
    let any = false;
    document.querySelectorAll('.group').forEach((g) => {
      let shown = 0;
      g.querySelectorAll('.chip').forEach((c) => {
        const ok = !nq || norm(c.textContent).includes(nq);
        c.classList.toggle('hide', !ok);
        if (ok) shown++;
      });
      g.style.display = shown ? '' : 'none';
      if (shown) any = true;
    });
    $('#emptySearch').style.display = any ? 'none' : 'block';
  }

  // ----- блюда -----
  // Необязательные продукты («по желанию») не мешают блюду попасть в «можно приготовить»
  const isOptional = (d, id) => (OPTIONAL[d.id] || []).includes(id);
  const missingOf = (d) => d.ing.filter((i) => !isOptional(d, i) && !selected.has(i));
  const catName = (id) => (CATEGORIES.find((c) => c.id === id) || {}).name;

  function cardHTML(d, mode) {
    const miss = missingOf(d);
    let status = '';
    let extra = '';
    if (mode === 'all') {
      status = `<span class="card__status neutral">${d.ing.length} ${plural(d.ing.length, 'продукт', 'продукта', 'продуктов')}</span>`;
    } else if (miss.length === 0) {
      status = '<span class="card__status ok">✓ Всё есть</span>';
    } else {
      status = `<span class="card__status miss">Не хватает: ${miss.length}</span>`;
      extra = `<div class="card__missing"><b>Докупить:</b>${miss.map((id) =>
        `<div class="miss-item"><span>${byId[id].name}</span>${shopsHTML(byId[id].name)}</div>`
      ).join('')}</div>`;
    }
    return `<article class="card" tabindex="0" role="button" data-dish="${d.id}" aria-label="Открыть рецепт: ${esc(d.name)}">
      <span class="card__tag">${catName(d.cat)}</span>
      <span class="card__time">${minutes(d.time)}</span>
      <div class="card__img"><img src="img/${d.id}.webp" alt="${esc(d.name)}" loading="lazy"></div>
      <h4>${d.name}</h4>
      <p>${d.desc}</p>
      ${NUTRITION[d.id] ? `<span class="card__kcal">≈ ${kcalOf(NUTRITION[d.id])} ккал на 100 г</span>` : ''}
      <div class="card__foot">${status}<span class="card__go" aria-hidden="true">→</span></div>
      ${extra}
    </article>`;
  }

  function renderTabs(pool) {
    const count = (id) => pool.filter((d) => id === 'all' || d.cat === id).length;
    const tabs = [{ id: 'all', name: 'Все' }, ...CATEGORIES];
    $('#tabs').innerHTML = tabs.map((t) => {
      const n = count(t.id);
      return `<button type="button" class="tab" role="tab" data-cat="${t.id}" aria-selected="${activeCat === t.id}">${t.name}<sup>${n}</sup></button>`;
    }).join('');
  }

  function renderResults() {
    const inCat = (d) => activeCat === 'all' || d.cat === activeCat;
    const out = $('#results');

    if (selected.size === 0) {
      renderTabs(DISHES);
      $('#resultsHint').textContent = 'Пока продукты не выбраны, показываем все блюда. Отметь продукты выше — и мы подберём подходящие.';
      const list = DISHES.filter(inCat);
      out.innerHTML = `<div class="block"><div class="cards">${list.map((d) => cardHTML(d, 'all')).join('')}</div></div>`;
      return;
    }

    const ready = DISHES.filter((d) => missingOf(d).length === 0);
    const almost = DISHES.filter((d) => { const m = missingOf(d).length; return m >= 1 && m <= 2; })
      .sort((a, b) => missingOf(a).length - missingOf(b).length || b.ing.length - a.ing.length);
    renderTabs([...ready, ...almost]);

    const r = ready.filter(inCat);
    const a = almost.filter(inCat);
    $('#resultsHint').textContent = ready.length
      ? `Из твоих продуктов получится ${ready.length} ${plural(ready.length, 'блюдо', 'блюда', 'блюд')}, и ещё ${almost.length} — если докупить немного.`
      : 'Готовых вариантов пока нет — но вот что получится, если докупить пару продуктов.';

    let html = '';
    html += `<div class="block"><div class="block__head"><h3>Можно приготовить <em>сейчас</em></h3><span>все продукты есть</span></div>`;
    html += r.length
      ? `<div class="cards">${r.map((d) => cardHTML(d, 'match')).join('')}</div>`
      : '<div class="nothing"><b>Пока ничего</b>Отметь ещё продукты или загляни в блок ниже.</div>';
    html += '</div>';
    html += `<div class="block"><div class="block__head"><h3>Докупи <em>1–2 продукта</em></h3><span>и можно готовить</span></div>`;
    html += a.length
      ? `<div class="cards">${a.map((d) => cardHTML(d, 'match')).join('')}</div>`
      : '<div class="nothing"><b>Тут пусто</b>В этой категории нет блюд, для которых не хватает одного-двух продуктов.</div>';
    html += '</div>';
    out.innerHTML = html;
  }

  // ----- окно рецепта -----
  const num = (x) => String(x).replace('.', ',');
  function nutritionHTML(id) {
    const n = NUTRITION[id];
    if (!n) return '';
    const tiles = [
      ['Калории', `≈ ${kcalOf(n)}`, 'ккал'],
      ['Белки', num(n.b), 'г'],
      ['Жиры', num(n.j), 'г'],
      ['Углеводы', num(n.u), 'г'],
    ];
    return `<div class="nutri">
      <h3>КБЖУ на 100 г</h3>
      <div class="nutri__tiles">${tiles.map(([t, v, u]) =>
        `<div class="nutri__tile"><small>${t}</small><b>${v}</b><span>${u}</span></div>`).join('')}</div>
      <p class="nutri__note">Цифры примерные. Это общепринятые средние значения из открытых таблиц калорийности.
        Настоящие КБЖУ зависят от самих продуктов (жирность мяса и сметаны, сорт муки, свежесть овощей),
        от количества масла и способа приготовления.</p>
    </div>`;
  }

  function openRecipe(id) {
    const d = DISHES.find((x) => x.id === id);
    if (!d) return;
    const hasAny = selected.size > 0;
    // сначала обязательные, потом «по желанию»
    const order = [...d.ing.filter((i) => !isOptional(d, i)), ...d.ing.filter((i) => isOptional(d, i))];
    const ings = order.map((pid) => {
      const p = byId[pid];
      const have = selected.has(pid);
      const opt = isOptional(d, pid);
      const optTag = opt ? '<small class="opt">по желанию</small>' : '';
      if (!hasAny) return `<li class="have${opt ? ' optional' : ''}"><span class="mark">•</span><span>${p.name}</span>${optTag}</li>`;
      if (have) return `<li class="have"><span class="mark">✓</span><span>${p.name}</span>${optTag}</li>`;
      if (opt) return `<li class="optional"><span class="mark">–</span><span>${p.name}</span>${optTag}</li>`;
      return `<li class="need"><span class="mark">✕</span><span>${p.name}</span>${shopsHTML(p.name)}</li>`;
    }).join('');
    $('#modalBody').innerHTML = `<div class="recipe">
      <div class="recipe__top">
        <div class="recipe__img"><img src="img/${d.id}.webp" alt="${esc(d.name)}"></div>
        <div>
          <p class="eyebrow"><i></i>${CUISINES[d.cui]}</p>
          <h2 id="mTitle">${d.name}</h2>
          <div class="recipe__meta"><span class="pill">${catName(d.cat)}</span><span class="pill">⏱ ${minutes(d.time)}</span><span class="pill">${d.ing.length} ${plural(d.ing.length, 'продукт', 'продукта', 'продуктов')}</span></div>
          <p>${d.desc}</p>
        </div>
      </div>
      ${nutritionHTML(d.id)}
      <div class="recipe__cols">
        <div>
          <h3>Продукты</h3>
          <ul class="ings">${ings}</ul>
          <p class="staple">+ соль, перец, сахар, масло и вода — по вкусу</p>
        </div>
        <div>
          <h3>Как готовить</h3>
          <ol class="steps">${d.steps.map((s) => `<li><span>${s}</span></li>`).join('')}</ol>
        </div>
      </div>
      ${NUTRITION[d.id] && NUTRITION[d.id].fact ? `<div class="fact"><span class="fact__icon" aria-hidden="true">💡</span><div><b>Интересный факт</b><p>${NUTRITION[d.id].fact}</p></div></div>` : ''}
    </div>`;
    const m = $('#modal');
    if (typeof m.showModal === 'function') m.showModal(); else m.setAttribute('open', '');
    m.scrollTop = 0;
  }

  // ----- события -----
  function update() { syncChips(); renderResults(); save(); }

  $('#groups').addEventListener('click', (e) => {
    const c = e.target.closest('.chip');
    if (!c) return;
    const id = c.dataset.id;
    selected.has(id) ? selected.delete(id) : selected.add(id);
    update();
  });
  $('#search').addEventListener('input', (e) => filterChips(e.target.value));
  $('#clearBtn').addEventListener('click', () => { selected.clear(); update(); });
  $('#demoBtn').addEventListener('click', () => {
    selected = new Set(['potato', 'carrot', 'onion', 'beet', 'cabbage', 'beef', 'eggs', 'flour', 'milk', 'tomato', 'pasta', 'cheese', 'garlic', 'sourcream', 'butter', 'chicken', 'mince', 'rice', 'greens', 'cucumber']);
    update();
    document.getElementById('блюда').scrollIntoView({ behavior: 'smooth' });
  });
  $('#tabs').addEventListener('click', (e) => {
    const t = e.target.closest('.tab');
    if (!t) return;
    activeCat = t.dataset.cat;
    renderResults();
  });
  $('#results').addEventListener('click', (e) => {
    if (e.target.closest('.shop')) return; // ссылка на магазин — не открываем рецепт
    const card = e.target.closest('.card');
    if (card) openRecipe(card.dataset.dish);
  });
  $('#results').addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('card')) {
      e.preventDefault();
      openRecipe(e.target.dataset.dish);
    }
  });
  const modal = $('#modal');
  $('#modalClose').addEventListener('click', () => modal.close());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); });

  // ----- старт -----
  renderGroups();
  update();
})();
