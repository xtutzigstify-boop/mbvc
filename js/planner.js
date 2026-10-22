/* planner.js — учебная нагрузка: счётчики, перевод часов в пары и черновик расписания для генератора.
   Пара = 2 академических часа. Часов в семестре / (2 x недель) = пар в неделю; округляем до половины пары,
   а «половинки» (одна пара раз в две недели) объединяем в чередование 1 неделя / 2 неделя. */

const Planner = (() => {
  const DAYS = 5, MAX_WEEK = 30;   // 5 дней x 6 пар

  // Часы выбранного семестра; если часы указаны только «всего» — считаем их часами этого семестра
  const hoursFor = (it, sem) => (sem === 2 ? it.sem2 : it.sem1) || (!it.sem1 && !it.sem2 ? it.total : 0);
  const weeklyUnits = (hours, weeks) => hours > 0 ? Math.max(1, Math.round(hours / weeks)) / 2 : 0;

  function summary(rows, { sem, weeks }) {
    const byGroup = {}, byTeacher = {};
    let hours = 0, total = 0, pairs = 0;
    for (const it of rows) {
      const h = hoursFor(it, sem), u = weeklyUnits(h, weeks);
      hours += h; total += it.total; pairs += u;
      byGroup[it.group] = (byGroup[it.group] || 0) + u;
      Rules.split(it.teacher).forEach(t => byTeacher[t] = (byTeacher[t] || 0) + u);
    }
    const warn = (who, map, label) => Object.entries(map).filter(([, n]) => n > MAX_WEEK - 3).map(([name, n]) => ({
      level: n > MAX_WEEK ? 'bad' : 'soft',
      text: n > MAX_WEEK ? `${label} ${name}: ${n} пар в неделю, а в неделе всего ${MAX_WEEK} клеток — часть пар не поместится`
                         : `${label} ${name}: ${n} пар в неделю — почти нет свободных клеток, возможны накладки`,
    }));
    return {
      groups: new Set(rows.map(r => r.group)).size, subjects: new Set(rows.map(r => r.subject)).size,
      teachers: new Set(rows.flatMap(r => Rules.split(r.teacher))).size, hours, total, pairs,
      warnings: [...warn('g', byGroup, 'Группа'), ...warn('t', byTeacher, 'Преподаватель')],
    };
  }

  // Черновик: пары каждой группы поровну по дням. Дальше его перемешивает Generator
  function draft(rows, { sem, weeks }, rnd = Math.random) {
    const groups = new Map(), lessons = [], skipped = [];
    const part = (it, week) => ({ week, subject: it.subject, teacher: it.teacher || '', room: '' });
    for (const it of rows) {
      const u = weeklyUnits(hoursFor(it, sem), weeks);
      if (!u) continue;
      if (!groups.has(it.group)) groups.set(it.group, { units: [], halves: [] });
      const g = groups.get(it.group);
      for (let i = 0; i < Math.floor(u); i++) g.units.push([part(it, 0)]);
      if (u % 1) g.halves.push(it);
    }
    for (const [group, g] of groups) {
      g.halves.sort(() => rnd() - .5);
      while (g.halves.length) {   // две «половинки» = одна клетка с чередованием недель
        const a = g.halves.pop(), b = g.halves.pop();
        g.units.push(b ? [part(a, 1), part(b, 2)] : [part(a, 1)]);
      }
      g.units.sort(() => rnd() - .5);
      const n = Math.min(g.units.length, MAX_WEEK);
      if (g.units.length > n) skipped.push({ group, count: g.units.length - n });
      const counts = Array(DAYS).fill(Math.floor(n / DAYS));
      [0, 1, 2, 3, 4].sort(() => rnd() - .5).slice(0, n % DAYS).forEach(d => counts[d]++);
      let k = 0;
      counts.forEach((c, day) => { for (let pair = 1; pair <= c; pair++) for (const p of g.units[k++]) lessons.push({ group, day, pair, ...p }); });
    }
    return { lessons, skipped };
  }

  // Нагрузка «задним числом» из готового расписания: пар в неделю x 2 часа x число недель
  function fromSchedule(lessons, { sem, weeks }) {
    const m = new Map();
    for (const l of lessons) { const k = [l.group, l.subject, l.teacher].join('\t'); m.set(k, (m.get(k) || 0) + (l.week ? .5 : 1)); }
    return [...m].map(([k, u]) => {
      const [group, subject, teacher] = k.split('\t'), h = Math.round(u * 2 * weeks);
      return { group, subject, teacher, sem1: sem === 1 ? h : 0, sem2: sem === 2 ? h : 0, total: h };
    });
  }

  return { hoursFor, weeklyUnits, summary, draft, fromSchedule };
})();
