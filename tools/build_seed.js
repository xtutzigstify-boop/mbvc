// node tools/build_seed.js grid.json  ->  js/seed.js  (grid.json делает tools/xlsx_to_json.py)
const fs = require('fs');
const Parser = require('../js/parser.js');

const lessons = Parser.parseWorkbook(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')));
fs.writeFileSync(__dirname + '/../js/seed.js', `/* Сгенерировано tools/build_seed.js из Excel */\nconst SEED = { lessons: ${JSON.stringify(lessons)} };\n`);
console.log('Пар в seed.js:', lessons.length);
