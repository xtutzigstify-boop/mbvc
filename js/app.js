/* app.js — интерфейс: список, «идёт сейчас», день/неделя, редактор, проверка, импорт/экспорт, темы */

(() => {
  const DAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница'];
  const SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт'];
  const PAIRS = [1, 2, 3, 4, 5, 6];
  // Расписание звонков (минуты от полуночи). В понедельник пары короче и есть кураторский час
  const BELLS = [[510, 600], [610, 700], [740, 830], [840, 930], [940, 1030], [1040, 1130]];
  const BELLS_MON = [[510, 590], [640, 720], [760, 840], [850, 930], [940, 1020], [1030, 1110]];
  const CURATOR = [600, 630];
  const bellsOf = day => (day === 0 ? BELLS_MON : BELLS);
  const THEMES = { vanilla: 'Ваниль', sage: 'Шалфей', sky: 'Небо', lagoon: 'Лагуна', rosewood: 'Палисандр' };
  const KINDS = { group: 'Группа', teacher: 'Преподаватель', room: 'Кабинет' };
  const MODE_ICON = { group: 'users', teacher: 'user', room: 'door' };
  const HUES = [345, 85, 210, 28, 165, 275];   // розовый, шалфей, небо, персик, бирюза, сирень

  const $ = sel => document.querySelector(sel);
  const icon = name => `<svg class="i"><use href="#i-${name}"/></svg>`;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const hue = s => HUES[[...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % HUES.length];
  const hm = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  const unique = list => [...new Set(list.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const scatter = () => `--sx:${(Math.random() - .5) * 520 | 0}px;--sy:${(Math.random() - .5) * 420 | 0}px;--sr:${(Math.random() - .5) * 50 | 0}deg`;

  const nowInfo = () => { const d = new Date(), w = d.getDay(); return { day: w >= 1 && w <= 5 ? w - 1 : -1, min: d.getHours() * 60 + d.getMinutes() }; };
  const ui = { mode: 'group', value: null, view: 'day', day: Math.max(0, nowInfo().day), q: '', week: 0, anim: '' };
  let editing = null, dragId = null, generating = false;
  const inLoad = () => document.body.dataset.section === 'load';
  const canEdit = () => document.body.dataset.admin === '1';

  /* ---------- Выборки ---------- */
  const ENTITIES = {
    group: L => unique(L.map(l => l.group)),
    teacher: L => unique(L.flatMap(l => Rules.split(l.teacher))),
    room: L => unique(L.flatMap(l => Rules.split(l.room))),
  };
  const matches = (l, mode, value) => mode === 'group' ? l.group === value : Rules.split(mode === 'teacher' ? l.teacher : l.room).includes(value);
  const weekOk = l => !ui.week || !l.week || l.week === ui.week;
  const mine = () => Store.lessons().filter(l => matches(l, ui.mode, ui.value));

  // пары дня по номерам: [[номер, [уроки]], ...] и разбивка уроков одной пары по группам
  function bySlot(list) {
    const m = new Map();
    for (const l of list) { if (!m.has(l.pair)) m.set(l.pair, []); m.get(l.pair).push(l); }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }
  function byGroup(items) {
    const m = new Map();
    for (const l of items) { if (!m.has(l.group)) m.set(l.group, []); m.get(l.group).push(l); }
    return [...m.values()];
  }

  function toast(text, ms = 3800) {
    const el = document.createElement('div');
    el.className = 'toast'; el.textContent = text;
    $('#toasts').append(el);
    setTimeout(() => el.remove(), ms);
  }

  /* ---------- Боковой список и поиск ---------- */
  function renderList() {
    const L = Store.lessons(), t = nowInfo(), q = ui.q.trim().toLowerCase();
    if (!ENTITIES[ui.mode](L).includes(ui.value)) { const all = ENTITIES[ui.mode](L); ui.value = all.includes('ПО-33') ? 'ПО-33' : all[0]; }
    // пока в поиске что-то набрано, ищем сразу по группам, преподавателям и кабинетам
    const modes = q ? Object.keys(ENTITIES) : [ui.mode];
    const items = modes.flatMap(mode => ENTITIES[mode](L).filter(v => v.toLowerCase().includes(q)).map(v => ({ mode, v })));
    $('#list').innerHTML = items.map(({ mode, v }) => {
      const own = L.filter(l => matches(l, mode, v));
      const busy = mode !== 'group' && t.day >= 0 && own.some(l => { const [s, e] = bellsOf(t.day)[l.pair - 1]; return l.day === t.day && t.min >= s && t.min < e; });
      const status = mode === 'group' ? '' : busy ? 'busy' : t.day >= 0 && t.min >= 510 && t.min < 1130 ? 'free' : '';
      const on = mode === ui.mode && v === ui.value;
      return `<button class="it ${on ? 'on' : ''}" data-mode="${mode}" data-val="${esc(v)}">${q ? icon(MODE_ICON[mode]) : `<span class="dot ${status}" style="--h:${HUES[[...v].reduce((h, c) => h + c.charCodeAt(0), 0) % 6]}"></span>`}${esc(v)}<em>${new Set(own.map(l => l.day * 10 + l.pair)).size}</em></button>`;
    }).join('') || '<p class="empty">Ничего не найдено</p>';
    $('#list .on')?.scrollIntoView({ block: 'center' });
  }

  /* ---------- Шапка, «идёт сейчас», вкладки дней ---------- */
  function renderHead() {
    $('#kind').textContent = KINDS[ui.mode];
    $('#title').textContent = ui.value || '';
    const L = mine(), days = [0, 1, 2, 3, 4].map(d => new Set(L.filter(l => l.day === d).map(l => l.pair)));
    const total = days.reduce((s, a) => s + a.size, 0);
    const windows = days.reduce((s, a) => { const p = [...a]; return p.length ? s + Math.max(...p) - Math.min(...p) + 1 - p.length : s; }, 0);
    $('#meta').textContent = `${total} пар в неделю · ${windows ? 'окон: ' + windows : 'без окон'} · по дням: ${days.map(a => a.size).join(' / ')}`;
  }

  function renderLive() {
    const t = nowInfo(), box = $('#live'), slots = bySlot(mine().filter(l => l.day === t.day && weekOk(l)));
    let cur = null, next = null;
    for (const [pair, items] of slots) {
      const [s, e] = bellsOf(t.day)[pair - 1];
      if (t.min >= s && t.min < e) cur = { pair, items, s, e };
      else if (t.min < s && !next) next = { pair, items, s, e };
    }
    const title = items => [...new Set(items.map(l => l.subject))].join(' // ');
    const info = items => [...new Set(items.flatMap(l => [l.teacher, l.room && 'ауд. ' + l.room, ui.mode !== 'group' && l.group]))].filter(Boolean).join(' · ');
    if (!cur && t.day === 0 && ui.mode === 'group' && t.min >= CURATOR[0] && t.min < CURATOR[1]) {
      box.className = 'live next';
      box.innerHTML = `<span class="lv"><i></i>Кураторский час</span><b>Идёт кураторский час</b><small>до ${hm(CURATOR[1])}, осталось ${CURATOR[1] - t.min} мин</small>`;
    } else if (cur) {
      box.className = 'live';
      box.innerHTML = `<span class="lv"><i></i>Идёт сейчас · ${cur.pair} пара</span><b>${esc(title(cur.items))}</b><small>${esc(info(cur.items))} · до ${hm(cur.e)}, осталось ${cur.e - t.min} мин</small>
        <div class="bar2"><span style="--p:${(t.min - cur.s) / (cur.e - cur.s)}"></span></div>`;
    } else if (next) {
      box.className = 'live next';
      box.innerHTML = `<span class="lv">${icon('clock')}Далее · через ${next.s - t.min} мин</span><b>${esc(title(next.items))}</b><small>${next.pair} пара, ${hm(next.s)} · ${esc(info(next.items))}</small>`;
    } else {
      box.className = 'live idle';
      box.innerHTML = `<span class="lv">${icon('clock')}Сейчас</span><b>${t.day < 0 ? 'Сегодня выходной' : slots.length ? 'На сегодня пары закончились' : 'Сегодня пар нет'}</b>`;
    }
  }

  function renderDays() {
    const t = nowInfo(), L = mine();
    $('#days').innerHTML = DAYS.map((d, i) => {
      const n = new Set(L.filter(l => l.day === i).map(l => l.pair)).size;
      return `<button class="tab ${i === ui.day ? 'on' : ''} ${i === t.day ? 'today' : ''}" data-day="${i}">${SHORT[i]}<small>${n} пар</small></button>`;
    }).join('');
    $('#days').hidden = ui.view === 'week';
    $('#copyDay').hidden = ui.view === 'week';
  }

  /* ---------- Карточки ---------- */
  function chips(l) {
    const jump = (mode, val) => `<button class="chip" data-mode="${mode}" data-val="${esc(val)}">${icon(MODE_ICON[mode])}${esc(val)}</button>`;
    return Rules.split(l.teacher).map(v => jump('teacher', v)).join('') + Rules.split(l.room).map(v => jump('room', v)).join('')
      + (ui.mode !== 'group' ? jump('group', l.group) : '');
  }

  // Карточка пары одной группы; при чередовании недель внутри две части
  function cardHtml(items, bad) {
    const warn = items.map(l => bad.get(l.id)).find(Boolean);
    const parts = items.map(l => `<div class="part" data-id="${l.id}">${l.week ? `<span class="wk">${l.week} неделя</span>` : ''}<h3>${esc(l.subject)}</h3><div class="chips">${chips(l)}</div></div>`).join('');
    return `<article class="card ${warn ? 'bad' : ''}" style="--h:${hue(items[0].subject)};${scatter()}" title="${esc(warn || '')}">${parts}</article>`;
  }

  /* ---------- Вид «День» и «Неделя» ---------- */
  function curatorRow() {
    return `<div class="row"><div class="time"><b>${icon('clock')}</b>${hm(CURATOR[0])}<br>${hm(CURATOR[1])}</div><div class="stack"><article class="card" style="--h:28;cursor:default"><h3>Кураторский час</h3></article></div></div>`;
  }

  function renderDay(bad) {
    const t = nowInfo(), all = mine().filter(l => l.day === ui.day), list = all.filter(weekOk);
    let curDone = ui.day !== 0 || ui.mode !== 'group', i = 0;
    const rows = bySlot(list).map(([pair, items]) => {
      const [s, e] = bellsOf(ui.day)[pair - 1];
      const before = !curDone && pair >= 2 ? (curDone = true, curatorRow()) : '';
      const state = t.day === ui.day ? (t.min >= e ? 'done' : t.min >= s ? 'now' : '') : '';
      return before + `<div class="row ${state}" style="--i:${i++};${scatter()}"><div class="time"><b>${pair}</b>${hm(s)}<br>${hm(e)}</div><div class="stack">${byGroup(items).map(g => cardHtml(g, bad)).join('')}</div></div>`;
    }).join('') + (!curDone && list.length ? curatorRow() : '');
    const free = PAIRS.find(p => !all.some(l => l.pair === p));
    $('#stage').innerHTML = `<div class="dayrows">${rows || '<div class="empty"><b>В этот день пар нет</b>Можно отдохнуть или добавить пару</div>'}
      ${free ? `<button class="add" data-day="${ui.day}" data-pair="${free}">${icon('plus')}Добавить пару</button>` : ''}</div>`;
  }

  function renderWeek(bad) {
    const t = nowInfo(), L = mine().filter(weekOk);
    let n = 0, html = '<div></div>' + SHORT.map((d, i) => `<div class="wh ${i === t.day ? 'today' : ''}">${d}</div>`).join('');
    for (const p of PAIRS) {
      html += `<div class="wp">${p}</div>`;
      for (let d = 0; d < 5; d++) {
        const cards = byGroup(L.filter(l => l.day === d && l.pair === p)).map(g => {
          const meta = ui.mode === 'group' ? g.map(l => l.teacher).filter(Boolean).join(' / ') : g[0].group;
          const room = [...new Set(g.map(l => l.room).filter(Boolean))].join(', ');
          return `<article class="card ${g.some(l => bad.has(l.id)) ? 'bad' : ''}" draggable="${canEdit()}" data-id="${g[0].id}" style="--h:${hue(g[0].subject)};--i:${n++};${scatter()}"><h3>${esc(g.map(l => l.subject).join(' / '))}</h3><small>${esc(meta)}${room ? ' · ' + esc(room) : ''}</small></article>`;
        }).join('');
        const [s, e] = bellsOf(d)[p - 1];
        html += `<div class="cell ${t.day === d && t.min >= s && t.min < e ? 'now' : ''}" data-day="${d}" data-pair="${p}">${cards}</div>`;
      }
    }
    $('#stage').innerHTML = `<div class="week">${html}</div>`;
  }

  function renderStage() {
    const bad = Rules.findConflicts(Store.lessons());
    (ui.view === 'day' ? renderDay : renderWeek)(bad);
    $('#stage').className = 'stage ' + ui.anim;
    if (!inLoad()) $('#foot').innerHTML = `<b>${new Set(Store.lessons().map(l => l.group + l.day + l.pair)).size}</b> пар · ${bad.size ? `<span class="bad">накладок: ${bad.size}</span>` : 'накладок нет ✓'}`;
  }

  function renderAll() {
    if (!inLoad()) renderList();
    renderHead(); renderLive(); renderDays(); renderStage();
    ui.anim = '';
  }

  /* ---------- Редактор пары ---------- */
  function fillDatalists() {
    const L = Store.lessons(), fill = (id, list) => $(id).innerHTML = unique(list).map(v => `<option value="${esc(v)}">`).join('');
    fill('#dl-group', L.map(l => l.group)); fill('#dl-subject', L.map(l => l.subject));
    fill('#dl-teacher', L.flatMap(l => Rules.split(l.teacher))); fill('#dl-room', L.flatMap(l => Rules.split(l.room)));
  }

  function openEditor(lesson) {
    editing = lesson; fillDatalists();
    const f = $('#form').elements;
    for (const k of ['group', 'subject', 'teacher', 'room']) f[k].value = lesson[k] || '';
    f.week.value = lesson.week || 0;
    $('#etitle').textContent = `${DAYS[lesson.day]}, ${lesson.pair} пара`;
    $('#del').hidden = !lesson.id;
    updateHint();
    $('#editor').showModal();
  }

  const candidate = () => {
    const f = $('#form').elements;
    return { ...editing, group: f.group.value.trim(), subject: f.subject.value.trim(), teacher: f.teacher.value.trim(), room: f.room.value.trim(), week: +f.week.value };
  };

  // Подсказка: занят ли преподаватель/кабинет в это время, не слишком ли много пар у группы
  function updateHint() {
    const c = candidate(), L = Store.lessons().filter(l => l.id !== editing.id);
    const hit = L.find(l => l.group !== c.group && Rules.clash(c, l));
    const load = new Set(L.filter(l => l.group === c.group && l.day === c.day).map(l => l.pair)).size;
    $('#hint').textContent = hit ? `⚠ ${Rules.clash(c, hit)} (группа ${hit.group})` : load >= 5 ? `⚠ У группы уже ${load} пар в этот день` : '✓ Накладок нет';
  }

  function saveEditor() {
    const c = candidate();
    // в одной группе в одно время только одна пара (кроме чередования недель)
    const rest = Store.lessons().filter(l => l.id !== editing.id && !(l.group === c.group && l.day === c.day && l.pair === c.pair && (!l.week || !c.week || l.week === c.week)));
    Store.change([...rest, c]);
  }

  function moveLesson(id, day, pair) {
    const L = Store.lessons(), l = L.find(x => x.id === id);
    if (!l || (l.day === day && l.pair === pair)) return;
    const at = (d, p) => x => x.group === l.group && x.day === d && x.pair === p;   // если клетка занята — пары меняются местами
    Store.change(L.map(x => at(l.day, l.pair)(x) ? { ...x, day, pair } : at(day, pair)(x) ? { ...x, day: l.day, pair: l.pair } : x));
    toast('Пара перенесена');
  }

  /* ---------- Генерация с анимацией ---------- */
  async function generate() {
    if (generating) return;
    const rows = Store.loadRows(), plan = Planner.draft(rows, Store.settings());
    if (rows.length && !plan.lessons.length) return toast('В «Нагрузке» нет часов для выбранного семестра');
    const source = rows.length ? plan.lessons : Store.base();
    const ask = rows.length ? 'Составить новое расписание по «Нагрузке»? Пары сами разойдутся по дням без окон и без накладок у преподавателей. Это можно отменить кнопкой ↶'
      : 'Перемешать расписание? Возьмём реальное за основу: число пар в дне ±1, без окон и без накладок у преподавателей. Это можно отменить кнопкой ↶';
    if (!confirm(ask)) return;
    generating = true;
    const btn = $('#generate'), label = btn.querySelector('span');
    btn.classList.add('busy'); label.textContent = 'Перемешиваю…';
    $('#stage').classList.add('shuffling');                       // карточки разлетаются, пока считаем
    const started = performance.now();
    const { lessons } = await Generator.run(source, Math.floor(Math.random() * 1e9), p => btn.style.setProperty('--p', p));
    await sleep(Math.max(0, 750 - (performance.now() - started)));
    ui.anim = 'deal';
    Store.change(lessons);                                        // карточки «раздаются» на новые места
    const left = new Set([...Rules.findConflicts(Store.lessons()).keys()]).size;
    btn.classList.remove('busy'); label.textContent = 'Сгенерировать'; btn.style.removeProperty('--p');
    generating = false;
    const lost = plan.skipped.reduce((n, g) => n + g.count, 0);
    toast((left ? `Готово. Остались накладки: ${left} — у перегруженных преподавателей, подробности в «Проверке»` : 'Готово: окон нет, накладок нет ✨') + (lost ? ` · не поместилось пар: ${lost}` : ''), 6000);
  }

  /* ---------- Свободные преподаватели и кабинеты ---------- */
  function openFinder() {
    const t = nowInfo(), now = bellsOf(Math.max(0, t.day)).findIndex(([s, e]) => t.min < e);
    $('#fd').innerHTML = DAYS.map((d, i) => `<option value="${i}">${d}</option>`).join('');
    $('#fp').innerHTML = PAIRS.map(p => `<option value="${p}">${p} пара</option>`).join('');
    $('#fd').value = Math.max(0, t.day); $('#fp').value = now < 0 ? 1 : now + 1;
    renderFinder();
    $('#finderDlg').showModal();
  }

  function renderFinder() {
    const all = Store.lessons(), here = all.filter(l => l.day === +$('#fd').value && l.pair === +$('#fp').value);
    const free = (mode, key) => {
      const busy = new Set(here.flatMap(l => Rules.split(l[key])));
      return ENTITIES[mode](all).filter(v => !busy.has(v)).map(v => `<button class="chip" data-mode="${mode}" data-val="${esc(v)}">${esc(v)}</button>`).join('') || 'Все заняты';
    };
    $('#freeT').innerHTML = free('teacher', 'teacher');
    $('#freeR').innerHTML = free('room', 'room');
  }

  /* ---------- Проверка расписания ---------- */
  function openChecker() {
    const L = Store.lessons(), bad = Rules.findConflicts(L), seen = new Set(), rows = [];
    for (const l of L.filter(x => bad.has(x.id))) {
      const key = `${l.day}|${l.pair}|${bad.get(l.id)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(`<button class="it" data-mode="group" data-val="${esc(l.group)}" data-day="${l.day}">${DAYS[l.day]}, ${l.pair} пара — ${esc(bad.get(l.id))}<em>${esc(l.group)}</em></button>`);
    }
    // загрузка: сколько клеток недели (из 30) занято у преподавателя или кабинета
    const load = new Map();
    for (const l of L) for (const n of [...(Rules.isPE(l.subject) ? [] : Rules.split(l.teacher)), ...Rules.split(l.room)]) {
      if (!load.has(n)) load.set(n, new Set());
      load.get(n).add(l.day * 10 + l.pair);
    }
    const heavy = [...load].filter(([, s]) => s.size >= 28).sort((a, b) => b[1].size - a[1].size);
    $('#checkBody').innerHTML = (rows.length ? `<h4>Накладки: ${rows.length}</h4>${rows.join('')}` : '<p class="ok">Накладок нет ✓</p>')
      + (heavy.length ? `<h4>Почти нет свободных клеток</h4>${heavy.map(([n, s]) => `<p class="meta">${esc(n)} — занято ${s.size} из 30 клеток недели</p>`).join('')}` : '');
    $('#checkDlg').showModal();
  }

  /* ---------- Импорт и экспорт ---------- */
  function exportFile() {
    const rows = Store.lessons().map(l => [l.group, l.day + 1, l.pair, l.subject, l.teacher, l.room, l.week || 0].join(';'));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + ['группа;день;пара;предмет;преподаватель;кабинет;неделя', ...rows].join('\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = 'schedule.csv'; a.click(); URL.revokeObjectURL(a.href);
    toast('Скачан schedule.csv (день: 1 = понедельник, неделя: 0 = каждая)');
  }

  async function readFile(file) {
    const name = file.name.toLowerCase();
    if (/\.xlsx?$/.test(name)) {
      if (!window.XLSX) throw new Error('библиотека Excel не загрузилась — нужен интернет');
      const wb = XLSX.read(await file.arrayBuffer());
      return Parser.parseWorkbook(wb.SheetNames.map(n => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '', raw: false })));
    }
    const text = await file.text();
    if (name.endsWith('.json')) { const d = JSON.parse(text); return (d.lessons || d).map(({ id, ...l }) => l); }
    return text.replace(/^\ufeff/, '').split(/\r?\n/).slice(1).filter(Boolean).map(line => {
      const [group, day, pair, subject, teacher = '', room = '', week = 0] = line.split(';').map(s => s.trim());
      return { group, day: +day - 1, pair: +pair, subject, teacher, room, week: +week || 0 };
    });
  }

  async function importFile(file) {
    try {
      const list = (await readFile(file)).filter(l => l.group && l.subject && l.day >= 0 && l.day < 5 && l.pair >= 1 && l.pair <= 6);
      if (!list.length) throw new Error('не нашла ни одной корректной пары');
      const replace = confirm(`Найдено пар: ${list.length}.\nОК — заменить всё расписание (оно станет «реальным» для генератора).\nОтмена — добавить к текущему (совпадающие пары обновятся).`);
      const base = replace ? [] : Store.lessons().filter(o => !list.some(n => n.group === o.group && n.day === o.day && n.pair === o.pair));
      Store.change([...base, ...list], replace);
      toast(`Импортировано пар: ${list.length}`);
    } catch (err) { toast('Ошибка импорта: ' + err.message, 6000); }
  }

  function copyDay() {
    const lines = bySlot(mine().filter(l => l.day === ui.day && weekOk(l))).map(([pair, items]) => {
      const [s, e] = bellsOf(ui.day)[pair - 1];
      return `${pair}) ${hm(s)}–${hm(e)}  ${items.map(l => [l.subject, l.teacher, l.room && 'ауд. ' + l.room].filter(Boolean).join(', ')).join('  //  ')}`;
    });
    navigator.clipboard.writeText(`${ui.value} · ${DAYS[ui.day]}\n${lines.join('\n') || 'Пар нет'}`).then(() => toast('Скопировано — можно вставить в чат'), () => toast('Не удалось скопировать'));
  }

  /* ---------- Темы ---------- */
  function setTheme(name) {
    document.documentElement.dataset.theme = name;
    localStorage.setItem('po33-theme', name);
    document.querySelectorAll('#themes button').forEach(b => b.classList.toggle('on', b.dataset.theme === name));
  }

  function bindTheme() {
    $('#themes').innerHTML = Object.entries(THEMES).map(([k, v]) => `<button data-theme="${k}"><i></i>${v}</button>`).join('');
    $('#themeBtn').onclick = e => { e.stopPropagation(); $('#fileMenu').hidden = true; $('#themes').hidden = !$('#themes').hidden; };
    $('#themes').onclick = e => { const b = e.target.closest('button'); if (b) setTheme(b.dataset.theme); };
    setTheme(localStorage.getItem('po33-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'lagoon' : 'vanilla'));
  }

  /* ---------- События ---------- */
  function select(mode, value, day) {
    ui.mode = mode; ui.value = value; ui.q = ''; $('#q').value = '';
    if (day !== undefined) ui.day = +day;
    $('#side').classList.remove('open');
    renderAll();
  }

  function bindStage() {
    const stage = $('#stage');
    stage.onclick = e => {
      const chip = e.target.closest('.chip[data-mode]'), part = e.target.closest('[data-id]'), add = e.target.closest('.add'), cell = e.target.closest('.cell');
      if (chip) return select(chip.dataset.mode, chip.dataset.val);
      if (!canEdit()) return;
      if (part) return openEditor(Store.lessons().find(l => l.id === part.dataset.id));
      const spot = add || cell;
      if (spot) openEditor({ day: +spot.dataset.day, pair: +spot.dataset.pair, week: 0, group: ui.mode === 'group' ? ui.value : '', teacher: ui.mode === 'teacher' ? ui.value : '', room: ui.mode === 'room' ? ui.value : '' });
    };
    stage.onmousemove = e => {   // световое пятно под курсором
      const c = e.target.closest('.card'); if (!c) return;
      const r = c.getBoundingClientRect();
      c.style.setProperty('--mx', e.clientX - r.left + 'px'); c.style.setProperty('--my', e.clientY - r.top + 'px');
    };
    stage.ondragstart = e => { const c = e.target.closest('.card'); if (c && canEdit()) { dragId = c.dataset.id; c.classList.add('drag'); } };
    stage.ondragend = () => { dragId = null; stage.querySelectorAll('.drag,.over').forEach(x => x.classList.remove('drag', 'over')); };
    stage.ondragover = e => { const c = e.target.closest('.cell'); if (c && dragId) { e.preventDefault(); stage.querySelectorAll('.over').forEach(x => x.classList.remove('over')); c.classList.add('over'); } };
    stage.ondrop = e => { const c = e.target.closest('.cell'); if (c && dragId) moveLesson(dragId, +c.dataset.day, +c.dataset.pair); };
  }

  function bindControls() {
    $('#mode').onclick = e => { const b = e.target.closest('button'); if (!b || inLoad()) return; ui.mode = b.dataset.mode; ui.value = null; document.querySelectorAll('#mode button').forEach(x => x.classList.toggle('on', x === b)); renderAll(); };
    $('#list').onclick = e => { const b = inLoad() ? null : e.target.closest('.it'); if (b) { document.querySelectorAll('#mode button').forEach(x => x.classList.toggle('on', x.dataset.mode === b.dataset.mode)); select(b.dataset.mode, b.dataset.val); } };
    $('#q').oninput = e => { if (inLoad()) return; ui.q = e.target.value; renderList(); };
    $('#q').onkeydown = e => { if (e.key === 'Enter') $('#list .it')?.click(); };
    $('#view').onclick = e => { const b = e.target.closest('button'); if (!b) return; ui.view = b.dataset.view; document.querySelectorAll('#view button').forEach(x => x.classList.toggle('on', x === b)); renderDays(); renderStage(); };
    $('#weeks').onclick = e => { const b = e.target.closest('button'); if (!b) return; ui.week = +b.dataset.week; document.querySelectorAll('#weeks button').forEach(x => x.classList.toggle('on', x === b)); renderLive(); renderStage(); };
    $('#days').onclick = e => { const b = e.target.closest('.tab'); if (b) { ui.day = +b.dataset.day; renderDays(); renderStage(); } };
    $('#menu').onclick = () => $('#side').classList.add('open');
    $('#closeSide').onclick = $('#scrim').onclick = () => $('#side').classList.remove('open');

    $('#generate').onclick = generate;
    $('#finder').onclick = openFinder;
    $('#fd').onchange = $('#fp').onchange = renderFinder;
    $('#foot').onclick = () => { if (!inLoad()) openChecker(); };
    $('#copyDay').onclick = copyDay;
    $('#undo').onclick = () => toast(Store.undo() ? 'Отменено' : 'Нечего отменять');
    $('#fileBtn').onclick = e => { e.stopPropagation(); $('#themes').hidden = true; $('#fileMenu').hidden = !$('#fileMenu').hidden; };
    $('#fileMenu').onclick = e => {
      const act = e.target.closest('button')?.dataset.act;
      if (act === 'import') $('#file').click();
      if (act === 'export') exportFile();
      if (act === 'print') window.print();
      if (act === 'reset' && confirm('Вернуть реальное расписание из файла? Текущее заменится (можно отменить ↶).')) { Store.reset(); toast('Реальное расписание возвращено'); }
    };
    document.addEventListener('click', () => { $('#themes').hidden = true; $('#fileMenu').hidden = true; });
    $('#file').onchange = e => { if (e.target.files[0]) importFile(e.target.files[0]); e.target.value = ''; };
    $('#login').onclick = () => Store.signIn();
    $('#push').onclick = async () => {
      const b = $('#push'); b.classList.add('busy');
      try { await Store.push(); toast('Сохранено в Supabase ☁'); } catch (err) { toast('Облако: ' + err.message + ' (нужен вход)'); }
      b.classList.remove('busy');
    };
    $('#push').hidden = $('#login').hidden = !Store.cloud;

    $('#form').oninput = updateHint;
    $('#form').onsubmit = e => { if (e.submitter?.value === 'ok') saveEditor(); };
    $('#del').onclick = () => { Store.change(Store.lessons().filter(l => l.id !== editing.id)); $('#editor').close(); };
    document.querySelectorAll('dialog [data-close]').forEach(b => b.onclick = () => b.closest('dialog').close());
    for (const id of ['#finderDlg', '#checkDlg']) {
      $(id).addEventListener('click', e => {
        const b = e.target.closest('[data-mode]'); if (!b) return;
        document.querySelectorAll('#mode button').forEach(x => x.classList.toggle('on', x.dataset.mode === b.dataset.mode));
        select(b.dataset.mode, b.dataset.val, b.dataset.day);
        $(id).close();
      });
    }

    // печать всегда рисует неделю целиком
    let before = 'day';
    window.onbeforeprint = () => { before = ui.view; ui.view = 'week'; renderStage(); };
    window.onafterprint = () => { ui.view = before; renderStage(); };

    document.addEventListener('keydown', e => {
      const typing = /INPUT|SELECT/.test(document.activeElement.tagName) || document.querySelector('dialog[open]');
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); Store.undo(); }
      else if (e.key === '/' && !typing) { e.preventDefault(); $('#q').focus(); }
      else if (!typing && !inLoad() && ui.view === 'day' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { ui.day = (ui.day + (e.key === 'ArrowRight' ? 1 : 4)) % 5; renderDays(); renderStage(); }
    });
    setInterval(() => { if (!generating) { renderLive(); renderStage(); } }, 30000);   // «идёт сейчас» обновляется сам
  }

  // Общие помощники для admin.js и load.js
  window.App = { toast, esc, hue, icon, unique, generate, inLoad, render: renderAll,
    toggleThemes: e => { e.stopPropagation(); $('#fileMenu').hidden = true; $('#themes').hidden = !$('#themes').hidden; } };

  // Первая загрузка: данные приходят асинхронно (в том числе из облака), заставка сменяется плавным появлением
  const reveal = () => { document.body.classList.remove('booting'); setTimeout(() => $('#splash')?.remove(), 1000); };
  Store.onChange(() => renderAll());
  bindTheme(); bindStage(); bindControls();
  Promise.all([Store.init(), sleep(600)]).then(reveal, reveal);
})();
