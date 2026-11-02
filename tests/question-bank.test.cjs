const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const bank = require('../question-bank.js');
const root = path.resolve(__dirname, '..');

function parseTeacherText() {
  const text = fs.readFileSync(path.join(root, '教師用_精選題庫.txt'), 'utf8');
  const heads = [...text.matchAll(/^(\d{2})\. ［([^／]+)／([^］]+)］(.*)$/gm)];
  return heads.map((head, index) => {
    const body = text.slice(head.index + head[0].length, index + 1 < heads.length ? heads[index + 1].index : text.length);
    const options = [...body.matchAll(/^   \(([A-D])\) (.*)$/gm)];
    return { id: 'q' + head[1], sourceNumber: Number(head[1]), category: head[2], scope: head[3], prompt: head[4],
      options: options.map(option => option[2]), correctIndex: 'ABCD'.indexOf(body.match(/答案：\(([A-D])\)/)[1]),
      explanation: body.match(/^   解析：(.*)$/m)[1] };
  });
}
function teacherQuestions() {
  const core = fs.readFileSync(path.join(root, 'teacher-core.js'), 'utf8');
  const start = core.indexOf('function questionCandidates(');
  const end = core.indexOf('\nasync function triggerCollision', start);
  assert.ok(start >= 0 && end > start, 'locate actual question-selection code');
  const storage = new Map();
  let seed = 42;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const context = vm.createContext({ window: { GAME_QUESTION_BANK: bank },
    Math: Object.assign(Object.create(Math), { random }),
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    accidentSummaryFor: () => '教學事故背景', console });
  vm.runInContext('let usedQuestionIds=new Set(),questionSerial=0;function pick(values){return values[Math.floor(Math.random()*values.length)]}', context);
  vm.runInContext(core.slice(start, end), context);
  return { context, run: code => vm.runInContext(code, context) };
}
const caseExpression = kind => `({kind:${JSON.stringify(kind === 'player' ? 'player' : 'npc')},meta:{hitRun:${kind === 'hitRun'}},victims:[{name:'小安'},{name:'小晴'}]})`;
const fill = (text, kind) => text.replaceAll('{{A}}', '小安').replaceAll('{{B}}', kind === 'player' ? '小晴' : '一部小客車');

test('teacher-edited bank has28 retained questions and preserves all revised content exactly', () => {
  assert.equal(bank.version, '8.4');
  assert.equal(bank.count, 28);
  for (const question of bank.questions) assert.doesNotMatch([question.prompt, ...question.options, question.explanation].join(' '), /NPC/);
  assert.deepEqual(bank.questions, parseTeacherText());
  assert.deepEqual(Array.from({ length: 32 }, (_, index) => index + 1).filter(number => !bank.questions.some(q => q.sourceNumber === number)), [9, 15, 21, 26]);
  assert.equal(fs.existsSync(path.join(root, '教師用_精選32題題庫.txt')), false);
  for (const question of bank.questions) {
    assert.equal(question.options.length, 4);
    assert.ok(question.correctIndex >= 0 && question.correctIndex < 4);
    assert.ok(Object.isFrozen(question) && Object.isFrozen(question.options));
  }
  const negative = bank.questions.find(q => q.sourceNumber === 31);
  assert.match(negative.prompt, /較非必要/);
  assert.equal(negative.options[negative.correctIndex], '車體受損維修估價單');
  assert.equal(bank.questions.find(q => q.sourceNumber === 1).options[1], '交換聯絡方式、談妥賠償金額後即可離開');
  assert.equal(bank.questions.find(q => q.sourceNumber === 13).options[0], '只要{{A}}受傷了，便可以依法去向對方的保險公司申請理賠。');
});

test('game selection uses retained scopes and never exposes removed questions', () => {
  const teacher = teacherQuestions();
  const union = new Set();
  for (const [kind, count] of [['player', 18], ['npc', 18], ['hitRun', 21]]) {
    const pool = teacher.run(`questionCandidates(${caseExpression(kind)})`);
    assert.equal(pool.length, count, kind);
    for (const q of pool) {
      union.add(q.id);
      assert.ok(q.scope === 'all' || q.scope === (kind === 'player' ? 'player' : 'npc') || (kind === 'hitRun' && q.scope === 'hitRun'));
      assert.ok(![9, 15, 21, 26].includes(q.sourceNumber));
    }
  }
  assert.equal(union.size, bank.count);
});

test('actual game draws every retained question without repeats and preserves answers after shuffling', () => {
  const teacher = teacherQuestions();
  const seen = new Set();
  let shuffled = false;
  for (let turn = 0; turn < 180 && seen.size < bank.count; turn++) {
    const kind = ['player', 'npc', 'hitRun'][turn % 3];
    const result = teacher.run(`buildQuestion(${caseExpression(kind)})`);
    if (result.templateId.startsWith('dynamic_')) continue;
    const source = bank.questions.find(q => q.id === result.templateId);
    assert.ok(source);
    assert.equal(seen.has(source.id), false, 'fixed questions do not repeat in a round');
    seen.add(source.id);
    assert.equal(result.prompt, fill(source.prompt, kind));
    assert.equal(result.explanation, fill(source.explanation, kind));
    assert.doesNotMatch([result.prompt, ...result.options, result.explanation, result.accidentSummary].join(' '), /NPC/);
    assert.equal(result.options[result.correctIndex], fill(source.options[source.correctIndex], kind));
    assert.deepEqual([...result.options].sort(), source.options.map(text => fill(text, kind)).sort());
    if (result.correctIndex !== source.correctIndex) shuffled = true;
  }
  assert.equal(seen.size, 28);
  assert.equal(shuffled, true, 'correct answers are moved when options shuffle');
});

test('dynamic fallback begins only after the selected case has exhausted its retained fixed questions', () => {
  const teacher = teacherQuestions();
  const count = teacher.run(`questionCandidates(${caseExpression('player')}).length`);
  for (let index = 0; index < count; index++) {
    assert.equal(teacher.run(`buildQuestion(${caseExpression('player')}).templateId.startsWith('dynamic_')`), false);
  }
  assert.equal(teacher.run(`buildQuestion(${caseExpression('player')}).templateId.startsWith('dynamic_')`), true);
});


test('all generated small-car accident summaries use classroom wording without NPC jargon', () => {
  const core = fs.readFileSync(path.join(root, 'teacher-core.js'), 'utf8');
  const start = core.indexOf('function npcCrashLine('), end = core.indexOf('function selfCrashLine(', start);
  const context = vm.createContext({});
  vm.runInContext(core.slice(start, end), context);
  for (const pattern of ['rear', 'leftTurn', 'merge', 'cross']) for (const hitRun of [false, true]) for (const playerCauses of [false, true]) {
    const result = vm.runInContext(`npcCrashLine({name:'小安'},${JSON.stringify({pattern,hitRun,playerCauses})})`, context);
    assert.doesNotMatch(result, /NPC|一輛一部|一部小客車汽車/);
    assert.match(result, /小客車/);
  }
  const teacher = teacherQuestions();
  assert.doesNotMatch(teacher.run(`fallbackQuestion(${caseExpression('npc')}).prompt`), /NPC/);
});
