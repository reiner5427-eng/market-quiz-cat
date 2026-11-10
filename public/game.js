const $ = id => document.getElementById(id);
const topics = { A: '시장경제와 가계·기업', B: '경제성장과 우리 생활', C: '세계 속의 무역' };
let game, deadline, timer, step, current, upcoming, busy, ending, score, review;

async function api(route, body) {
  const response = await fetch('/api/' + route, body ? {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  } : {});
  const data = await response.json();
  if (!response.ok) throw Error(data.error);
  return data;
}
function showMessage(message = '') {
  $('message').textContent = message;
  $('message').hidden = !message;
}
function updateScore(value, kg) {
  score = value;
  const growth = 1 + .65 * (1 - Math.exp(-value / 55));
  document.getElementById('cat').style.setProperty('--growth', growth.toFixed(3));
  $('score').textContent = value + '점';
  $('weight').textContent = kg + ' kg';
}
function showCountryLabels(element, text) {
  const parts = text.split(/(?<![가-힣])([가나] 나라)/g);
  element.replaceChildren(...parts.map((part, i) => {
    if (i % 2 === 0) return part;
    const label = document.createElement('strong');
    label.className = part.startsWith('가') ? 'country-ga' : 'country-na';
    label.textContent = part;
    return label;
  }));
}
function showQuestion(question) {
  current = question;
  document.getElementById('counter').textContent = (step + 1) + '번 문제';
  $('topic').textContent = topics[question.topic];
  showCountryLabels($('prompt'), question.prompt);
  $('choices').replaceChildren(...question.choices.map((option, i) => {
    const button = document.createElement('button');
    button.type = 'button';
    showCountryLabels(button, '①②③④'[i] + ' ' + option);
    button.addEventListener('click', () => answer(i));
    return button;
  }));
  $('next').hidden = true;
  $('feedback').hidden = true;
  $('prompt').focus();
}
function tick() {
  const left = Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
  $('clock').textContent = '⏱ ' + left + '초';
  $('timebar').value = left;
  if (!left && !busy) finish();
}
$('start').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  showMessage();
  try {
    game = await api('start', { nickname: $('nickname').value });
    deadline = performance.now() + game.remainingMs;
    step = 0;
    busy = ending = false;
    review = [];
    $('welcome').hidden = true;
    $('playing').hidden = false;
    updateScore(0, '3.00');
    $('cat-says').textContent = '“야옹! 간식 줄 거냥?”';
    showQuestion(game.question);
    timer = setInterval(tick, 200);
    tick();
  } catch (error) {
    showMessage(error.message);
  } finally {
    button.disabled = false;
  }
});
async function answer(choice) {
  if (busy || ending) return;
  busy = true;
  showMessage();
  const buttons = Array.from($('choices').children);
  buttons.forEach(button => { button.disabled = true; });
  try {
    const data = await api('answer', { id: game.id, step, choice });
    if (data.finished) return showResult(data);
    updateScore(data.score, data.weight);
    const correctText = current.choices[data.correctIndex];
    const explanation = '정답: ' + correctText + ' · ' + data.explanation;
    review.push({ prompt: current.prompt, explanation, correct: data.correct });
    buttons[data.correctIndex].classList.add('good');
    if (!data.correct) buttons[choice].classList.add('wrong');
    const feedback = $('feedback');
    feedback.className = data.correct ? 'good' : 'wrong';
    showCountryLabels(feedback, (data.correct ? '정답! 간식 +1 🐟 · ' : '아쉬워요! ') + explanation);
    feedback.hidden = false;
    $('cat-says').textContent = data.correct ? '“냠냠! 간식 맛있다냥!” 🐟' : '“다음 문제도 힘내라냥!”';
    if (data.correct) {
      const cat = $('cat');
      cat.classList.remove('chomp');
      void cat.offsetWidth;
      cat.classList.add('chomp');
    }
    upcoming = data.question;
    $('next').textContent = upcoming ? '다음 문제 →' : '내 기록 보기 →';
    $('next').hidden = false;
    $('next').focus();
  } catch (error) {
    showMessage(error.message);
    buttons.forEach(button => { button.disabled = false; });
  } finally {
    busy = false;
  }
}
$('next').addEventListener('click', () => {
  if (ending) return finish();
  if (!upcoming || deadline <= performance.now()) return finish();
  step++;
  showQuestion(upcoming);
});
async function finish() {
  if (busy) return;
  busy = ending = true;
  clearInterval(timer);
  for (const button of $('choices').children) button.disabled = true;
  $('next').disabled = true;
  try {
    showResult(await api('finish', { id: game.id }));
  } catch {
    showMessage('기록 서버에 연결하지 못했어요. 버튼을 눌러 저장을 다시 시도해 주세요.');
    $('next').textContent = '기록 저장 다시 시도 ↻';
    $('next').hidden = false;
  } finally {
    $('next').disabled = false;
    busy = false;
  }
}
function showResult(data) {
  clearInterval(timer);
  showMessage();
  updateScore(data.score, data.weight);
  $('playing').hidden = true;
  $('result').hidden = false;
  $('summary').textContent = '간식 ' + score / 10 + '개 · ' + score + '점 · ' + data.weight + ' kg';
  $('cat-says').textContent = '“함께 놀아서 즐거웠다냥!”';
  $('review').replaceChildren(...review.map(item => {
    const details = document.createElement('details');
    const title = document.createElement('summary');
    showCountryLabels(title, (item.correct ? '맞힌 문제 · ' : '다시 볼 문제 · ') + item.prompt);
    const p = document.createElement('p');
    showCountryLabels(p, item.explanation);
    details.append(title, p);
    return details;
  }));
  $('result-title').focus();
  loadRanking();
}
$('again').addEventListener('click', () => {
  $('result').hidden = true;
  $('welcome').hidden = false;
  updateScore(0, '3.00');
  $('cat-says').textContent = '“야옹! 간식 줄 거냥?”';
  $('nickname').focus();
});
async function loadRanking() {
  $('refresh').disabled = true;
  $('rank-status').textContent = '기록을 불러오는 중이에요.';
  try {
    const rows = await api('ranking');
    $('board').tBodies[0].replaceChildren(...rows.map(row => {
      const tr = document.createElement('tr');
      for (const value of [row.rank + '위', row.nickname, row.score + '점', row.weight + ' kg']) {
        const td = tr.insertCell();
        td.textContent = value;
      }
      return tr;
    }));
    $('board').hidden = !rows.length;
    $('rank-status').textContent = rows.length ? '' : '아직 순위 기록이 없어요. 첫 기록에 도전해 보세요!';
  } catch {
    $('rank-status').textContent = '순위를 불러오지 못했어요. 새로고침 버튼을 눌러 주세요.';
  } finally {
    $('refresh').disabled = false;
  }
}
$('refresh').addEventListener('click', loadRanking);
loadRanking();
