(() => {
  const $ = (s) => document.querySelector(s);
  const byId = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));
  const STORE_KEY = 'holodilnik-produkty';

  const SHOPS = [
    { id: 'lavka', name: 'Купить в Яндекс Лавке', url: (q) => 'https://lavka.yandex.ru/search?text=' + encodeURIComponent(q) },
  ];

  // ----- фильтры -----
  // group: фильтры из одной группы взаимоисключающие (нельзя «до 30 минут» и «до часа» сразу)
  const FILTERS = [
    { id: 't30', name: '⏱ До 30 минут', group: 'time', test: (d) => d.time <= 30 },
    { id: 't60', name: '⏱ До часа', group: 'time', test: (d) => d.time <= 60 },
    { id: 'halal', name: '🌙 Халяль', test: (d) => isHalal(d) },
    { id: 'light', name: '🥗 Лёгкие — до 150 ккал', test: (d) => NUTRITION[d.id] && kcalOf(NUTRITION[d.id]) <= 150 },
    { id: 'veg', name: '🌱 Без мяса и рыбы', test: (d) => d.ing.every((i) => byId[i].g !== 'meat') },
    { id: 'kids', name: '👶 Детям', test: (d) => KIDS.includes(d.id) },
    { id: 'protein', name: '💪 Много белка — от 10 г', test: (d) => NUTRITION[d.id] && NUTRITION[d.id].b >= 10 },
  ];
  const FILTER_KEY = 'holodilnik-filtry';

  // ----- состояние -----
  let selected = new Set();
  let activeCat = 'all';
  let filters = new Set();
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    if (Array.isArray(saved)) selected = new Set(saved.filter((id) => byId[id]));
    const savedF = JSON.parse(localStorage.getItem(FILTER_KEY) || '[]');
    if (Array.isArray(savedF)) filters = new Set(savedF.filter((id) => FILTERS.some((f) => f.id === id)));
  } catch (e) { /* хранилище недоступно — просто начинаем с нуля */ }

  const save = () => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify([...selected]));
      localStorage.setItem(FILTER_KEY, JSON.stringify([...filters]));
    } catch (e) { /* ничего */ }
  };
  const passFilters = (d) => FILTERS.every((f) => !filters.has(f.id) || f.test(d));

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
  // Халяль: нет свинины/колбас/желатина (или они только «по желанию»)
  const isHalal = (d) => d.ing.every((i) => !HARAM.includes(i) || isOptional(d, i));  const catName = (id) => (CATEGORIES.find((c) => c.id === id) || {}).name;

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
      <div class="card__img"><img src="img/${d.id}.jpg" alt="${esc(d.name)}" loading="lazy"></div>
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

  function renderFilters() {
    const on = filters.size > 0;
    $('#filters').innerHTML =
      `<span class="filters__label">Фильтры:</span>` +
      FILTERS.map((f) => `<button type="button" class="filter" data-f="${f.id}" aria-pressed="${filters.has(f.id)}">${f.name}</button>`).join('') +
      (on ? '<button type="button" class="link filters__reset" id="filtersReset">Сбросить фильтры</button>' : '');
    $('#filtersNote').textContent = filters.has('halal')
      ? '🌙 Халяль — блюда без свинины, колбас, сосисок и желатина. Мясо, фарш и курицу бери с маркировкой «Халяль».'
      : '';
  }

  // Какой один продукт выгоднее всего докупить: сколько блюд он «откроет» целиком
  function bestBuysHTML(pool) {
    const gain = {};
    pool.forEach((d) => {
      const m = missingOf(d);
      if (m.length === 1) gain[m[0]] = (gain[m[0]] || 0) + 1;
    });
    const top = Object.entries(gain).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (!top.length) return '';
    return `<div class="bestbuy"><span class="bestbuy__label">💡 Выгоднее всего докупить:</span>${top.map(([id, n]) =>
      `<a class="bestbuy__item" href="https://lavka.yandex.ru/search?text=${encodeURIComponent(searchName(byId[id].name))}" target="_blank" rel="noopener" title="Найти в Яндекс Лавке">
        <b>${byId[id].name}</b> — откроется ещё ${n} ${plural(n, 'блюдо', 'блюда', 'блюд')}</a>`).join('')}</div>`;
  }

  function renderResults() {
    const inCat = (d) => activeCat === 'all' || d.cat === activeCat;
    const out = $('#results');
    const pool = DISHES.filter(passFilters);
    const fNote = filters.size ? ' (с учётом фильтров)' : '';
    const noneForFilters = '<div class="nothing"><b>Под эти фильтры ничего нет</b>Попробуй снять один из фильтров.</div>';
    renderFilters();

    if (selected.size === 0) {
      renderTabs(pool);
      $('#resultsHint').textContent = filters.size
        ? `Продукты не выбраны — показываем все блюда под фильтры: ${pool.length}.`
        : 'Пока продукты не выбраны, показываем все блюда. Отметь продукты выше — и мы подберём подходящие.';
      const list = pool.filter(inCat);
      out.innerHTML = list.length
        ? `<div class="block"><div class="cards">${list.map((d) => cardHTML(d, 'all')).join('')}</div></div>`
        : noneForFilters;
      return;
    }

    const ready = pool.filter((d) => missingOf(d).length === 0);
    const almost = pool.filter((d) => { const m = missingOf(d).length; return m >= 1 && m <= 2; })
      .sort((a, b) => missingOf(a).length - missingOf(b).length || b.ing.length - a.ing.length);
    renderTabs([...ready, ...almost]);

    const r = ready.filter(inCat);
    const a = almost.filter(inCat);
    $('#resultsHint').textContent = ready.length
      ? `Из твоих продуктов получится ${ready.length} ${plural(ready.length, 'блюдо', 'блюда', 'блюд')}, и ещё ${almost.length} — если докупить немного${fNote}.`
      : `Готовых вариантов пока нет — но вот что получится, если докупить пару продуктов${fNote}.`;

    let html = '';
    html += `<div class="block"><div class="block__head"><h3>Можно приготовить <em>сейчас</em></h3><span>все продукты есть</span></div>`;
    html += r.length
      ? `<div class="cards">${r.map((d) => cardHTML(d, 'match')).join('')}</div>`
      : '<div class="nothing"><b>Пока ничего</b>Отметь ещё продукты или загляни в блок ниже.</div>';
    html += '</div>';
    html += `<div class="block"><div class="block__head"><h3>Докупи <em>1–2 продукта</em></h3><span>и можно готовить</span></div>`;
    html += bestBuysHTML(pool);
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

  // ----- «Поделиться» -----
  // Ссылка ведёт сразу на рецепт: адрес сайта + #r=id (сайт откроет это блюдо)
  const siteURL = () => location.origin + location.pathname;
  const dishURL = (d) => `${siteURL()}#r=${d.id}`;
  const missingNames = (d) => missingOf(d).map((pid) => byId[pid].name);

  function recipeText(d) {
    const ings = d.ing.map((pid) => '• ' + byId[pid].name + (isOptional(d, pid) ? ' (по желанию)' : '')).join('\n');
    const steps = d.steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
    return `🍲 ${d.name} — ${minutes(d.time)}\n\nПродукты:\n${ings}\n+ соль, перец, масло — по вкусу\n\nКак готовить:\n${steps}`;
  }
  const listText = (title, names) => `🛒 ${title}\n\n${names.map((n) => '• ' + n).join('\n')}`;

  // Кнопка «Поделиться»: на телефоне — системное меню (Телеграм, WhatsApp, ВК…),
  // на компьютере — раскрываются кнопки Телеграм / WhatsApp / Скопировать
  const canNativeShare = () => !!navigator.share && matchMedia('(pointer: coarse)').matches;
  function shareBlockHTML(kind, label) {
    return `<div class="share" data-kind="${kind}">
      <button type="button" class="btn share__btn" data-share="${kind}">↗ ${label}</button>
      <div class="share__opts" hidden>
        <a class="share__opt" data-to="tg" href="#" target="_blank" rel="noopener">Телеграм</a>
        <a class="share__opt" data-to="wa" href="#" target="_blank" rel="noopener">WhatsApp</a>
        <button type="button" class="share__opt" data-to="copy">Скопировать</button>
      </div>
    </div>`;
  }
  async function copyText(text, btn) {
    try { await navigator.clipboard.writeText(text); }
    catch (e) {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta);
      ta.select(); try { document.execCommand('copy'); } catch (e2) { /* ничего */ } ta.remove();
    }
    if (btn) { const old = btn.textContent; btn.textContent = 'Скопировано ✓'; setTimeout(() => (btn.textContent = old), 1600); }
  }
  // payload: { title, text, url } — что именно отправляем
  function wireShare(root, getPayload) {
    root.querySelectorAll('.share').forEach((box) => {
      const kind = box.dataset.kind;
      const opts = box.querySelector('.share__opts');
      box.querySelector('.share__btn').addEventListener('click', async () => {
        const p = getPayload(kind);
        if (canNativeShare()) {
          try { await navigator.share({ title: p.title, text: p.text, url: p.url }); } catch (e) { /* отменили */ }
          return;
        }
        const full = p.text + (p.url ? '\n\n' + p.url : '');
        opts.querySelector('[data-to="tg"]').href = `https://t.me/share/url?url=${encodeURIComponent(p.url || siteURL())}&text=${encodeURIComponent(p.text)}`;
        opts.querySelector('[data-to="wa"]').href = `https://wa.me/?text=${encodeURIComponent(full)}`;
        opts.querySelector('[data-to="copy"]').onclick = (e) => copyText(full, e.currentTarget);
        opts.hidden = !opts.hidden;
      });
    });
  }

  function openRecipe(id, opts = {}) {
    const d = DISHES.find((x) => x.id === id);
    if (!d) return;
    const hasAny = selected.size > 0;
    // сначала обязательные, потом «по желанию»
    const order = [...d.ing.filter((i) => !isOptional(d, i)), ...d.ing.filter((i) => isOptional(d, i))];
    const ings = order.map((pid) => {
      const p = byId[pid];
      const have = selected.has(pid);
      const opt = isOptional(d, pid);
      const optTag = opt
        ? `<small class="opt">${HARAM.includes(pid) ? 'по желанию · для халяль не добавляй' : 'по желанию'}</small>`
        : '';
      if (!hasAny) return `<li class="have${opt ? ' optional' : ''}"><span class="mark">•</span><span>${p.name}</span>${optTag}</li>`;
      if (have) return `<li class="have"><span class="mark">✓</span><span>${p.name}</span>${optTag}</li>`;
      if (opt) return `<li class="optional"><span class="mark">–</span><span>${p.name}</span>${optTag}</li>`;
      return `<li class="need"><span class="mark">✕</span><span>${p.name}</span>${shopsHTML(p.name)}</li>`;
    }).join('');
    const miss = hasAny ? missingNames(d) : [];
    $('#modalBody').innerHTML = `<div class="recipe">
      ${opts.back ? '<button type="button" class="link recipe__back" id="backToWeek">← К меню на неделю</button>' : ''}
      <div class="recipe__top">
        <div class="recipe__img"><img src="img/${d.id}.jpg" alt="${esc(d.name)}"></div>
        <div>
          <p class="eyebrow"><i></i>${CUISINES[d.cui]}</p>
          <h2 id="mTitle">${d.name}</h2>
          <div class="recipe__meta"><span class="pill">${catName(d.cat)}</span><span class="pill">⏱ ${minutes(d.time)}</span><span class="pill">${d.ing.length} ${plural(d.ing.length, 'продукт', 'продукта', 'продуктов')}</span>${isHalal(d) ? '<span class="pill pill--halal" title="Без свинины, колбас и желатина"><b lang="ar">حلال</b> Халяль</span>' : ''}</div>
          <p>${d.desc}</p>
          <div class="share-row">
            ${shareBlockHTML('recipe', 'Поделиться рецептом')}
            ${miss.length ? shareBlockHTML('list', 'Отправить список покупок') : ''}
          </div>
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
    wireShare($('#modalBody'), (kind) => kind === 'list'
      ? { title: 'Список покупок', text: listText(`Купить для «${d.name}»:`, miss), url: dishURL(d) }
      : { title: d.name, text: recipeText(d), url: dishURL(d) });
    const back = $('#backToWeek');
    if (back) back.addEventListener('click', openWeek);
    showModal();
  }

  function showModal() {
    const m = $('#modal');
    if (!m.open) { if (typeof m.showModal === 'function') m.showModal(); else m.setAttribute('open', ''); }
    m.scrollTop = 0;
  }

  // ----- Меню на неделю -----
  const DAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
  const DINNER_CATS = ['soup', 'hot', 'pasta', 'pizza', 'burger', 'bake']; // на ужин — без завтраков, десертов и закусок
  const CAT_LIMIT = { soup: 2, hot: 3, pasta: 2, pizza: 1, burger: 1, bake: 1 };
  const WEEK_KEY = 'holodilnik-menu';
  let week = [];
  try {
    const saved = JSON.parse(localStorage.getItem(WEEK_KEY) || '[]');
    if (Array.isArray(saved)) week = saved.filter((id) => DISHES.some((d) => d.id === id));
  } catch (e) { /* ничего */ }
  const saveWeek = () => { try { localStorage.setItem(WEEK_KEY, JSON.stringify(week)); } catch (e) { /* ничего */ } };

  // Кандидаты: подходят под фильтры, сначала те, что можно приготовить сразу, потом — с докупкой.
  // Внутри одинаковых — случайный порядок, чтобы меню было разным.
  function weekCandidates() {
    return DISHES.filter((d) => DINNER_CATS.includes(d.cat) && passFilters(d))
      .map((d) => ({ d, m: missingOf(d).length, r: Math.random() }))
      .sort((a, b) => a.m - b.m || a.r - b.r)
      .map((x) => x.d);
  }
  function buildWeek() {
    const pool = weekCandidates();
    const out = [];
    const count = {};
    const fits = (d) => (count[d.cat] || 0) < (CAT_LIMIT[d.cat] || 1) && (!out.length || out[out.length - 1].cat !== d.cat);
    for (const d of pool) { if (out.length === 7) break; if (fits(d)) { out.push(d); count[d.cat] = (count[d.cat] || 0) + 1; } }
    for (const d of pool) { if (out.length === 7) break; if (!out.includes(d)) out.push(d); } // если строго не набралось
    week = out.map((d) => d.id);
    saveWeek();
  }
  function replaceDay(i) {
    const cur = DISHES.find((d) => d.id === week[i]);
    const pool = weekCandidates().filter((d) => !week.includes(d.id));
    const next = pool.find((d) => cur && d.cat === cur.cat) || pool[0];
    if (next) { week[i] = next.id; saveWeek(); }
  }
  // Общий список покупок: чего не хватает на всю неделю, без повторов, с пометкой «для каких блюд»
  function weekShopping(dishes) {
    const need = new Map();
    dishes.forEach((d) => missingOf(d).forEach((pid) => {
      if (!need.has(pid)) need.set(pid, []);
      need.get(pid).push(d.name);
    }));
    return [...need.entries()].map(([pid, for_]) => ({ pid, name: byId[pid].name, for_ }));
  }

  function openWeek() {
    if (!week.length) buildWeek();
    const dishes = week.map((id) => DISHES.find((d) => d.id === id)).filter(Boolean);
    const shop = weekShopping(dishes);
    const fNote = filters.size ? ' Учтены включённые фильтры.' : '';
    const hint = selected.size
      ? `Собрано из твоих продуктов: сначала то, что можно приготовить сразу.${fNote}`
      : `Продукты не выбраны — поэтому меню просто разнообразное, а список покупок полный. Отметь продукты, и меню подстроится.${fNote}`;
    $('#modalBody').innerHTML = `<div class="week">
      <p class="eyebrow"><i></i>7 ужинов</p>
      <h2 id="mTitle">Меню на <em>неделю</em></h2>
      <p class="week__hint">${hint}</p>
      <ol class="week__days">${dishes.map((d, i) => {
        const m = missingOf(d).length;
        return `<li class="week__day">
          <span class="week__dname">${DAYS[i]}</span>
          <button type="button" class="week__dish" data-open="${d.id}">
            <img src="img/${d.id}.jpg" alt="">
            <span><b>${d.name}</b><small>${catName(d.cat)} · ${minutes(d.time)}${NUTRITION[d.id] ? ' · ≈ ' + kcalOf(NUTRITION[d.id]) + ' ккал' : ''}</small></span>
          </button>
          <span class="week__st ${m ? 'miss' : 'ok'}">${m ? 'докупить: ' + m : '✓ всё есть'}</span>
          <button type="button" class="link week__swap" data-swap="${i}" title="Подобрать другое блюдо">↻ Заменить</button>
        </li>`;
      }).join('')}</ol>
      <div class="week__shop">
        <h3>Список покупок на неделю</h3>
        ${shop.length
          ? `<ul class="week__list">${shop.map((s) => `<li><span><b>${s.name}</b><small>для: ${s.for_.join(', ')}</small></span>${shopsHTML(s.name)}</li>`).join('')}</ul>
             <div class="share-row">${shareBlockHTML('week', 'Отправить список покупок')}</div>`
          : '<p class="week__hint">Всё есть — докупать ничего не нужно 🎉</p>'}
      </div>
      <div class="share-row">
        ${shareBlockHTML('weekmenu', 'Поделиться меню')}
        <button type="button" class="btn" id="weekRebuild">↻ Собрать заново</button>
      </div>
    </div>`;
    const body = $('#modalBody');
    body.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openRecipe(b.dataset.open, { back: true })));
    body.querySelectorAll('[data-swap]').forEach((b) => b.addEventListener('click', () => { replaceDay(+b.dataset.swap); openWeek(); }));
    $('#weekRebuild').addEventListener('click', () => { buildWeek(); openWeek(); });
    wireShare(body, (kind) => kind === 'week'
      ? { title: 'Список покупок на неделю', text: listText('Купить на неделю:', shop.map((s) => s.name)), url: siteURL() }
      : { title: 'Меню на неделю', text: '📅 Меню на неделю\n\n' + dishes.map((d, i) => `${DAYS[i]} — ${d.name}`).join('\n'), url: siteURL() });
    showModal();
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
  $('#filters').addEventListener('click', (e) => {
    if (e.target.id === 'filtersReset') { filters.clear(); renderResults(); save(); return; }
    const b = e.target.closest('.filter');
    if (!b) return;
    const f = FILTERS.find((x) => x.id === b.dataset.f);
    if (filters.has(f.id)) filters.delete(f.id);
    else {
      if (f.group) FILTERS.filter((x) => x.group === f.group).forEach((x) => filters.delete(x.id));
      filters.add(f.id);
    }
    renderResults();
    save();
  });
  $('#results').addEventListener('click', (e) => {
    if (e.target.closest('.shop') || e.target.closest('.bestbuy')) return; // ссылки на магазин — не открываем рецепт
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
  // закрыли рецепт, открытый по ссылке, — убираем #r=… из адреса, чтобы ссылка снова срабатывала
  modal.addEventListener('close', () => {
    if (location.hash.startsWith('#r=')) history.replaceState(null, '', location.pathname + location.search);
  });

  $('#weekBtn').addEventListener('click', () => openWeek());

  // Ссылка вида …#r=borsch открывает сразу этот рецепт
  function openFromHash() {
    const m = /^#r=([a-z0-9]+)$/.exec(location.hash);
    if (m && DISHES.some((d) => d.id === m[1])) openRecipe(m[1]);
  }
  addEventListener('hashchange', openFromHash);

  // ----- старт -----
  renderGroups();
  update();
  openFromHash();
})();
