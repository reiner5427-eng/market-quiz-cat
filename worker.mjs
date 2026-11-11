const ROUND_MS = 120_000;
const MAX_LIVES = 5;
const ANSWER_POINTS = 10;
const RANKING_GENERATION = 2;
const COATS = new Set(['cheese', 'mackerel', 'white', 'gray', 'tuxedo']);
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
const mistakesFor = game => game.mistakes ?? game.step - game.score / ANSWER_POINTS;
const livesLeft = mistakes => Math.max(0, MAX_LIVES - mistakes);

const blockedKorean = /씨발|시발|쉬발|쒸발|씹발|씨팔|시팔|쉬팔|씨바|씨빠|씨벙|시벌|씨벌|쌍놈|쌍년|미친놈|미친년|미친새끼|개새끼|개시키|개색끼|개세끼|새끼야|병신|븅신|빙신|뱅신|븅쉰|등신|또라이|좆|좃|좇|죶|존나|졸라|조낸|존내|지랄|쥐랄|엿먹|꺼져|개같|개년|썅|씨댕|섹스|섹쓰|섹수|쎅스|쌕스|섹1스|야동|야설|음란|포르노|포르나|보짓|보지년|자지년|자위|정액|사정남|딸딸이|성기노출|따먹|기모띠|기모띄|기모티|기모찌|기무띠|키모띠|키모치|앙기모|일베|일간베스트|일베충|일베저장소|운지|노무노무|노무쿤|느그홍어|홍어새끼|홍어충|틀딱|김치녀|맘충|한남충|한녀충|니얼굴|네얼굴|니면상|느금마|느금|느앰|느엠|니애미|니에미|니앰|네애미|니애비|느그엄마|느그애미|느그아빠|느그애비|느그부모|너네엄마|너네애미|니엄마|패드립/;
const blockedInitials = /ᄉᄇ|ᄊᄇ|ᄉᄑ|ᄇᄉ|ᄌᄅ|ᄌᄂ|ᄀᄉᄁ|ᄉᄉᄉ|ᄋᄇᄎ/;
const blockedKoreanWord = /^(?:보지|자지|야짤|느금마|애미|애비|급식충|노알라|노짱|슨상님|이기야|응디|게이야|홍어|슨상|똥꼬)(?:[0-9]*)$/;
const blockedEnglish = /f+u+c+k+|fuk|fvck|fck|phuck|fucken|muthaf|sh+i+t+|shyt|b+i+t+c+h+|biatch|bastard|asshole|dickhead|dickpic|dickface|dipshit|bullshit|motherf|slut|whore|pussy|porn|hentai|blowjob|handjob|dildo|orgasm|gangbang|cocksuck|sextoy|sexchat|sexy|damn|nigg[ae]|nigg[ae]r|fag+ot|retard|ilbe|gimotti|kimotti|kimochi|ssibal|sibal|shibal|jiral|byungsin/;
const blockedEnglishWord = /^(?:ass|arse|cock|dick|damn|hell|cunt|fag|sex|sexx|sexy|xxx|cum|cumming|nude|nudes|rape|rapist|wtf|stfu|fml|suck|sucks|crap)$/;
const leet = { 0: 'o', 1: 'i', 2: 'z', 3: 'e', 4: 'a', 5: 's', 6: 'g', 7: 't', 8: 'b', 9: 'g', '@': 'a', '$': 's', '!': 'i', '+': 't' };

