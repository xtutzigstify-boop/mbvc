/* parser.js — разбор расписания колледжа из Excel и построение учебного плана.
   Работает и в браузере (глобальный Parser), и в Node (tools/build_seed.js). */

const Parser = (() => {
  const DAY_WORDS = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница'];
  const MAX_PAIR = 6;
  const GROUP_RE = /^\p{L}{1,4}\s*-?\s*\d{2}$/u;                     // ЭМ-11, ЭГС 11, ЭМ - 41, У-11
  const NAME = String.raw`\p{L}[\p{L}-]*\s+\p{L}\.\s?(?:\p{L}\.)?`;  // Фамилия И.О.
  const TEACHER_RE = new RegExp(`(${NAME}(?:\\s*,\\s*${NAME})*)\\s*$`, 'u');

  const norm = s => String(s ?? '').replace(/\s+/g, ' ').trim();
  const groupName = s => norm(s).replace(/\s*-\s*|\s+/g, '-');

  // «Физика     Лондарь П.Н.» -> предмет + преподаватель (в Excel они в одной ячейке)
  function splitTeacher(text) {
    const t = norm(text), m = t.match(TEACHER_RE);
    return m ? { subject: t.slice(0, m.index).trim(), teacher: m[1].replace(/\s*,\s*/g, ', ') } : { subject: t, teacher: '' };
  }

  // Ячейка может быть с чередованием «А // Б»: неделя 1 / неделя 2
  function parseCell(subjectCell, roomCell) {
    const subjects = String(subjectCell ?? '').split('//'), rooms = String(roomCell ?? '').split('//');
    return subjects
      .map((s, i) => ({ ...splitTeacher(s), room: norm(rooms[i]), week: subjects.length > 1 ? i + 1 : 0 }))
      .filter(p => p.subject);
  }

  // Номер пары = номер строки внутри блока дня
  function parseGrid(rows) {
    const lessons = [];
    let groups = [], day = -1, dayRow = 0;
    rows.forEach((row, r) => {
      const heads = row.map((c, col) => GROUP_RE.test(norm(c)) ? { name: groupName(c), col } : null).filter(Boolean);
      if (heads.length) { groups = heads; day = -1; return; }
      const word = groups.map(g => norm(row[g.col]).toLowerCase()).find(s => DAY_WORDS.some(w => s.startsWith(w)));
      if (word) { day = DAY_WORDS.findIndex(w => word.startsWith(w)); dayRow = r; return; }
      const pair = r - dayRow;
      if (day < 0 || pair > MAX_PAIR) return;
      for (const g of groups) {
        for (const p of parseCell(row[g.col], row[g.col + 1])) lessons.push({ group: g.name, day, pair, week: p.week, subject: p.subject, teacher: p.teacher, room: p.room });
      }
    });
    return lessons;
  }

  // Несколько листов: группу берём с первого листа, где она встретилась
  function parseWorkbook(sheets) {
    const seen = new Set(), all = [];
    for (const rows of sheets) {
      const found = parseGrid(rows), groups = new Set(found.map(l => l.group));
      all.push(...found.filter(l => !seen.has(l.group)));
      groups.forEach(g => seen.add(g));
    }
    return all;
  }

  /* ---------- Нагрузка: группа — предмет — семестры — всего — преподаватель ---------- */

  const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.').replace(/[^\d.\-]/g, '')); return Number.isFinite(n) ? n : 0; };

  // «Фамилия И.О.» — человек; «ВАКАНСИЯ», «ставка мастера» и т.п. — не преподаватель, ограничений по нему нет
  const personOrEmpty = text => (/\p{L}\.\s?\p{L}?\.?/u.test(text) ? text : '');
  const HEADER_WORD = /^(предмет|групп|дисциплин|всего|итого|\d)/i;
  const LOOKALIKE = { c: 'с', e: 'е', o: 'о', a: 'а', p: 'р', x: 'х', y: 'у' };

  // Ищем строку-заголовок и запоминаем, в каком столбце что лежит
  function findColumns(row) {
    const cols = {};
    row.forEach((cell, c) => {
      const t = norm(cell).toLowerCase().replace(/[a-z]/g, ch => LOOKALIKE[ch] || ch);   // в Excel часто латинская «c» вместо «с»
      if (/^групп/.test(t)) cols.group = c;
      else if (/^(предмет|дисциплин)/.test(t)) cols.subject = c;
      else if (/^(преподав|педагог)/.test(t)) cols.teacher = c;
      else if (/^1\s*сем/.test(t)) cols.sem1 = c;
      else if (/^2\s*сем/.test(t)) cols.sem2 = c;
      else if (/^семестр/.test(t)) cols.sems = c;
      else if (/^(всего|итого)/.test(t)) cols.total = c;
    });
    return cols.group !== undefined && cols.subject !== undefined ? cols : null;
  }

  // Два формата: «плоский» (преподаватель в своём столбце) и как в таблице колледжа
  // (имя преподавателя отдельной строкой, под ним его группы и предметы)
  function parseLoadGrid(rows) {
    const items = [];
    let cols = null, teacher = '';
    for (const row of rows) {
      const head = findColumns(row);
      if (head) { cols = head; continue; }
      const cells = row.map(norm).filter(Boolean);
      const isName = cells.length === 1 && !HEADER_WORD.test(cells[0]);   // имя преподавателя — отдельная строка из одной ячейки
      if (!cols) { if (isName) teacher = personOrEmpty(cells[0]); continue; }   // оно стоит выше заголовка
      const group = norm(row[cols.group]), subject = norm(row[cols.subject]);
      if (!group) {   // строка без группы, где только текст, — имя преподавателя
        if (isName) teacher = personOrEmpty(cells[0]);
        continue;
      }
      if (!subject || /^(итого|групп)/i.test(group)) continue;
      let sem1 = cols.sem1 !== undefined ? num(row[cols.sem1]) : 0, sem2 = cols.sem2 !== undefined ? num(row[cols.sem2]) : 0;
      const total0 = cols.total !== undefined ? num(row[cols.total]) : 0;
      if (cols.sems !== undefined && !sem1 && !sem2 && total0) {   // столбец «Семестры»: 1, 2 или «1,2»
        const s = norm(row[cols.sems]);
        if (/1/.test(s) && /2/.test(s)) sem1 = sem2 = total0 / 2; else if (/2/.test(s)) sem2 = total0; else sem1 = total0;
      }
      const total = total0 || sem1 + sem2;
      if (!total) continue;
      items.push({ group: GROUP_RE.test(group) ? groupName(group) : group, subject, teacher: cols.teacher !== undefined ? norm(row[cols.teacher]) : teacher, sem1, sem2, total });
    }
    return items;
  }

  const parseLoadWorkbook = sheets => sheets.flatMap(parseLoadGrid);

  return { parseGrid, parseWorkbook, parseLoadGrid, parseLoadWorkbook };
})();
if (typeof module !== 'undefined') module.exports = Parser;
