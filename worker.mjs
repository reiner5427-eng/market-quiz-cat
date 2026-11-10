const ROUND_MS = 120_000;
const shuffle = items => {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
};
const newDeck = () => shuffle(BANK.map((_, i) => i)).map(i => [i, shuffle([0, 1, 2, 3])]);
const json = (data, status = 200) => Response.json(data, {
  status, headers: { 'cache-control': 'no-store' }
});
const question = ([id, order]) => ({
  topic: BANK[id].topic,
  prompt: BANK[id].prompt,
  choices: order.map(i => BANK[id].choices[i])
});
const weight = score => (3 + score * .025).toFixed(2);

const blockedKorean = /씨발|시발|쉬발|쒸발|씹발|씨팔|시팔|쉬팔|씨바|씨빠|씨벙|시벌|씨벌|쌍놈|쌍년|미친놈|미친년|미친새끼|개새끼|개시키|개색끼|개세끼|새끼야|병신|븅신|빙신|뱅신|븅쉰|등신|또라이|좆|좃|좇|죶|존나|졸라|조낸|존내|지랄|쥐랄|엿먹|꺼져|개같|개년|썅|씨댕|섹스|섹쓰|섹수|쎅스|쌕스|섹1스|야동|야설|음란|포르노|포르나|보짓|보지년|자지년|자위|정액|사정남|딸딸이|성기노출|따먹|기모띠|기모띄|기모티|기모찌|기무띠|키모띠|키모치|앙기모|일베|일간베스트|일베충|일베저장소|운지|노무노무|노무쿤|느그홍어|홍어새끼|홍어충|틀딱|김치녀|맘충|한남충|한녀충/;
const blockedInitials = /ᄉᄇ|ᄊᄇ|ᄉᄑ|ᄇᄉ|ᄌᄅ|ᄌᄂ|ᄀᄉᄁ|ᄉᄉᄉ|ᄋᄇᄎ/;
const blockedKoreanWord = /^(?:보지|자지|야짤|느금마|애미|애비|급식충|노알라|노짱|슨상님|이기야|응디|게이야|홍어|슨상|똥꼬)(?:[0-9]*)$/;
const blockedEnglish = /f+u+c+k+|fuk|fvck|fck|phuck|fucken|muthaf|sh+i+t+|shyt|b+i+t+c+h+|biatch|bastard|asshole|dickhead|dickpic|dickface|dipshit|bullshit|motherf|slut|whore|pussy|porn|hentai|blowjob|handjob|dildo|orgasm|gangbang|cocksuck|sextoy|sexchat|sexy|damn|nigg[ae]|nigg[ae]r|fag+ot|retard|ilbe|gimotti|kimotti|kimochi|ssibal|sibal|shibal|jiral|byungsin/;
const blockedEnglishWord = /^(?:ass|arse|cock|dick|damn|hell|cunt|fag|sex|sexx|sexy|xxx|cum|cumming|nude|nudes|rape|rapist|wtf|stfu|fml|suck|sucks|crap)$/;
const leet = { 0: 'o', 1: 'i', 2: 'z', 3: 'e', 4: 'a', 5: 's', 6: 'g', 7: 't', 8: 'b', 9: 'g', '@': 'a', '$': 's', '!': 'i', '+': 't' };

function isBlockedNickname(nickname) {
  const normalized = nickname.normalize('NFKC').toLowerCase().replace(/[\p{M}\p{Cf}]/gu, '');
  const korean = normalized.replace(/[^가-힣\u1100-\u11ff]/g, '').normalize('NFKC');
  if (blockedKorean.test(korean) || blockedKoreanWord.test(korean) || blockedInitials.test(korean)) return true;
  if (normalized.split(/[\s_]+/).some(word => blockedKoreanWord.test(word))) return true;

  const english = normalized.replace(/[0-9@$!+]/g, character => leet[character]);
  const words = english.split(/[^a-z]+/);
  const compact = words.join('');
  return blockedEnglish.test(compact) || blockedEnglishWord.test(compact) ||
    words.some(word => blockedEnglishWord.test(word)) ||
    blockedEnglishWord.test(normalized.replace(/[^a-z]/g, ''));
}

async function api(request, db, route) {
  if (route === '/api/ranking' && request.method === 'GET') {
    const { results } = await db.prepare(
      'SELECT nickname, score FROM games WHERE finished = 1 AND score > 0 ORDER BY score DESC, started, id LIMIT 30'
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
    const entered = typeof body.nickname === 'string' ? body.nickname : '';
    if (isBlockedNickname(entered)) {
      return json({ error: '비속어는 사용할 수 없습니다.' }, 400);
    }
    const nickname = entered.normalize('NFKC').trim();
    if (!/^[가-힣A-Za-z0-9_ ]{2,12}$/.test(nickname) || !/[가-힣A-Za-z]/.test(nickname) || /\d{5,}/.test(nickname)) {
      return json({ error: '한글 또는 영문이 포함된 2~12자 별명을 입력해 주세요.' }, 400);
    }
    const deck = newDeck();
    const id = crypto.randomUUID();
    const started = Date.now();
    await db.prepare('INSERT INTO games (id, nickname, deck, started) VALUES (?, ?, ?, ?)')
      .bind(id, nickname, JSON.stringify(deck), started).run();
    return json({ id, remainingMs: Math.max(0, started + ROUND_MS - Date.now()), question: question(deck[0]) });
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
  if (!Number.isInteger(step) || step < 0 || !Number.isInteger(choice) || choice < 0 || choice > 3) {
    return json({ error: '보기를 골라 주세요.' }, 400);
  }

  const deck = JSON.parse(game.deck);
  if (!deck[step]) return game.finished ? final(game.score) : json({ error: '문제 번호를 확인해 주세요.' }, 409);
  const [index, order] = deck[step];
  const correctIndex = order.indexOf(0);
  const correct = choice === correctIndex;
  const feedback = score => json({
    correct, correctIndex, explanation: BANK[index].explanation, score, weight: weight(score),
    question: question(deck[step + 1])
  });
  if (!game.finished && game.step === step + 1 && game.last_answer === choice) return feedback(game.score);
  if (game.finished) return final(game.score);
  if (now >= game.started + ROUND_MS) {
    const row = await db.prepare('UPDATE games SET finished = 1 WHERE id = ? RETURNING score').bind(game.id).first();
    return final(row.score);
  }
  if (game.step !== step) return json({ error: '이미 채점된 문제예요.' }, 409);
  const extra = step === deck.length - 1 ? newDeck() : null;
  if (extra) {
    if (extra[0][0] === index) [extra[0], extra[1]] = [extra[1], extra[0]];
    deck.push(...extra);
  }
  const row = await db.prepare(
    'UPDATE games SET step = step + 1, score = score + ?, last_answer = ?, deck = COALESCE(?, deck) WHERE id = ? AND step = ? AND finished = 0 RETURNING score'
  ).bind(correct ? 10 : 0, choice, extra ? JSON.stringify(deck) : null, game.id, step).first();
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
