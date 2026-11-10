import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const bank = ['questions.txt', 'growth.txt', 'trade.txt'].flatMap(file =>
  readFileSync(file, 'utf8').trim().split(/\r?\n/).map(line => {
    const [topic, prompt, ...values] = line.split('|');
    assert.ok(['A', 'B', 'C'].includes(topic));
    assert.equal(values.length, 5);
    const explanation = values.pop();
    assert.ok(prompt && explanation && values.every(Boolean));
    assert.equal(new Set(values).size, 4);
    return { topic, prompt, choices: values, explanation };
  })
);
assert.equal(bank.length, 100);
assert.equal(new Set(bank.map(item => item.prompt)).size, 100);
assert.deepEqual(['A', 'B', 'C'].map(topic => bank.filter(item => item.topic === topic).length), [38, 32, 30]);

const assets = {};
for (const [route, file, type] of [
  ['/', 'index.html', 'text/html; charset=utf-8'],
  ['/style.css', 'style.css', 'text/css; charset=utf-8'],
  ['/game.js', 'game.js', 'text/javascript; charset=utf-8'],
  ['/cat.svg', 'cat.svg', 'image/svg+xml']
]) assets[route] = [type, readFileSync('public/' + file, 'utf8')];

mkdirSync('dist/server', { recursive: true });
mkdirSync('dist/.openai', { recursive: true });
if (existsSync('.openai/hosting.json')) copyFileSync('.openai/hosting.json', 'dist/.openai/hosting.json');
writeFileSync('dist/server/index.js',
  'const BANK = ' + JSON.stringify(bank) + ';\nconst ASSETS = ' + JSON.stringify(assets) + ';\n' +
  readFileSync('worker.mjs', 'utf8'));
console.log('Built game with 100 validated questions.');