const blockedNegativeKorean = /자살|자해|자해러|죽고싶|죽을래|죽어버|죽어라|살기싫|살고싶지않|사라지고싶|인생나락|나락간|나락행|망한인생|인생망|인생끝|인생포기|인생실패|인간쓰레기|쓰레기인생|인생쓰레기|쓸모없|가치없|태어나지말|태어난게죄|패배자인생|도태인생|무능한나|실업자|무직|백수|실패|(?<!희)망(?:함|했|해|한)|폭망|낙오자|패배자|루저|깔아뭉/;
const blockedNegativeEnglish = /suicid|selfharm|killmyself|wanttodie|wannadie|betteroffdead|hatemylife|lifesucks|mylifeisover|worthless|hopeless|bornloser/;
const blockedNegativeEnglishWord = /^(?:failure|loser|unemployed)$/;
const blockedSubstancesKorean = /술꾼|술쟁|술마시|술먹|술취|술좋|술사랑|술한잔|술잔|술집|술병|술안주|술파티|술중독|음주|숙취|소주(?!제)|맥주|막걸리|위스키|보드카|데킬라|테킬라|샴페인|고량주|칵테일|담배|흡연|꼴초|니코틴|스누스|마약|약쟁|약빨|약빤|약빠는|약을빨|약을빤|약중독|약에취|약에쩔|약물|뽕빤|뽕맞|뽕에취|대마피|대마폈|뽕쟁|필로폰|히로뽕|코카인|헤로인|펜타닐|엑스터시|대마초|대마흡|케타민|엘에스디|해시시/;
const blockedSubstancesKoreanWord = /^(?:술|양주|와인|사케|시가|대마)(?:[0-9]*)$/;
const blockedSubstancesEnglish = /cigarette|tobacco|nicotine|marijuana|cannabis|cocaine|heroin|fentanyl|methamphetamine|ecstasy|ketamine|whiskey|whisky|vodka|tequila|makgeolli|soju|vaping|vape|gethigh|stoned|stoner|ondrugs|drugged|drugaddict|drugdealer|drugabuse|narcotic|opioid|opium|amphetamine/;
const blockedSubstancesEnglishWord = /^(?:alcohol|beer|wine|drunk|tipsy|sake|meth|weed|pot|crack|coke|drug|drugs|lsd|cigar|smoke|smoking)$/;

const blockedCrudeKorean = /똥|응가|응아|응까|오줌|쉬야|분변|분뇨|배설|뿌+지+직|푸+지+직|뿌직|푸직|방귀|방구(?!석)|코딱지|토사물|가래침/;
const blockedCrudeKoreanWord = /^(?:대변|소변|설사)(?:[0-9]*)$/;
const blockedRelationshipKorean = /여친|남친|여자친구|남자친구|여자칭구|남자칭구|걸프렌드|걸프랜드|보이프렌드|보이프랜드|여자애인|남자애인|커플|커풀|헤어져라|헤어져버려|헤어져줘|헤어지세요|헤어졌으면|헤어지길|헤어지자/;
const blockedRelationshipEnglish = /girlfriend|boyfriend|couple|breakup|breakthemup|splitup/;
const blockedCrudeEnglishWord = /^(?:poop|poopy|pee|piss|puke|fart|feces|faeces|diarrhea)$/;

const blockedDrugUseKorean = /(?<![절계서공요도한])약(?:을(?:하|해|했|한)|하는|하자|하러)/;
const blockedGamblingKorean = /도박|노름|카지노|바카라|홀덤|블랙잭|룰렛|슬롯머신|슬롯중독|슬롯게임|스포츠토토|사설토토|불법토토|토토사이트|토토하는|토토왕|토토중독|토토쟁|포커(?!스)|돈내기|돈을걸|돈걸고|잭팟|로또|복권|불법베팅|불법배팅|스포츠베팅|스포츠배팅|베팅왕|배팅왕|베팅중독|배팅중독/;
const blockedGamblingKoreanWord = /^(?:토토|베팅|배팅)(?:[0-9]*)$/;
const blockedGamblingEnglish = /casino|gambl|baccarat|blackjack|roulette|sportsbook|bookmaker|jackpot|slotmachine|sportsbet|betting|lottery|lotto/;
const blockedGamblingEnglishWord = /^(?:bet|bets|poker|slot|slots)$/;

const blockedCustomKorean = /쮸쮸|빼빼로/;

