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

const nicknameWords = {
  first: ['반짝이는', '씩씩한', '포근한', '용감한', '즐거운', '느긋한', '다정한', '신나는',
    '부지런한', '엉뚱한', '명랑한', '씩씩하게 걷는', '하품하는', '춤추는', '노래하는', '책 읽는',
    '바다를 좋아하는', '별을 세는', '구름을 보는', '달빛 아래 걷는', '간식을 나누는', '봄을 기다리는',
    '모험을 떠나는', '숲을 산책하는'],
  second: ['고양이', '강아지', '수달', '판다', '토끼', '다람쥐', '펭귄', '코알라',
    '햄스터', '고슴도치', '참새', '북극곰', '물개', '기린', '돌고래', '부엉이',
    '거북이', '사슴', '코끼리', '알파카', '라마', '물범', '병아리', '카피바라']
};
const approvedNicknames = nicknameWords.first.flatMap(first =>
  nicknameWords.second.map(second => first + ' ' + second));
const options = words => words.map(word => '<option>' + word + '</option>').join('');
const assets = {};
for (const [route, file, type] of [
  ['/', 'index.html', 'text/html; charset=utf-8'],
  ['/style.css', 'style.css', 'text/css; charset=utf-8'],
  ['/game.js', 'game.js', 'text/javascript; charset=utf-8'],
  ['/cat.svg', 'cat.svg', 'image/svg+xml']
]) {
  let source = readFileSync('public/' + file, 'utf8');
  if (file === 'index.html') {
    source = source.replace('<!-- CAT_ART -->', readFileSync('public/cat.svg', 'utf8'))
      .replace('<!-- NICKNAME_FIRST -->', options(nicknameWords.first))
      .replace('<!-- NICKNAME_SECOND -->', options(nicknameWords.second));
  }
  assets[route] = [type, source];
}

mkdirSync('dist/server', { recursive: true });
mkdirSync('dist/.openai', { recursive: true });
if (existsSync('.openai/hosting.json')) copyFileSync('.openai/hosting.json', 'dist/.openai/hosting.json');
writeFileSync('dist/server/index.js',
  'const BANK = ' + JSON.stringify(bank) + ';\nconst ASSETS = ' + JSON.stringify(assets) + ';\n' +
  'const APPROVED_NICKNAMES = new Set(' + JSON.stringify(approvedNicknames) + ');\n' +
  readFileSync('worker.mjs', 'utf8'));
console.log('Built game with 100 validated questions.');
