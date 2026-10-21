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

  return { parseGrid, parseWorkbook };
})();
if (typeof module !== 'undefined') module.exports = Parser;
