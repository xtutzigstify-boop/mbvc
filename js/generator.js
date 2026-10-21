/* generator.js — правила расписания и генератор случайного, но реалистичного расписания */

const Rules = (() => {
  const split = s => (s || '').split(',').map(x => x.trim()).filter(Boolean);
  const isPE = s => /физическ|дене/i.test(s || '');

  // Накладка двух пар: тот же день и пара, пересекающиеся недели, общий преподаватель или кабинет.
  // Физкультура потоковая (у одного преподавателя сразу несколько групп) — это не накладка.
  function clash(a, b) {
    if (a.day !== b.day || a.pair !== b.pair || (a.week && b.week && a.week !== b.week)) return '';
    const teacher = !(isPE(a.subject) && isPE(b.subject)) && split(a.teacher).find(t => split(b.teacher).includes(t));
    if (teacher) return `Преподаватель занят: ${teacher}`;
    const room = split(a.room).find(r => split(b.room).includes(r));
    return room ? `Кабинет занят: ${room}` : '';
  }

  function findConflicts(lessons) {
    const slots = new Map(), bad = new Map();
    for (const l of lessons) {
      const key = l.day * 10 + l.pair;
      if (!slots.has(key)) slots.set(key, []);
      slots.get(key).push(l);
    }
    for (const list of slots.values()) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const text = clash(list[i], list[j]);
          if (text) { bad.set(list[i].id, text); bad.set(list[j].id, text); }
        }
      }
    }
    return bad;
  }
  return { split, isPE, clash, findConflicts };
})();

