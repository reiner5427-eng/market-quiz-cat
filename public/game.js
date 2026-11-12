const $ = id => document.getElementById(id);
const topics = { A: '시장경제와 가계·기업', B: '경제성장과 우리 생활', C: '세계 속의 무역' };
let game, deadline, timer, step, current, upcoming, busy, ending, review;
const NICKNAME_WARNING_KEY = 'quiz.nicknameWarnings';
const WARNING_URL = 'http://warning.or.kr/';
let nicknameWarnings = 0;
try {
  nicknameWarnings = sessionStorage.getItem(NICKNAME_WARNING_KEY) === '1' ? 1 : 0;
} catch {
  // Keep the warning count in memory when browser storage is unavailable.
}

function setNicknameWarnings(count) {
  nicknameWarnings = count;
  try {
    sessionStorage.setItem(NICKNAME_WARNING_KEY, String(count));
  } catch {
    // The in-memory count is still available for this page.
  }
}

async function api(route, body) {
  const response = await fetch('/api/' + route, body ? {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  } : {});
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error);
    error.code = data.code;
    throw error;
  }
  return data;
}
function showMessage(message = '') {
  $('message').textContent = message;
  $('message').hidden = !message;
}
function showCatGrowth(cat, value) {
  const fullness = 1 - Math.exp(-value / 65);
  cat.style.setProperty('--growth', (1 + 1.05 * fullness).toFixed(3));
  cat.style.setProperty('--blush', (.45 + .55 * fullness).toFixed(3));
}
function updateScore(value, kg) {
  showCatGrowth($('cat'), value);
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
function showLives(remaining) {
  const meter = $('lives');
  const full = document.createElement('span');
  const empty = document.createElement('span');
  full.className = 'full-hearts';
  full.textContent = '♥'.repeat(remaining);
  empty.className = 'empty-hearts';
  empty.textContent = '♡'.repeat(game.lives - remaining);
  full.setAttribute('aria-hidden', 'true');
  empty.setAttribute('aria-hidden', 'true');
  meter.replaceChildren(full, empty, ' 하트 ' + remaining + '/' + game.lives);
}
function tick() {
  const left = Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
  $('clock').textContent = '⏱ ' + left + '초';
  $('timebar').value = left;
  if (!left && !busy) finish();
}
const catPicker = $('cat-picker');
const catNames = new Map(Array.from(catPicker.querySelectorAll('input'), input =>
  [input.value, input.labels[0].textContent.trim()]));
const selectedCoat = () => catPicker.querySelector('input:checked').value;
function previewCat() {
  const coat = selectedCoat();
  const name = catNames.get(coat);
  $('cat').dataset.coat = coat;
  $('cat').setAttribute('aria-label', name + ', 간식을 먹을수록 배가 커지는 고양이');
  $('cat-name').textContent = name;
}
catPicker.addEventListener('change', previewCat);
previewCat();

$('start').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.submitter;
  if (button.disabled) return;
  let redirecting = false;
  button.disabled = true;
  catPicker.disabled = true;
  showMessage();
  try {
    game = await api('start', { nickname: $('nickname').value, coat: selectedCoat() });
    deadline = performance.now() + game.remainingMs;
    step = 0;
    busy = ending = false;
    review = [];
    $('welcome').hidden = true;
    $('playing').hidden = false;
    updateScore(0, '3.00');
    showLives(game.lives);
    $('cat-says').textContent = '“야옹! 간식 줄 거냥?”';
    showQuestion(game.question);
    timer = setInterval(tick, 200);
    tick();
  } catch (error) {
    if (error.code === 'nickname_warning') {
      const count = nicknameWarnings + 1;
      redirecting = count === 2;
      setNicknameWarnings(redirecting ? 0 : count);
      const notice = $('nickname-notice').textContent;
      const next = redirecting ? ' Warning.or.kr로 이동합니다.' : '';
      showMessage(error.message + ' ' + notice + ' (경고 ' + count + '/2회)' + next);
      if (redirecting) {
        window.setTimeout(() => {
          button.disabled = false;
          catPicker.disabled = false;
          window.location.assign(WARNING_URL);
        }, 1000);
      }
    } else {
      showMessage(error.message);
    }
  } finally {
    if (!redirecting) {
      button.disabled = false;
      catPicker.disabled = false;
    }
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
    if (data.finished && !data.explanation) return showResult(data);
    showLives(data.lives);
    const correctText = current.choices[data.correctIndex];
    const explanation = '정답: ' + correctText + ' · ' + data.explanation;
    review.push({ prompt: current.prompt, explanation, correct: data.correct });
    if (data.finished) return showResult(data, explanation);
    updateScore(data.score, data.weight);
    buttons[data.correctIndex].classList.add('good');
    if (!data.correct) buttons[choice].classList.add('wrong');
    const feedback = $('feedback');
    feedback.className = data.correct ? 'good' : 'wrong';
    showCountryLabels(feedback, (data.correct ? '정답! 간식 +1 🐟 · ' : '오답! 하트 −1 · ') + explanation);
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
function showResult(data, lastExplanation = '') {
  clearInterval(timer);
  showMessage();
  updateScore(data.score, data.weight);
  $('playing').hidden = true;
  $('result').hidden = false;
  $('result-title').textContent = data.lives === 0 ? '하트를 모두 잃었어요!' : '퀴즈 끝!';
  const lastAnswer = $('last-answer');
  lastAnswer.hidden = !lastExplanation;
  if (lastExplanation) showCountryLabels(lastAnswer, lastExplanation);
  $('summary').textContent = '정답 ' + data.correctCount + '개 · ' + data.score + '점 · ' + data.weight + ' kg';
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
function showRankingCat(cell, coat, points) {
  const name = catNames.get(coat);
  if (!name) {
    cell.textContent = '—';
    cell.setAttribute('aria-label', '고양이 정보 없음');
    return;
  }
  const portrait = $('cat').cloneNode(true);
  portrait.removeAttribute('id');
  portrait.removeAttribute('class');
  portrait.removeAttribute('style');
  portrait.removeAttribute('role');
  portrait.removeAttribute('aria-label');
  portrait.setAttribute('class', 'rank-cat');
  portrait.setAttribute('aria-hidden', 'true');
  portrait.dataset.coat = coat;
  showCatGrowth(portrait, points);
  cell.append(portrait, name);
}
let rankingRows = [];
let rankingPage = 1;
const RANKING_PAGE_SIZE = 50;
const rankingPageButtons = [1, 2, 3, 4].map(page => $('rank-page-' + page));
function renderRanking() {
  rankingPage = Math.min(rankingPage, Math.max(1, Math.ceil(rankingRows.length / RANKING_PAGE_SIZE)));
  const offset = (rankingPage - 1) * RANKING_PAGE_SIZE;
  const rows = rankingRows.slice(offset, offset + RANKING_PAGE_SIZE);
  $('board').tBodies[0].replaceChildren(...rows.map(row => {
    const tr = document.createElement('tr');
    tr.insertCell().textContent = row.rank + '위';
    tr.insertCell().textContent = row.nickname;
    showRankingCat(tr.insertCell(), row.coat, row.score);
    tr.insertCell().textContent = row.score + '점';
    tr.insertCell().textContent = row.weight + ' kg';
    return tr;
  }));
  for (const [i, button] of rankingPageButtons.entries()) {
    button.disabled = i > 0 && i * RANKING_PAGE_SIZE >= rankingRows.length;
    if (rankingPage === i + 1) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  $('board').hidden = !rows.length;
  $('rank-status').textContent = rows.length
    ? rows[0].rank + '~' + rows[rows.length - 1].rank + '위 · 전체 ' + rankingRows.length + '명'
    : '아직 순위 기록이 없어요. 첫 기록에 도전해 보세요!';
}
for (const [i, button] of rankingPageButtons.entries()) {
  button.addEventListener('click', () => {
    rankingPage = i + 1;
    renderRanking();
  });
}
async function loadRanking() {
  $('refresh').disabled = true;
  $('rank-status').textContent = '기록을 불러오는 중이에요.';
  try {
    rankingRows = await api('ranking');
    renderRanking();
  } catch {
    $('rank-status').textContent = '순위를 불러오지 못했어요. 새로고침 버튼을 눌러 주세요.';
  } finally {
    $('refresh').disabled = false;
  }
}
$('refresh').addEventListener('click', loadRanking);
loadRanking();
