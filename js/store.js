/* store.js — состояние: localStorage + синхронизация с Supabase.
   lessons — текущее расписание, base — «реальное» (по нему работает генератор и кнопка «вернуть») */

const Store = (() => {
  const LS_KEY = 'po33-schedule-v2';
  const cfg = window.SUPABASE_CONFIG || {};
  const sb = cfg.url && window.supabase ? window.supabase.createClient(cfg.url, cfg.key) : null;

  const state = { lessons: [], base: [] };
  const undoStack = [], subscribers = [];
  let lastId = 0;

  const clone = list => JSON.parse(JSON.stringify(list));
  const withIds = list => list.map(l => ({ week: 0, ...l, id: l.id || 'l' + (++lastId) }));
  const emit = () => subscribers.forEach(fn => fn());
  const persist = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { console.warn('localStorage:', e.message); } };

  async function pull() {
    const { data, error } = await sb.from('sched_lessons').select('*');
    if (error) { console.warn('Supabase:', error.message); return []; }
    return data.map(r => ({ id: r.id, group: r.grp, day: r.day, pair: r.pair, week: r.week, subject: r.subject, teacher: r.teacher || '', room: r.room || '' }));
  }

  // Справочники -> потом уроки (внешние ключи требуют именно такого порядка)
  async function push() {
    const L = state.lessons;
    const names = key => [...new Set(L.map(l => l[key]).filter(Boolean))].map(name => ({ name }));
    for (const [table, key] of [['sched_groups', 'group'], ['sched_teachers', 'teacher'], ['sched_subjects', 'subject'], ['sched_rooms', 'room']]) {
      const { error } = await sb.from(table).upsert(names(key), { onConflict: 'name' });
      if (error) throw error;
    }
    let res = await sb.from('sched_lessons').delete().not('id', 'is', null);
    if (res.error) throw res.error;
    res = await sb.from('sched_lessons').insert(L.map(l => ({ grp: l.group, day: l.day, pair: l.pair, week: l.week || 0, subject: l.subject, teacher: l.teacher || null, room: l.room || null })));
    if (res.error) throw res.error;
  }

  async function init() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) { /* битые данные — начинаем с эталона */ }
    state.base = saved?.base || clone(SEED.lessons);
    state.lessons = saved?.lessons || clone(SEED.lessons);
    if (sb) { const cloud = await pull(); if (cloud.length) state.lessons = cloud; }
    state.lessons.forEach(l => { const m = /^l(\d+)$/.exec(l.id || ''); if (m) lastId = Math.max(lastId, +m[1]); });
    state.lessons = withIds(state.lessons);
    emit();
  }

  // asBase = true: новое расписание становится «реальным» (импорт из Excel)
  function change(next, asBase = false) {
    undoStack.push(JSON.stringify(state.lessons));
    if (undoStack.length > 50) undoStack.shift();
    state.lessons = withIds(next);
    if (asBase) state.base = clone(next.map(({ id, ...l }) => l));
    persist(); emit();
  }

  function undo() {
    const prev = undoStack.pop();
    if (!prev) return false;
    state.lessons = JSON.parse(prev);
    persist(); emit();
    return true;
  }

  return {
    init, change, undo, push,
    reset: () => change(clone(state.base)),
    onChange: fn => subscribers.push(fn),
    lessons: () => state.lessons,
    base: () => state.base,
    signIn: () => sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.href } }),
    cloud: !!sb,
  };
})();
