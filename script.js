// --- State ---
let score1 = 0, score2 = 0;
let fouls1 = 0, fouls2 = 0;
let timeouts1 = 5, timeouts2 = 5;
let possession = 1; // 1 or 2
let period = 1;
let periodLength = parseInt(document?.getElementById('periodLength')?.value || 720); // seconds (default 12:00)
let clock = periodLength;
let clockInterval = null;
let isRunning = false;
let undoStack = [];
let autoNextPeriod = false;
const maxTimeouts = 5;

// helpers to get elements safely
const el = id => document.getElementById(id);
const soundEnabled = () => el('soundToggle') ? el('soundToggle').checked : true;

// --- Rendering / UI updates ---
function updateUI() {
  el('score1').innerText = score1;
  el('score2').innerText = score2;
  el('fouls1').innerText = fouls1;
  el('fouls2').innerText = fouls2;
  el('timeouts1').innerText = timeouts1;
  el('timeouts2').innerText = timeouts2;
  el('periodDisplay').innerText = period;
  el('possessionIndicator').innerText = possession === 1 ? el('team1Name').value : el('team2Name').value;
  updateClockDisplay();
  highlightLeader();
}

function updateClockDisplay() {
  const mm = Math.floor(clock / 60).toString().padStart(2,'0');
  const ss = (clock % 60).toString().padStart(2,'0');
  el('clockDisplay').innerText = `${mm}:${ss}`;
  el('startPauseBtn').innerText = isRunning ? 'Pause' : 'Start';
}

// highlight leader card
function highlightLeader() {
  const team1Card = el('team1Card');
  const team2Card = el('team2Card');
  team1Card.classList.remove('leader');
  team2Card.classList.remove('leader');
  if (el('team1Name') && el('team2Name') && document.querySelector('#toggleLeader')) {}
  if (score1 > score2) team1Card.classList.add('leader');
  else if (score2 > score1) team2Card.classList.add('leader');
  // tie => no highlight
}

// --- Sound: simple beep using WebAudio ---
function beep(freq=440, duration=0.08) {
  if (!soundEnabled()) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    o.connect(g);
    g.connect(ctx.destination);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.1, ctx.currentTime + 0.01);
    o.start();
    setTimeout(()=>{
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.01);
      o.stop(ctx.currentTime + 0.02);
      ctx.close();
    }, duration*1000);
  } catch(e) {
    // ignore audio errors
  }
}

// --- Log ---
function logPlay(text) {
  const t = new Date().toLocaleTimeString();
  el('playLog').value += `[${t}] ${text}\n`;
  el('playLog').scrollTop = el('playLog').scrollHeight;
}