function nicknameWarning(nickname) {
  const normalized = nickname.normalize('NFKC').toLowerCase().replace(/[\p{M}\p{Cf}]/gu, '');
  const korean = normalized.replace(/[^가-힣\u1100-\u11ff]/g, '').normalize('NFKC');
  const tokens = normalized.split(/[\s_]+/);
  if (blockedKorean.test(korean) || blockedKoreanWord.test(korean) || blockedInitials.test(korean) ||
      tokens.some(word => blockedKoreanWord.test(word))) {
    return '비속어는 사용할 수 없습니다.';
  }

  const english = normalized.replace(/[0-9@$!+]/g, character => leet[character]);
  const words = english.split(/[^a-z]+/);
  const compact = words.join('');
  if (blockedEnglish.test(compact) || blockedEnglishWord.test(compact) ||
      words.some(word => blockedEnglishWord.test(word)) ||
      blockedEnglishWord.test(normalized.replace(/[^a-z]/g, ''))) {
    return '비속어는 사용할 수 없습니다.';
  }
  if (blockedNegativeKorean.test(korean) || blockedNegativeEnglish.test(compact) ||
      blockedSubstancesKorean.test(korean) || blockedSubstancesKoreanWord.test(korean) ||
      tokens.some(word => blockedSubstancesKoreanWord.test(word)) ||
      blockedSubstancesEnglish.test(compact) || blockedSubstancesEnglishWord.test(compact) ||
      words.some(word => blockedSubstancesEnglishWord.test(word)) ||
      blockedNegativeEnglishWord.test(compact) || words.some(word => blockedNegativeEnglishWord.test(word)) ||
      blockedCrudeKorean.test(korean) || blockedCrudeKoreanWord.test(korean) ||
      tokens.some(word => blockedCrudeKoreanWord.test(word)) || blockedRelationshipKorean.test(korean) ||
      blockedRelationshipEnglish.test(compact) || blockedCrudeEnglishWord.test(compact) ||
      words.some(word => blockedCrudeEnglishWord.test(word)) || blockedDrugUseKorean.test(korean) ||
      blockedGamblingKorean.test(korean) || blockedGamblingKoreanWord.test(korean) ||
      tokens.some(word => blockedGamblingKoreanWord.test(word)) ||
      blockedGamblingEnglish.test(compact) || blockedGamblingEnglishWord.test(compact) ||
      words.some(word => blockedGamblingEnglishWord.test(word)) || blockedCustomKorean.test(korean)) {
    return '사용할 수 없는 표현이 포함되어 있습니다.';
  }
  return '';
}

const koreanPersonalName = /^(?:[김이박최정강조윤장임한오서신권황안송전홍유고문양손배백허남심노하곽성차주우구민진지엄채원천방공현함변염여추도소석선설마길연][가-힣]{1,3}|(?:남궁|독고|황보|제갈|선우|사공|서문|동방)[가-힣]{1,2})$/;
const nicknameNouns = new Set(['고양이', '강아지', '치즈', '판다', '토끼', '겨울', '하늘', '하늘이', '구름',
  '친구', '냥이', '다람쥐', '간식', '대장', '별빛', '우유', '초코', '고등어', '흰둥이', '회색', '턱시도',
  '김밥', '이불', '유자차']);
function hasMultiplePersonalNames(nickname) {
  const parts = nickname.split(/[\s,_/·&+|;:-]+/).filter(Boolean).map(part => part.replace(/[0-9]/g, ''));
  return parts.length >= 2 && parts.every(part => !nicknameNouns.has(part) && koreanPersonalName.test(part));
}

