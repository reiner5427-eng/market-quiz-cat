import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import worker from './dist/server/index.js';

test('grades once, expires, and shares the top 50 across database connections', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'quiz-'));
  const file = join(dir, 'game.sqlite');
  let db = new DatabaseSync(file);
  const client = (route, body) => worker.fetch(new Request('https://quiz.test' + route, body ? {
    method: 'POST', body: JSON.stringify(body)
  } : {}), { DB: { prepare(sql) {
    const stmt = db.prepare(sql);
    const bind = (...args) => ({
      run: async () => stmt.run(...args),
      first: async () => stmt.get(...args),
      all: async () => ({ results: stmt.all(...args) })
    });
    return { bind, ...bind() };
  } } });
  const data = async (...args) => (await client(...args)).json();

  try {
    db.exec(readFileSync('drizzle/0000_game.sql', 'utf8'));
    db.prepare('INSERT INTO games (id, nickname, deck, started, score, finished) VALUES (?, ?, ?, ?, ?, 1)')
      .run('old', '이전기록', '[]', 0, 90);
    db.exec(readFileSync('drizzle/0001_reset_ranking.sql', 'utf8'));
    db.exec(readFileSync('drizzle/0002_ranking_coat.sql', 'utf8'));
    db.exec(readFileSync('drizzle/0003_expand_cat_coats.sql', 'utf8'));
    db.exec(readFileSync('drizzle/0004_score_penalty.sql', 'utf8'));
    db.prepare('INSERT INTO games (id, nickname, deck, started, score, finished, ranking_eligible) VALUES (?, ?, ?, ?, ?, 1, 1)')
      .run('previous', '이전시즌', '[]', 1, 200);
    assert.deepEqual(await data('/api/ranking'), []);
    db.prepare("DELETE FROM games WHERE id IN ('old', 'previous')").run();
    assert.equal((await client('/')).status, 200);
    assert.equal((await client('/api/start', { nickname: '01234567890' })).status, 400);
    for (const nickname of ['씨발고양이', '시1발', 'ㅅ_ㅂ', '일 베', '일1베', '앙기모띠', '기 모 띠',
      '기모찌', '야_동', '섹 1 스', 'FUCK', 'ＦＵＣＫ', 'f_u_c_k', 'fvck', 'sh1t',
      'b1tch', 's3x', 'p0rn', 'DICKHEAD', '씨\u200b발']) {
      const rejected = await client('/api/start', { nickname });
      assert.equal(rejected.status, 400, nickname);
      assert.equal((await rejected.json()).error, '비속어는 사용할 수 없습니다.');
    }
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM games').get().count, 0);
    for (const nickname of ['푸른달7', 'CloudCat', 'classmate', 'Biscuit', '겨울 판다', '별_친구']) {
      const allowed = await client('/api/start', { nickname });
      assert.equal(allowed.status, 200, nickname);
    }
    assert.equal((await client('/api/start', { nickname: '간식대장', coat: 'invalid' })).status, 400);
    const started = await data('/api/start', { nickname: '간식대장', coat: 'tuxedo' });
    assert.equal(started.question.choices.length, 4);
    assert.equal(started.lives, 5);
    assert.ok(started.remainingMs > 119_000 && started.remainingMs <= 120_000);
    assert.equal(started.question.correctIndex, undefined);
    const deck = JSON.parse(db.prepare('SELECT deck FROM games WHERE id = ?').get(started.id).deck);
    assert.equal(new Set(deck.map(q => q[0])).size, 100);
    const answer = { id: started.id, step: 0, choice: deck[0][1].indexOf(0) };
    const first = await data('/api/answer', answer);
    assert.equal(first.score, 10);
    assert.equal(first.weight, '3.25');
    assert.equal(first.correct, true);
    assert.equal(first.lives, 5);
    assert.ok(first.explanation);
    assert.deepEqual(await data('/api/answer', answer), first);
    const wrong = await data('/api/answer', { ...answer, step: 1, choice: (deck[1][1].indexOf(0) + 1) % 4 });
    assert.equal(wrong.correct, false);
    assert.equal(wrong.score, 0);
    assert.equal(wrong.weight, '3.00');
    assert.equal(wrong.lives, 4);
    assert.equal(wrong.correctCount, 1);
    db.prepare('UPDATE games SET step = 99, score = 980 WHERE id = ?').run(started.id);
    const boundary = await data('/api/answer', { ...answer, step: 99, choice: (deck[99][1].indexOf(0) + 1) % 4 });
    assert.ok(boundary.question);
    assert.equal(boundary.score, 970);
    assert.equal(boundary.weight, '27.25');
    const extended = JSON.parse(db.prepare('SELECT deck FROM games WHERE id = ?').get(started.id).deck);
    assert.equal(extended.length, 200);
    assert.equal(new Set(extended.slice(100).map(q => q[0])).size, 100);
    assert.notEqual(extended[99][0], extended[100][0]);
    db.prepare('UPDATE games SET started = 0, step = 2, score = 10, mistakes = NULL WHERE id = ?').run(started.id);
    assert.equal((await data('/api/answer', { ...answer, step: 2 })).finished, true);
    assert.deepEqual(await data('/api/finish', { id: started.id }), { finished: true, score: 10, weight: '3.25', lives: 4, correctCount: 1 });
    assert.equal((await data('/api/ranking'))[0].coat, 'tuxedo');
    const second = await data('/api/start', { nickname: '하트점검' });
    const secondDeck = JSON.parse(db.prepare('SELECT deck FROM games WHERE id = ?').get(second.id).deck);
    const secondAnswer = (step, correct) => ({
      id: second.id, step, choice: (secondDeck[step][1].indexOf(0) + (correct ? 0 : 1)) % 4
    });
    for (let step = 0; step < 6; step++) {
      assert.equal((await data('/api/answer', secondAnswer(step, true))).lives, 5);
    }
    for (let miss = 1; miss <= 5; miss++) {
      const submitted = secondAnswer(5 + miss, false);
      const graded = await data('/api/answer', submitted);
      assert.equal(graded.lives, 5 - miss);
      assert.equal(graded.finished, miss === 5);
      assert.equal(graded.score, 60 - 10 * miss);
      assert.equal(graded.weight, (4.5 - .25 * miss).toFixed(2));
      assert.equal(graded.correctCount, 6);
      assert.equal(Boolean(graded.question), miss < 5);
      assert.ok(graded.explanation);
      assert.deepEqual(await data('/api/answer', submitted), graded);
    }
    assert.deepEqual(await data('/api/answer', secondAnswer(11, true)),
      { finished: true, score: 10, weight: '3.25', lives: 0, correctCount: 6 });
    assert.ok((await data('/api/ranking')).some(row => row.nickname === '하트점검' && row.score === 10));
    const insert = db.prepare(
      'INSERT INTO games (id, nickname, deck, started, score, finished, ranking_eligible) VALUES (?, ?, ?, ?, ?, 1, 2)'
    );
    for (let i = 1; i <= 55; i++) insert.run('test' + i, '고양이' + i, '[]', i, 20);
    insert.run('best', '고양이3', '[]', 40, 30);
    insert.run('lower', '고양이3', '[]', 41, 10);
    insert.run('tie', '고양이3', '[]', 42, 30);
    insert.run('tieOther', '고양이5', '[]', 41, 30);
    insert.run('caseBest', 'CloudCat', '[]', 43, 40);
    insert.run('caseLower', 'cloudcat', '[]', 44, 30);
    const setCoat = db.prepare('UPDATE games SET coat = ? WHERE id = ?');
    setCoat.run('white', 'best');
    setCoat.run('gray', 'lower');
    setCoat.run('cheese', 'tie');
    setCoat.run('cheese', 'caseBest');
    setCoat.run('mackerel', 'caseLower');
    db.close();
    db = new DatabaseSync(file);
    const board = await data('/api/ranking');
    assert.equal(board.length, 50);
    assert.deepEqual(board.slice(0, 4).map(row => [row.nickname, row.score]), [
      ['CloudCat', 40], ['고양이3', 30], ['고양이5', 30], ['고양이1', 20]
    ]);
    assert.equal(board.filter(row => row.nickname.toLowerCase() === 'cloudcat').length, 1);
    assert.equal(board.filter(row => row.nickname === '고양이3').length, 1);
    assert.equal(board[0].coat, 'cheese');
    assert.equal(board[1].coat, 'white');
    assert.equal(board[2].coat, null);
    assert.equal(board[49].nickname, '고양이49');
    assert.equal(board[49].rank, 50);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