// export log
function exportLog() {
  const text = el('playLog').value || 'No plays logged.';
  const blob = new Blob([text], {type: 'text/plain'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${el('team1Name').value}_vs_${el('team2Name').value}_playlog.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// clear log
function clearLog() {
  el('playLog').value = '';
}

// --- Game actions (scoring, fouls, timeouts) ---
function pushUndo(action) {
  // action: {type:'score', team:1, points:2} etc.
  undoStack.push(action);
  // optional limit
  if (undoStack.length > 200) undoStack.shift();
}

function addPoints(team, pts) {
  if (team === 1) {
    score1 += pts;
    pushUndo({type:'score', team:1, pts});
  } else {
    score2 += pts;
    pushUndo({type:'score', team:2, pts});
  }
  logPlay(`${teamName(team)} scored +${pts}. (${score1}-${score2})`);
  beep(880, 0.06);
  updateUI();
}

function addFoul(team) {
  if (team === 1) {
    fouls1 += 1;
    pushUndo({type:'foul', team:1});
  } else {
    fouls2 += 1;
    pushUndo({type:'foul', team:2});
  }
  logPlay(`${teamName(team)} committed a foul. Fouls: ${fouls1}-${fouls2}`);
  beep(220, 0.08);
  updateUI();
}

function useTimeout(team) {
  if (team === 1) {
    if (timeouts1 <= 0) { alert('No timeouts left for ' + teamName(1)); return; }
    timeouts1 -= 1;
    pushUndo({type:'timeout', team:1});
  } else {
    if (timeouts2 <= 0) { alert('No timeouts left for ' + teamName(2)); return; }
    timeouts2 -= 1;
    pushUndo({type:'timeout', team:2});
  }
  logPlay(`${teamName(team)} used a timeout. Timeouts left: ${timeouts1}-${timeouts2}`);
  beep(440, 0.08);
  updateUI();
}

function undo() {
  const action = undoStack.pop();
  if (!action) { alert('Nothing to undo'); return; }
  if (action.type === 'score') {
    if (action.team === 1) score1 -= action.pts;
    else score2 -= action.pts;
    logPlay(`Undo: removed ${action.pts} from ${teamName(action.team)}.`);
  } else if (action.type === 'foul') {
    if (action.team === 1) fouls1 = Math.max(0, fouls1 - 1);
    else fouls2 = Math.max(0, fouls2 - 1);
    logPlay(`Undo: removed a foul from ${teamName(action.team)}.`);
  } else if (action.type === 'timeout') {
    if (action.team === 1) timeouts1 = Math.min(maxTimeouts, timeouts1 + 1);
    else timeouts2 = Math.min(maxTimeouts, timeouts2 + 1);
    logPlay(`Undo: restored a timeout to ${teamName(action.team)}.`);
  }
  beep(300, 0.06);
  updateUI();
}

function teamName(team) {
  return team === 1 ? el('team1Name').value : el('team2Name').value;
}

// --- Possession ---
function togglePossession(team) {
  possession = team;
  el('pos1').innerText = team === 1 ? '●' : '○';
  el('pos2').innerText = team === 2 ? '●' : '○';
  updateUI();
  logPlay(`Possession -> ${teamName(team)}`);
}

// --- Clock control ---
function startPauseClock() {
  if (isRunning) {
    // pause
    clearInterval(clockInterval);
    clockInterval = null;
    isRunning = false;
    updateUI();
    return;
  }

  // start
  // Refresh periodLength if changed
  periodLength = parseInt(el('periodLength').value, 10) || periodLength;
  if (clock <= 0) clock = periodLength;
  isRunning = true;
  updateUI();
  clockInterval = setInterval(() => {
    if (clock > 0) {
      clock -= 1;
      if (clock <= 5) beep(1000, 0.02); // small beep in final seconds
      updateClockDisplay();
    } else {
      // period end
      clearInterval(clockInterval);
      clockInterval = null;
      isRunning = false;
      logPlay(`Period ${period} ended.`);
      beep(150, 0.18);
      if (el('autoNextPeriod') && el('autoNextPeriod').checked) {
        nextPeriod();
        newPeriodStart();
      } else {
        // keep clock at 0; UI updated
      }
    }
  }, 1000);
}

function resetClock() {
  clearInterval(clockInterval);
  clockInterval = null;
  isRunning = false;
  periodLength = parseInt(el('periodLength').value, 10) || periodLength;
  clock = periodLength;
  updateUI();
}

function newPeriodStart() {
  periodLength = parseInt(el('periodLength').value, 10) || periodLength;
  clock = periodLength;
  updateUI();
  startPauseClock(); // start automatically
}

// period controls
function nextPeriod() {
  period += 1;
  if (period > 4 && period <= 10) {
    // could be OT
  }
  logPlay(`Moved to period ${period}`);
  newPeriodStart();
}

function prevPeriod() {
  if (period > 1) {
    period -= 1;
    logPlay(`Moved to period ${period}`);
    newPeriodStart();
  }
}

// --- Game lifecycle ---
function endGame() {
  // stop clock
  clearInterval(clockInterval);
  clockInterval = null;
  isRunning = false;

  // determine winner
  let winnerText = '';
  if (score1 > score2) winnerText = `${el('team1Name').value} wins ${score1} — ${score2}`;
  else if (score2 > score1) winnerText = `${el('team2Name').value} wins ${score2} — ${score1}`;
  else winnerText = `It's a tie ${score1} — ${score2}`;

  el('winnerText').innerText = winnerText;
  const modal = new bootstrap.Modal(el('winnerModal'));
  modal.show();

  logPlay(`Game ended. ${winnerText}`);
  beep(600, 0.18);
}

function newGame() {
  // reset scores, fouls, timeouts but keep team names
  score1 = 0; score2 = 0;
  fouls1 = 0; fouls2 = 0;
  timeouts1 = maxTimeouts; timeouts2 = maxTimeouts;
  undoStack = [];
  period = 1;
  periodLength = parseInt(el('periodLength').value, 10) || periodLength;
  clock = periodLength;
  isRunning = false;
  clearInterval(clockInterval);
  clockInterval = null;
  clearLog();
  logPlay('New game started');
  updateUI();
}

function fullReset() {
  // resets everything including names and notes
  score1 = score2 = fouls1 = fouls2 = 0;
  timeouts1 = timeouts2 = maxTimeouts;
  period = 1;
  el('team1Name').value = 'Home';
  el('team2Name').value = 'Others';
  el('notes1').value = '';
  el('notes2').value = '';
  undoStack = [];
  periodLength = parseInt(el('periodLength').value, 10) || periodLength;
  clock = periodLength;
  isRunning = false;
  clearInterval(clockInterval);
  clockInterval = null;
  clearLog();
  logPlay('Full reset performed');
  updateUI();
}

// toggle leader highlight on/off (simple)
let leaderHighlight = true;
function toggleLeadingHighlight() {
  leaderHighlight = !leaderHighlight;
  if (!leaderHighlight) {
    el('team1Card').classList.remove('leader');
    el('team2Card').classList.remove('leader');
  } else {
    highlightLeader();
  }
}

// --- Init ---
function init() {
  // wire up listeners
  el('periodLength').addEventListener('change', () => {
    periodLength = parseInt(el('periodLength').value, 10) || periodLength;
    clock = periodLength;
    updateClockDisplay();
  });

  el('team1Name').addEventListener('input', () => updateUI());
  el('team2Name').addEventListener('input', () => updateUI());

  // set defaults
  timeouts1 = timeouts2 = maxTimeouts;
  possession = 1;
  el('pos1').innerText = '●';
  el('pos2').innerText = '○';
  updateUI();
}

window.addEventListener('load', init);
