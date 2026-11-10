const ROUND_MS = 90_000;
const LIMIT = 20;
const MAX_SCORE = 200;
const shuffle = items => {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
};
const json = (data, status = 200) => Response.json(data, {
  status, headers: { 'cache-control': 'no-store' }
});
const question = ([id, order]) => ({
  topic: BANK[id].topic,
  prompt: BANK[id].prompt,
  choices: order.map(i => BANK[id].choices[i])
});
const weight = score => (3 + score * .025).toFixed(2);

async function api(request, db, route) {
  if (route === '/api/ranking' && request.method === 'GET') {
    const { results } = await db.prepare(
      'SELECT nickname, score FROM games WHERE finished = 1 AND score > 0 ORDER BY score DESC, started, id LIMIT 20'
    ).all();
    return json(results.map((row, i) => ({ ...row, weight: weight(row.score), rank: i + 1 })));
  }
  if (request.method !== 'POST') return json({ error: '지원하지 않는 요청이에요.' }, 405);
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return json({ error: '이 페이지에서 다시 시도해 주세요.' }, 403);
  let body;
  try {
    const raw = await request.text();
    if (raw.length > 1024) throw Error();
    body = JSON.parse(raw);
    if (!body || typeof body !== 'object') throw Error();
  } catch {
    return json({ error: '요청을 읽을 수 없어요.' }, 400);
  }
  if (route === '/api/start') {
    const nickname = typeof body.nickname === 'string' ? body.nickname.normalize('NFKC').trim() : '';
    if (!/^[가-힣A-Za-z0-9_ ]{2,12}$/.test(nickname) || !/[가-힣A-Za-z]/.test(nickname) || /\d{5,}/.test(nickname)) {
      return json({ error: '실명 대신 한글 또는 영문이 포함된 2~12자 별명을 써 주세요.' }, 400);
    }
    const deck = shuffle(BANK.map((_, i) => i)).slice(0, LIMIT)
      .map(i => [i, shuffle([0, 1, 2, 3])]);
    const id = crypto.randomUUID();
    const started = Date.now();
    await db.prepare('INSERT INTO games (id, nickname, deck, started) VALUES (?, ?, ?, ?)')
      .bind(id, nickname, JSON.stringify(deck), started).run();
    return json({ id, remainingMs: Math.max(0, started + ROUND_MS - Date.now()), question: question(deck[0]), limit: LIMIT });
  }

  if (!['/api/answer', '/api/finish'].includes(route)) return json({ error: '페이지가 없어요.' }, 404);
  if (typeof body.id !== 'string' || !/^[a-f0-9-]{36}$/.test(body.id)) return json({ error: '게임 번호를 확인해 주세요.' }, 400);
  const game = await db.prepare('SELECT * FROM games WHERE id = ?').bind(body.id).first();
  if (!game) return json({ error: '게임을 찾지 못했어요.' }, 404);
  const now = Date.now();
  const final = score => json({ finished: true, score, weight: weight(score) });
  if (route === '/api/finish') {
    const row = await db.prepare('UPDATE games SET finished = 1 WHERE id = ? RETURNING score')
      .bind(game.id).first();
    return final(row.score);
  }
  const { step, choice } = body;
  if (!Number.isInteger(step) || step < 0 || step >= LIMIT || !Number.isInteger(choice) || choice < 0 || choice > 3) {
    return json({ error: '보기를 골라 주세요.' }, 400);
  }

  const deck = JSON.parse(game.deck);
  const [index, order] = deck[step];
  const correctIndex = order.indexOf(0);
  const correct = choice === correctIndex;
  const feedback = score => json({
    correct, correctIndex, explanation: BANK[index].explanation, score, weight: weight(score),
    question: step + 1 < LIMIT ? question(deck[step + 1]) : null
  });
  if (!game.finished && game.step === step + 1 && game.last_answer === choice) return feedback(game.score);
  if (game.finished) return final(game.score);
  if (now >= game.started + ROUND_MS) {
    const row = await db.prepare('UPDATE games SET finished = 1 WHERE id = ? RETURNING score').bind(game.id).first();
    return final(row.score);
  }
  if (game.step !== step) return json({ error: '이미 채점된 문제예요.' }, 409);
  const row = await db.prepare(
    'UPDATE games SET step = step + 1, score = score + ?, last_answer = ? WHERE id = ? AND step = ? AND finished = 0 RETURNING score'
  ).bind(correct ? MAX_SCORE / LIMIT : 0, choice, game.id, step).first();
  if (!row) return json({ error: '이미 채점된 문제예요. 같은 보기를 다시 누르면 결과를 불러올 수 있어요.' }, 409);
  return feedback(row.score);
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/api/')) {
      try {
        return await api(request, env.DB, path);
      } catch (error) {
        console.error(error);
        return json({ error: '기록 서버에 연결하지 못했어요. 다시 시도해 주세요.' }, 503);
      }
    }
    const asset = ASSETS[path];
    if (!asset || request.method !== 'GET') return new Response('페이지를 찾을 수 없어요.', { status: 404 });
    return new Response(asset[1], { headers: {
      'content-type': asset[0],
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'content-security-policy': "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
    }});
  }
};
