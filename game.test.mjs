import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import worker from './dist/server/index.js';

test('grades once, expires, and shares the top 200 across database connections', async () => {
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
    const badFormat = await client('/api/start', { nickname: '01234567890' });
    assert.equal(badFormat.status, 400);
    assert.equal((await badFormat.json()).code, undefined);
    for (const nickname of ['씨발고양이', '시1발', 'ㅅ_ㅂ', '일 베', '일1베', '앙기모띠', '기 모 띠',
      '기모찌', '야_동', '섹 1 스', 'FUCK', 'ＦＵＣＫ', 'f_u_c_k', 'fvck', 'sh1t',
      'b1tch', 's3x', 'p0rn', 'DICKHEAD', '씨\u200b발', '니얼굴', '니 얼 굴', '느금마', '느앰',
      '니애미', '니1애미', '느그엄마', '니면상']) {
      const rejected = await client('/api/start', { nickname });
      assert.equal(rejected.status, 400, nickname);
      assert.deepEqual(await rejected.json(), { error: '비속어는 사용할 수 없습니다.' });
    }
    for (const nickname of ['인생 나락간', '인생_나락간', '인1생나락간', '망한인생', '자살', '자1살', '자_해',
      '죽고싶다', '살기싫어', '쓸모없는나', 'SU1CIDE', 'self_harm', 'lifesucks', '소주한잔', '소 주', '술꾼',
      '술먹는냥이', '술', '담배', '담1배', '흡연냥이', '니코틴', '마약', '필로폰', '대마초', '대마',
      '코카인', '펜타닐', 'v0dka', 'm3th', 'w1ne', 'w33d', 'cocaine', 'tobacco', '뿌지직', '뿌지지직', '뿌1지직', '똥', '똥고양이',
      '응가', '응가대장', '응_가', '오줌냥이', '방귀대장', '여친', '남친', '여자친구', '남자친구',
      '여 자 친 구', '남1친', '전여친', '미래남친', '여자칭구', 'girlfriend', 'boyfriend', 'poop', 'fart',
      '실업자', '실업자고양이', '실패', '실1패', '망함', '깔아뭉갬', '깔아뭉개', '깔아_뭉갬', '백수', 'failure', '약빨다', '약빤', '약빤고양이', '약1빤', '약빠는냥이',
      '약을 하다', '약을하다', '약 을 하 다', '약을한냥이', '약물중독', '약에취함', '뽕맞은고양이',
      '도박', '도1박', '도박왕', '노름', '카지노', '바카라', '홀덤', '블랙잭', '룰렛', '슬롯머신',
      '스포츠토토', '토토', '토토왕', '토토사이트', '돈내기', '잭팟', '로또', '복권', '불법배팅', '베팅왕',
      'CASINO', 'c4s1no', 'gambling', 'poker', 'betting', 'ondrugs', 'stoned', 'drugdealer', '커플', '커플고양이', '커1플', '커 플',
      '헤어져라', '헤 어 져 라', '헤어1져라', '헤어져버려', '헤어지세요', '헤어지자', 'couple', 'breakup',
      '쮸쮸', '쮸 쮸', '쮸1쮸', '빼빼로', '빼 빼 로', '빼1빼로', '나치', '나 치', '나1치', '나치독일', '네오나치', '히틀러',
      '히 틀 러', '괴벨스', '고벨스', '시진핑', '이재명', '노무현', '노_무_현', '스탈린', '스 탈 린',
      '김정은', '김1정은', '김_정_은', '령도자', '영도자', '위대한령도자', '영도자동지', '무솔리니',
      'h1tler', 'goebbels', 'xijinping', 'leejaemyung', 'rohmuhyun', 'stalin', 'kimjongun', 'mussolini',
      'ate', 'ATE', 'a_t_e', '4t3', 'ate42', 'ate 냥이', '보숭', '보들', '앙앙', '보 숭', '보_들', '앙1앙',
      '꼬치', '꼬 치', '꼬1치', '바보', '바 보', '바1보', 'ebola', 'EBOLA', 'e_b_o_l_a', 'eb0la', '싫어', '싫다', '미워', '너싫어', '싫 어', '싫1다', '미_워', '미워해', '싫음', '밉다',
      '못생기', '못생기다', '못생긴냥이', '못 생겼어', '못1생겨', '추하다', '추하 네', '추한고양이', '추해']) {
      const rejected = await client('/api/start', { nickname });
      assert.equal(rejected.status, 400, nickname);
      assert.deepEqual(await rejected.json(),
        { error: '사용할 수 없는 표현이 포함되어 있습니다.' }, nickname);
    }
    for (const nickname of ['문채은 양신우', '문채은_양신우', '문채은,양신우', '문채은/양신우',
      '문채은·양신우', '문채은&양신우', '홍길동 김철수', '남궁민 독고영재', '김준 이솔', '김1민수 이2서연']) {
      const rejected = await client('/api/start', { nickname });
      assert.equal(rejected.status, 400, nickname);
      assert.equal((await rejected.json()).error, '이름은 한 개만 입력해 주세요.', nickname);
    }
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM games').get().count, 0);
    for (const nickname of ['푸른달7', 'CloudCat', 'classmate', 'Biscuit', '겨울 판다', '별_친구', '희망고양이', '마술사', '기술자', '예술가', '미술왕', '절약왕',
      '약속친구', '대마법사', '대마왕', '단호박죽', '눈물의승리', '절망을이겨낸', 'AmethystCat', 'SeaweedCat',
      'TweedCat', 'PotatoCat', 'Cracker', '소주제달인', '우리친구', '친절냥이', '장애인친구', '변신고양이', '대변인',
      '방구석고양이', '별빛가루', '절약을하는냥이', '계약을하는친구', '도약하는고양이', '나약하지않아',
      '새내기냥이', '토토로', '대박고양이', '트로피냥이', '포커스냥이', 'Alphabet', 'BetterCat', '헤어디자이너', '희망해', '솔로고양이', '헤어나온냥이', '문채은', '김준', '치즈 고양이', '강아지 고양이',
      '하늘 구름', '김밥 이불', '김밥 먹는냥이', '유자차 이불', '피보나치', '지나치게귀여운', '부산영도', '영도자전거',
      '고령도자기', '정은고양이', 'Chocolate', 'PirateCat', '실타래', '미소냥이', '장미워터', '상추한장']) {
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
    const moderatedNames = ['인생 나락간', '니얼굴', '느금마', '술꾼', '담배', '자살', '마약', 'lifesucks', '뿌지직', '똥고양이', '응가대장', '남자친구', '여친',
      '실업자', '실패한고양이', '인생망함', '깔아뭉갬', '약빤고양이', '약을하다', '약물냥이',
      '도박왕', '카지노', '스포츠토토', 'gambling', '커플', '커플헤어져라', '헤어져라',
      '쮸쮸', '빼빼로', '나치', '히틀러', '괴벨스', '시진핑', '이재명', '노무현', '스탈린',
      '김정은', '령도자', '영도자', '무솔리니', 'ate', '보숭', '보들냥이', '앙앙', '싫어', '미워해', '못생기다', '추하다', '꼬치', '바보냥이', 'EBOLA'];
    for (const [i, nickname] of moderatedNames.entries()) {
      insert.run('blocked' + i, nickname, '[]', i, 500);
      insert.run('blockedRetry' + i, nickname, '[]', i + 20, 400);
    }
    db.prepare('INSERT INTO games (id, nickname, deck, started, score, finished, ranking_eligible) VALUES (?, ?, ?, ?, ?, 0, 2)')
      .run('active', '인생 나락간', '[]', 1, 10);
    assert.ok(!(await data('/api/ranking')).some(row => moderatedNames.includes(row.nickname)));
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM games WHERE id LIKE 'blocked%'").get().count, 0);
    assert.equal(db.prepare("SELECT finished FROM games WHERE id = 'active'").get().finished, 0);
    for (let i = 1; i <= 205; i++) insert.run('test' + i, '고양이' + i, '[]', i, 20);
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
    assert.equal(board.length, 200);
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
    assert.equal(board[50].rank, 51);
    assert.equal(board[50].nickname, '고양이50');
    assert.equal(board[99].rank, 100);
    assert.equal(board[99].nickname, '고양이99');
    assert.equal(board[100].rank, 101);
    assert.equal(board[149].rank, 150);
    assert.equal(board[150].rank, 151);
    assert.equal(board[199].rank, 200);
    assert.equal(board[199].nickname, '고양이199');
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