async function api(request, db, route) {
  if (route === '/api/ranking' && request.method === 'GET') {
    const { results: names } = await db.prepare(
      'SELECT DISTINCT nickname FROM games WHERE ranking_eligible = ? AND finished = 1 AND score > 0'
    ).bind(RANKING_GENERATION).all();
    for (const { nickname } of names) {
      if (nicknameWarning(nickname)) {
        await db.prepare('DELETE FROM games WHERE nickname = ? AND ranking_eligible = ? AND finished = 1')
          .bind(nickname, RANKING_GENERATION).run();
      }
    }
    const { results } = await db.prepare(
      `WITH best AS (
        SELECT nickname, score, COALESCE(cat_coat, coat) AS coat, started, id,
          ROW_NUMBER() OVER (PARTITION BY nickname COLLATE NOCASE ORDER BY score DESC, started, id) AS attempt
        FROM games
        WHERE ranking_eligible = ? AND finished = 1 AND score > 0
      )
      SELECT nickname, score, coat FROM best
      WHERE attempt = 1
      ORDER BY score DESC, started, id LIMIT 200`
    ).bind(RANKING_GENERATION).all();
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
    const warning = nicknameWarning(entered);
    if (warning) return json({ error: warning }, 400);
    const nickname = entered.normalize('NFKC').trim();
    if (hasMultiplePersonalNames(nickname)) {
      return json({ error: '이름은 한 개만 입력해 주세요.' }, 400);
    }
    if (!/^[가-힣A-Za-z0-9_ ]{2,12}$/.test(nickname) || !/[가-힣A-Za-z]/.test(nickname) || /\d{5,}/.test(nickname)) {
      return json({ error: '한글 또는 영문이 포함된 2~12자 별명을 입력해 주세요.' }, 400);
    }
    const coat = body.coat ?? null;
    if (coat !== null && !COATS.has(coat)) {
      return json({ error: '고양이를 다시 골라 주세요.' }, 400);
    }
    const deck = newDeck();
    const id = crypto.randomUUID();
    const started = Date.now();
    await db.prepare('INSERT INTO games (id, nickname, deck, started, ranking_eligible, cat_coat, mistakes) VALUES (?, ?, ?, ?, ?, ?, 0)')
      .bind(id, nickname, JSON.stringify(deck), started, RANKING_GENERATION, coat).run();
    return json({ id, lives: MAX_LIVES, remainingMs: Math.max(0, started + ROUND_MS - Date.now()), question: question(deck[0]) });
  }

  if (!['/api/answer', '/api/finish'].includes(route)) return json({ error: '페이지가 없어요.' }, 404);
  if (typeof body.id !== 'string' || !/^[a-f0-9-]{36}$/.test(body.id)) return json({ error: '게임 번호를 확인해 주세요.' }, 400);
  const game = await db.prepare('SELECT * FROM games WHERE id = ?').bind(body.id).first();
  if (!game) return json({ error: '게임을 찾지 못했어요.' }, 404);
  const now = Date.now();
  const result = game => {
    const mistakes = mistakesFor(game);
    return { score: game.score, weight: weight(game.score), lives: livesLeft(mistakes), correctCount: game.step - mistakes };
  };
  const final = game => json({ finished: true, ...result(game) });
  async function finishGame() {
    const row = await db.prepare('UPDATE games SET finished = 1 WHERE id = ? RETURNING score, step, mistakes')
      .bind(game.id).first();
    return final(row);
  }
  if (route === '/api/finish') return finishGame();
  const { step, choice } = body;
  if (!Number.isInteger(step) || step < 0 || !Number.isInteger(choice) || choice < 0 || choice > 3) {
    return json({ error: '보기를 골라 주세요.' }, 400);
  }

  const deck = JSON.parse(game.deck);
  if (!deck[step]) return game.finished ? final(game) : json({ error: '문제 번호를 확인해 주세요.' }, 409);
  const [index, order] = deck[step];
  const correctIndex = order.indexOf(0);
  const correct = choice === correctIndex;
  const feedback = game => {
    const stats = result(game);
    return json({
      correct, correctIndex, explanation: BANK[index].explanation, ...stats,
      finished: stats.lives === 0, question: stats.lives ? question(deck[step + 1]) : null
    });
  };
  const mistakes = mistakesFor(game);
  const remainingLives = livesLeft(mistakes);
  if ((!game.finished || remainingLives === 0) && game.step === step + 1 && game.last_answer === choice) {
    return feedback(game);
  }
  if (game.finished) return final(game);
  if (!remainingLives || now >= game.started + ROUND_MS) return finishGame();
  if (game.step !== step) return json({ error: '이미 채점된 문제예요.' }, 409);
  const exhausted = !correct && remainingLives === 1;
  const extra = !exhausted && step === deck.length - 1 ? newDeck() : null;
  if (extra) {
    if (extra[0][0] === index) [extra[0], extra[1]] = [extra[1], extra[0]];
    deck.push(...extra);
  }
  const row = await db.prepare(
    'UPDATE games SET step = step + 1, score = MAX(0, score + ?), mistakes = ?, last_answer = ?, deck = COALESCE(?, deck), finished = ? WHERE id = ? AND step = ? AND finished = 0 RETURNING score, step, mistakes'
  ).bind(correct ? ANSWER_POINTS : -ANSWER_POINTS, mistakes + Number(!correct), choice,
    extra ? JSON.stringify(deck) : null, Number(exhausted), game.id, step).first();
  if (!row) return json({ error: '이미 채점된 문제예요. 같은 보기를 다시 누르면 결과를 불러올 수 있어요.' }, 409);
  return feedback(row);
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
    const [contentType, content, binary] = asset;
    const body = binary ? Uint8Array.from(atob(content), character => character.charCodeAt(0)) : content;
    return new Response(body, { headers: {
      'content-type': contentType,
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'content-security-policy': "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
    }});
  }
};
