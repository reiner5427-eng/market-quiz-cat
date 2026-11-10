import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import worker from './dist/server/index.js';

test('grades once, expires, and shares the top 30 across database connections', async () => {
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
    const started = await data('/api/start', { nickname: '간식대장' });
    assert.equal(started.question.choices.length, 4);
    assert.ok(started.remainingMs > 119_000 && started.remainingMs <= 120_000);
    assert.equal(started.question.correctIndex, undefined);
    const deck = JSON.parse(db.prepare('SELECT deck FROM games WHERE id = ?').get(started.id).deck);
    assert.equal(new Set(deck.map(q => q[0])).size, 100);
    const answer = { id: started.id, step: 0, choice: deck[0][1].indexOf(0) };
    const first = await data('/api/answer', answer);
    assert.equal(first.score, 10);
    assert.equal(first.weight, '3.25');
    assert.equal(first.correct, true);
    assert.ok(first.explanation);
    assert.deepEqual(await data('/api/answer', answer), first);
    const wrong = await data('/api/answer', { ...answer, step: 1, choice: (deck[1][1].indexOf(0) + 1) % 4 });
    assert.equal(wrong.correct, false);
    assert.equal(wrong.score, 10);
    db.prepare('UPDATE games SET step = 99 WHERE id = ?').run(started.id);
    const boundary = await data('/api/answer', { ...answer, step: 99, choice: (deck[99][1].indexOf(0) + 1) % 4 });
    assert.ok(boundary.question);
    const extended = JSON.parse(db.prepare('SELECT deck FROM games WHERE id = ?').get(started.id).deck);
    assert.equal(extended.length, 200);
    assert.equal(new Set(extended.slice(100).map(q => q[0])).size, 100);
    assert.notEqual(extended[99][0], extended[100][0]);
    db.prepare('UPDATE games SET started = 0 WHERE id = ?').run(started.id);
    assert.equal((await data('/api/answer', { ...answer, step: 2 })).finished, true);
    assert.deepEqual(await data('/api/finish', { id: started.id }), { finished: true, score: 10, weight: '3.25' });
    for (let i = 1; i <= 35; i++) {
      db.prepare('INSERT INTO games (id, nickname, deck, started, score, finished) VALUES (?, ?, ?, ?, ?, 1)')
        .run('test' + i, '고양이' + i, '[]', i, 20);
    }
    db.close();
    db = new DatabaseSync(file);
    const board = await data('/api/ranking');
    assert.equal(board.length, 30);
    assert.equal(board[0].nickname, '고양이1');
    assert.equal(board[29].nickname, '고양이30');
    assert.equal(board[29].rank, 30);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