const Generator = (() => {
  const DAYS = 5, PAIRS = 6;
  const POLISH = 16000;     // минимум шагов «шлифовки» мягких правил
  const STALL = 9000;       // сколько шагов ждём улучшения, когда накладки уже не уходят
  const MAX_ITERS = 90000;
  const CHUNK = 400;        // шагов за один кадр — интерфейс не зависает

  function mulberry32(a) {
    return () => {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* ---------- Подготовка: реальное расписание -> группы и «юниты» (содержимое одной клетки) ---------- */

  // Что занимает пара: преподаватели и кабинеты отдельно по неделям (у физкультуры преподаватель не считается)
  function entitiesOf(parts) {
    return parts.flatMap(p => {
      const weeks = p.week ? [p.week] : [1, 2];
      const names = [...(Rules.isPE(p.subject) ? [] : Rules.split(p.teacher).map(n => 't' + n)), ...Rules.split(p.room).map(n => 'r' + n)];
      return names.flatMap(n => weeks.map(w => `${w}|${n}`));
    });
  }

  function prepare(base) {
    const groups = new Map();
    for (const l of base) {
      if (!groups.has(l.group)) groups.set(l.group, { name: l.group, slots: new Map(), counts: Array(DAYS).fill(0) });
      const g = groups.get(l.group), key = l.day * PAIRS + l.pair - 1;
      if (!g.slots.has(key)) { g.slots.set(key, []); g.counts[l.day]++; }
      g.slots.get(key).push(l);
    }
    return [...groups.values()].map(g => {
      g.units = [...g.slots.values()].map(parts => ({ parts, subject: parts[0].subject, ents: entitiesOf(parts), pe: parts.every(p => Rules.isPE(p.subject)) }));
      g.weekly = {};
      g.units.forEach(u => g.weekly[u.subject] = (g.weekly[u.subject] || 0) + 1);
      return g;
    });
  }

  /* ---------- Форма недели: сколько пар в какой день и с какой пары начинается ---------- */

  // Число пар в дне как в реальном расписании ±1, сумма сохраняется. Дни идут подряд, без «окон»;
  // изредка день начинается со 2-й пары
  function newCells(g, rnd) {
    const n = g.counts.slice(), days = n.map((c, d) => d).filter(d => g.counts[d] > 0);
    for (let moves = rnd() * 3 | 0; moves > 0; moves--) {
      const from = days.filter(d => n[d] > Math.max(2, g.counts[d] - 1)), to = days.filter(d => n[d] < Math.min(PAIRS, g.counts[d] + 1));
      if (!from.length || !to.length) break;
      const f = from[rnd() * from.length | 0], t = to[rnd() * to.length | 0];
      if (f !== t) { n[f]--; n[t]++; }
    }
    const cells = [];
    for (const d of days) {
      const start = n[d] < PAIRS && rnd() < .15 ? 1 : 0;
      for (let i = 0; i < n[d]; i++) cells.push(d * PAIRS + start + i);
    }
    return cells;
  }

  /* ---------- Занятость: «клетка|неделя|кто» -> сколько раз занято ---------- */

  function occupy(st, u, cell, sign) {
    for (const e of u.ents) {
      const key = cell + '|' + e, n = st.occ.get(key) || 0;
      if (sign > 0) { if (n) st.hard++; st.occ.set(key, n + 1); }
      else { if (n > 1) st.hard--; n > 1 ? st.occ.set(key, n - 1) : st.occ.delete(key); }
    }
  }

  const reindex = g => {
    g.dayIdx = Array.from({ length: DAYS }, () => []);
    g.cells.forEach((c, i) => g.dayIdx[Math.floor(c / PAIRS)].push(i));
  };

  function layout(g, st, rnd) {
    g.cells = newCells(g, rnd);
    reindex(g);
    g.assign = g.units.slice().sort(() => rnd() - .5);
    g.assign.forEach((u, i) => occupy(st, u, g.cells[i], 1));
  }

  // Мягкие правила одного дня: предмет не повторяется, физкультура не первой парой
  function dayPenalty(g, d) {
    const seen = {}; let pen = 0;
    for (const i of g.dayIdx[d]) {
      const u = g.assign[i];
      if (g.weekly[u.subject] <= 4 && seen[u.subject]) pen += 4;
      seen[u.subject] = 1;
      if (u.pe && g.cells[i] % PAIRS === 0) pen += 2;
    }
    return pen;
  }

  const dayOf = (g, i) => Math.floor(g.cells[i] / PAIRS);
  const cost = (st, g, i, j) => st.hard * 1000 + dayPenalty(g, dayOf(g, i)) + (dayOf(g, i) === dayOf(g, j) ? 0 : dayPenalty(g, dayOf(g, j)));

  function swap(st, g, i, j) {
    const a = g.assign[i], b = g.assign[j];
    occupy(st, a, g.cells[i], -1); occupy(st, b, g.cells[j], -1);
    g.assign[i] = b; g.assign[j] = a;
    occupy(st, b, g.cells[i], 1); occupy(st, a, g.cells[j], 1);
  }

  // Клетки, где прямо сейчас есть накладка
  function hotCells(st, groups) {
    const hot = [];
    for (const g of groups) g.assign.forEach((u, i) => { if (u.ents.some(e => st.occ.get(g.cells[i] + '|' + e) > 1)) hot.push([g, i]); });
    return hot;
  }

  // Меняем форму недели у группы: переносим пару в другой день или сдвигаем день на одну пару.
  // Если накладок стало больше — откатываем
  function reshape(st, g, rnd) {
    const old = { cells: g.cells.slice(), assign: g.assign.slice() }, before = st.hard;
    g.assign.forEach((u, i) => occupy(st, u, g.cells[i], -1));
    const days = Array.from({ length: DAYS }, () => []);
    g.cells.forEach((c, i) => days[Math.floor(c / PAIRS)].push({ pos: c % PAIRS, u: g.assign[i] }));
    days.forEach(a => a.sort((x, y) => x.pos - y.pos));
    const late = () => days.filter(a => a.length && a[0].pos > 0).length;   // дни, начинающиеся не с 1-й пары
    const lateBefore = late();
    const used = days.map((a, d) => d).filter(d => days[d].length), f = used[rnd() * used.length | 0], t = used[rnd() * used.length | 0];
    if (rnd() < .5) {
      const a = days[f], shift = a[0].pos > 0 ? -1 : 1;
      if (a[a.length - 1].pos + shift < PAIRS) a.forEach(x => x.pos += shift);
    } else if (t !== f && days[f].length > Math.max(2, g.counts[f] - 1) && days[t].length < Math.min(PAIRS, g.counts[t] + 1)) {
      const moved = days[f].splice(rnd() * days[f].length | 0, 1)[0], start = days[f][0].pos;
      days[f].forEach((x, k) => x.pos = start + k);
      const last = days[t][days[t].length - 1].pos;
      if (last + 1 < PAIRS) days[t].push({ pos: last + 1, u: moved.u });
      else if (days[t][0].pos > 0) days[t].unshift({ pos: days[t][0].pos - 1, u: moved.u });
      else days[f].push({ pos: start + days[f].length, u: moved.u });   // некуда ставить — возвращаем
    }
    g.cells = []; g.assign = [];
    days.forEach((a, d) => a.forEach(x => { g.cells.push(d * PAIRS + x.pos); g.assign.push(x.u); }));
    g.assign.forEach((u, i) => occupy(st, u, g.cells[i], 1));
    if (st.hard > before || (before === 0 && st.hard === 0 && late() > lateBefore)) {
      g.assign.forEach((u, i) => occupy(st, u, g.cells[i], -1));
      g.cells = old.cells; g.assign = old.assign;
      g.assign.forEach((u, i) => occupy(st, u, g.cells[i], 1));
    }
    reindex(g);
  }

  /* ---------- Главный цикл: меняем пары местами внутри группы, пока не уйдут накладки ---------- */

  const nextFrame = () => new Promise(r => setTimeout(r, 0));

  async function attempt(base, seed, onProgress) {
    const rnd = mulberry32(seed), st = { occ: new Map(), hard: 0 }, groups = prepare(base);
    groups.forEach(g => layout(g, st, rnd));

    let best = Infinity, lastGain = 0;
    for (let it = 0; it < MAX_ITERS && !(it >= POLISH && (st.hard === 0 || it - lastGain > STALL));) {
      let hot = hotCells(st, groups);
      for (let k = 0; k < CHUNK; k++, it++) {
        if (k && k % 100 === 0 && st.hard) { reshape(st, hot.length ? hot[rnd() * hot.length | 0][0] : groups[0], rnd); hot = hotCells(st, groups); }
        const [g, i] = st.hard && hot.length ? hot[rnd() * hot.length | 0] : (() => { const x = groups[rnd() * groups.length | 0]; return [x, rnd() * x.assign.length | 0]; })();
        if (g.assign.length < 2) continue;
        const before = cost(st, g, i, i);
        for (let tries = 0; tries < 6; tries++) {
          const j = rnd() * g.assign.length | 0;
          if (j === i) continue;
          swap(st, g, i, j);
          const after = cost(st, g, i, j);
          if (after < before || (after === before && rnd() < .3)) break;
          swap(st, g, i, j);   // не лучше — откатываем
        }
      }
      if (st.hard < best) { best = st.hard; lastGain = it; }
      onProgress(Math.min(.97, it / POLISH));
      await nextFrame();
    }

    const lessons = [];
    for (const g of groups) {
      g.assign.forEach((u, i) => {
        const day = Math.floor(g.cells[i] / PAIRS), pair = g.cells[i] % PAIRS + 1;
        u.parts.forEach(p => lessons.push({ group: g.name, day, pair, week: p.week, subject: p.subject, teacher: p.teacher, room: p.room }));
      });
    }
    onProgress(1);
    return { lessons, conflicts: st.hard };
  }

  // До двух попыток с разными seed: берём ту, где меньше накладок
  async function run(base, seed, onProgress = () => {}) {
    let best = null;
    for (let k = 0; k < 2; k++) {
      const r = await attempt(base, seed + k * 977, p => onProgress((k + p) / 2));
      if (!best || r.conflicts < best.conflicts) best = r;
      if (best.conflicts <= 6) break;   // дальше остаются только перегруженные преподаватели и кабинеты
    }
    onProgress(1);
    return best;
  }
  return { run };
})();
