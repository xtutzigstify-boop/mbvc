/* load.js — раздел «Нагрузка» (админка): группа — предмет — семестры — всего — преподаватель.
   По этим данным строится расписание. */

(() => {
  const { toast, esc, hue, icon, unique } = App;
  const $ = sel => document.querySelector(sel);
  const lf = { group: '', q: '', side: '' };   // фильтры: группа слева, текст сверху
  let editingId = null;

  const fmt = n => (n ? String(Math.round(n * 10) / 10).replace('.', ',') : '');
  const sorted = rows => rows.slice().sort((a, b) => a.group.localeCompare(b.group, 'ru', { numeric: true }) || a.subject.localeCompare(b.subject, 'ru'));
  const visible = () => {
    const q = lf.q.trim().toLowerCase();
    return sorted(Store.loadRows().filter(r => (!lf.group || r.group === lf.group) && (!q || [r.group, r.subject, r.teacher].join(' ').toLowerCase().includes(q))));
  };

  /* ---------- Переключение разделов ---------- */
  function setSection(name) {
    if (name === 'load' && document.body.dataset.admin !== '1') return toast('Раздел «Нагрузка» доступен администратору');
    document.body.dataset.section = name;
    $('#scheduleView').hidden = name === 'load';
    $('#loadView').hidden = name !== 'load';
    $('#mode').hidden = name === 'load';
    $('#q').placeholder = name === 'load' ? 'Поиск группы   ( / )' : 'Поиск   ( / )';
    $('#q').value = '';
    lf.side = '';
    document.querySelectorAll('#section button').forEach(b => b.classList.toggle('on', b.dataset.section === name));
    $('#side').classList.remove('open');
    const view = name === 'load' ? $('#loadView') : $('#scheduleView');
    view.classList.remove('view-in'); void view.offsetWidth; view.classList.add('view-in');   // плавная смена экрана
    render();
  }

  function render() {
    if (!App.inLoad()) return App.render();
    renderSide(); renderStats(); renderTable();
  }

  /* ---------- Левая колонка: группы с количеством записей ---------- */
  function renderSide() {
    const rows = Store.loadRows(), q = lf.side.trim().toLowerCase(), sum = Planner.summary(rows, Store.settings());
    const groups = unique(rows.map(r => r.group)).filter(g => g.toLowerCase().includes(q));
    $('#list').innerHTML = `<button class="it ${lf.group ? '' : 'on'}" data-lg="">${icon('users')}Все группы<em>${rows.length}</em></button>`
      + groups.map(g => `<button class="it ${lf.group === g ? 'on' : ''}" data-lg="${esc(g)}"><span class="dot" style="--h:${hue(g)}"></span>${esc(g)}<em>${rows.filter(r => r.group === g).length}</em></button>`).join('');
    $('#foot').innerHTML = `<b>${rows.length}</b> записей · <b>${sum.hours.toLocaleString('ru-RU')}</b> ч`;
  }

  /* ---------- Счётчики и предупреждения ---------- */
  function countUp(el, to) {
    const start = performance.now();
    const tick = t => {
      const k = Math.min(1, (t - start) / 700);
      el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))).toLocaleString('ru-RU');
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function renderStats() {
    const rows = Store.loadRows(), set = Store.settings(), sum = Planner.summary(rows, set);
    $('#loadSem').value = set.sem; $('#loadWeeks').value = set.weeks;
    $('#loadMeta').textContent = rows.length ? `${rows.length} записей · за год ${sum.total.toLocaleString('ru-RU')} ч · ≈ ${fmt(sum.pairs)} пар в неделю` : 'Заполните нагрузку — по ней строится расписание';
    const cards = [['users', sum.groups, 'Групп'], ['book', sum.subjects, 'Предметов'], ['user', sum.teachers, 'Преподавателей'], ['clock', sum.hours, `Часов в ${set.sem} семестре`], ['grid', sum.pairs, 'Пар в неделю']];
    $('#loadStats').innerHTML = cards.map(([ic, v, label], i) => `<div class="kpi" style="animation-delay:${i * 60}ms"><span class="kpi-i">${icon(ic)}</span><b>${fmt(v) || 0}</b><span>${label}</span></div>`).join('');
    document.querySelectorAll('.kpi b').forEach((el, i) => { if (Number.isInteger(cards[i][1]) && cards[i][1] > 0) countUp(el, cards[i][1]); });
    const warn = sum.warnings;
    $('#loadWarn').innerHTML = warn.slice(0, 3).map(w => `<p class="lw ${w.level}">⚠ ${esc(w.text)}</p>`).join('') + (warn.length > 3 ? `<p class="lw soft">…и ещё предупреждений: ${warn.length - 3}</p>` : '');
  }

  /* ---------- Таблица ---------- */
  function renderTable() {
    const rows = Store.loadRows(), list = visible(), set = Store.settings();
    if (!rows.length) {
      $('#loadTable').innerHTML = `<div class="empty"><b>Нагрузка пока пустая</b><p>Добавьте записи вручную, загрузите таблицу из Excel или возьмите за основу текущее расписание.</p>
        <div class="btnrow"><button class="btn primary" data-act="add">${icon('plus')}Добавить</button><button class="btn" data-act="import">${icon('up')}Импорт из Excel</button><button class="btn" data-act="seed">${icon('reset')}Заполнить из расписания</button></div></div>`;
      return;
    }
    if (!list.length) { $('#loadTable').innerHTML = '<div class="empty"><b>Ничего не найдено</b>Попробуйте другой фильтр</div>'; return; }
    $('#loadTable').innerHTML = `<table><thead><tr><th>Группа</th><th>Предмет</th><th>Преподаватель</th><th class="num">1 сем</th><th class="num">2 сем</th><th class="num">Всего</th><th class="num">Пар / нед</th></tr></thead><tbody>`
      + list.map(r => `<tr data-id="${r.id}"><td><span class="gchip" style="--h:${hue(r.group)}">${esc(r.group)}</span></td><td>${esc(r.subject)}</td><td>${esc(r.teacher) || '—'}</td>
        <td class="num ${set.sem === 1 ? '' : 'dim'}">${fmt(r.sem1)}</td><td class="num ${set.sem === 2 ? '' : 'dim'}">${fmt(r.sem2)}</td><td class="num"><b>${fmt(r.total)}</b></td>
        <td class="num">${fmt(Planner.weeklyUnits(Planner.hoursFor(r, set.sem), set.weeks)) || '—'}</td></tr>`).join('') + '</tbody></table>';
  }

  /* ---------- Запись нагрузки (вручную) ---------- */
  function formValues() {
    const f = $('#loadForm').elements, sem1 = +f.sem1.value || 0, sem2 = +f.sem2.value || 0;
    return { group: f.group.value.trim(), subject: f.subject.value.trim(), teacher: f.teacher.value.trim(), sem1, sem2, total: +f.total.value || sem1 + sem2 };
  }

  function updateHint() {
    const v = formValues(), set = Store.settings(), u = Planner.weeklyUnits(Planner.hoursFor(v, set.sem), set.weeks);
    $('#loadForm').elements.total.placeholder = v.sem1 + v.sem2 || 'авто';
    $('#lhint').textContent = u ? `≈ ${fmt(u)} пар в неделю (${set.sem} семестр, ${set.weeks} нед.)` : v.total ? `В ${set.sem} семестре часов нет — пары не появятся` : 'Укажите часы';
  }

  function openDialog(id) {
    editingId = id || null;
    const r = id ? Store.loadRows().find(x => x.id === id) : { group: lf.group, subject: '', teacher: '', sem1: '', sem2: '', total: '' };
    const L = Store.lessons(), rows = Store.loadRows(), fill = (el, list) => $(el).innerHTML = unique(list).map(v => `<option value="${esc(v)}">`).join('');
    fill('#dl-group', [...L.map(l => l.group), ...rows.map(x => x.group)]);
    fill('#dl-subject', [...L.map(l => l.subject), ...rows.map(x => x.subject)]);
    fill('#dl-teacher', [...L.flatMap(l => Rules.split(l.teacher)), ...rows.flatMap(x => Rules.split(x.teacher))]);
    const f = $('#loadForm').elements;
    for (const k of ['group', 'subject', 'teacher', 'sem1', 'sem2', 'total']) f[k].value = r[k] || '';
    $('#ltitle').textContent = id ? 'Изменить запись' : 'Новая запись нагрузки';
    $('#ldel').hidden = !id;
    updateHint();
    $('#loadDlg').showModal();
  }

  function saveDialog(e) {
    if (e.submitter?.value !== 'ok') return;
    const v = formValues();
    if (!v.total) { e.preventDefault(); updateHint(); return; }
    const rows = Store.loadRows();
    Store.setLoad(editingId ? rows.map(r => r.id === editingId ? { ...r, ...v } : r) : [...rows, v]);
    toast(editingId ? 'Запись обновлена' : 'Запись добавлена');
  }

  /* ---------- Импорт и экспорт ---------- */
  async function readLoad(file) {
    const name = file.name.toLowerCase();
    if (/\.xlsx?$/.test(name)) {
      if (!window.XLSX) throw new Error('библиотека Excel не загрузилась — нужен интернет');
      const wb = XLSX.read(await file.arrayBuffer());
      return Parser.parseLoadWorkbook(wb.SheetNames.map(n => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '', raw: false })));
    }
    const text = (await file.text()).replace(/^\ufeff/, ''), sep = text.split('\n')[0].includes(';') ? ';' : ',';
    return Parser.parseLoadGrid(text.split(/\r?\n/).map(line => line.split(sep)));
  }

  async function importLoad(file) {
    try {
      const list = await readLoad(file);
      if (!list.length) throw new Error('не нашла строк нагрузки (нужны столбцы «группы» и «предметы»)');
      const have = Store.loadRows(), key = r => [r.group, r.subject, r.teacher].join('\t');
      const replace = !have.length || confirm(`Найдено записей: ${list.length}.\nОК — заменить всю нагрузку.\nОтмена — добавить к текущей (совпадающие записи обновятся).`);
      Store.setLoad(replace ? list : [...have.filter(o => !list.some(n => key(n) === key(o))), ...list]);
      toast(`Импортировано записей: ${list.length}`);
    } catch (err) { toast('Ошибка импорта: ' + err.message, 6000); }
  }

  function exportLoad() {
    const rows = sorted(Store.loadRows()).map(r => [r.group, r.subject, r.sem1 || '', r.sem2 || '', r.total, r.teacher].join(';'));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + ['Группа;Предмет;1 сем;2 сем;Всего;Преподаватель', ...rows].join('\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = 'nagruzka.csv'; a.click(); URL.revokeObjectURL(a.href);
    toast('Скачан nagruzka.csv — его же можно загрузить обратно');
  }

  function seedFromSchedule() {
    if (Store.loadRows().length && !confirm('Заменить текущую нагрузку расчётом из расписания?')) return;
    Store.setLoad(Planner.fromSchedule(Store.lessons(), Store.settings()));
    toast('Нагрузка рассчитана из текущего расписания');
  }

  /* ---------- События ---------- */
  function bind() {
    $('#section').onclick = e => { const b = e.target.closest('button'); if (b) setSection(b.dataset.section); };
    $('#list').addEventListener('click', e => {
      const b = e.target.closest('[data-lg]');
      if (!b || !App.inLoad()) return;
      lf.group = b.dataset.lg; $('#side').classList.remove('open'); renderSide(); renderTable();
    });
    $('#q').addEventListener('input', e => { if (App.inLoad()) { lf.side = e.target.value; renderSide(); } });
    $('#lq').oninput = e => { lf.q = e.target.value; renderTable(); };
    $('#loadSem').onchange = e => Store.setSettings({ sem: +e.target.value });
    $('#loadWeeks').onchange = e => Store.setSettings({ weeks: Math.min(30, Math.max(8, +e.target.value || 18)) });

    $('#loadView').addEventListener('click', e => {
      const act = e.target.closest('[data-act]')?.dataset.act, row = e.target.closest('tr[data-id]');
      if (act === 'add') openDialog(); else if (act === 'import') $('#loadFile').click(); else if (act === 'seed') seedFromSchedule();
      else if (row) openDialog(row.dataset.id);
    });
    $('#loadAdd').onclick = () => openDialog();
    $('#loadImport').onclick = () => $('#loadFile').click();
    $('#loadFile').onchange = e => { if (e.target.files[0]) importLoad(e.target.files[0]); e.target.value = ''; };
    $('#loadExport').onclick = exportLoad;
    $('#loadClear').onclick = () => { if (Store.loadRows().length && confirm('Удалить всю нагрузку?')) { Store.setLoad([]); toast('Нагрузка очищена'); } };
    $('#themeBtn2').onclick = App.toggleThemes;
    $('#menu2').onclick = () => $('#side').classList.add('open');
    $('#loadGenerate').onclick = () => {
      if (!Store.loadRows().length) return toast('Сначала заполните нагрузку');
      setSection('schedule'); App.generate();   // показываем экран расписания, там пары «разлетаются» и «раздаются» заново
    };

    $('#loadForm').oninput = updateHint;
    $('#loadForm').onsubmit = saveDialog;
    $('#ldel').onclick = () => { Store.setLoad(Store.loadRows().filter(r => r.id !== editingId)); $('#loadDlg').close(); toast('Запись удалена'); };
    Store.onChange(() => { if (App.inLoad()) { renderSide(); renderStats(); renderTable(); } });
  }

  bind();
  window.Load = { setSection };
})();
