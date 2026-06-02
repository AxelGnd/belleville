const API = 'https://belleville-backend.onrender.com/api';
const socket = io('https://belleville-backend.onrender.com');

let state = {
  game_id: null,
  player_slot: null,
  pseudo: null,
  role: null,
};

let pollingInterval = null;

const ROLES = [
  { id:'promoteur',    icon:'🏘', name:'The Promoter',     desc:'2 Residential Lv2' },
  { id:'scientifique', icon:'🔬', name:'The Scientist',     desc:'Research + Hospital Lv2' },
  { id:'ecologiste',   icon:'🌿', name:'The Ecologist',     desc:'4 Green + Pollution < 3' },
  { id:'industriel',   icon:'🏭', name:'The Industrialist', desc:'Fossil Lv2 + Poll > 15' },
  { id:'maire',        icon:'🏛', name:'The Mayor',         desc:'All public buildings Lv1+' },
  { id:'banquier',     icon:'💰', name:'The Banker',        desc:'12 cr + Residential Lv2' },
  { id:'urbaniste',    icon:'📐', name:'The Urbanist',      desc:'4 Residential + School Lv2' },
  { id:'technocrate',  icon:'⚙️', name:'The Technocrat',    desc:'Research Lv2 + 3 Green' },
];

const BUILDING_ICONS = {
  hopital:'🏥', ecole:'🏫', recherche:'🔬',
  residentiel:'🏘', eolienne:'💨', solaire:'☀️', parc:'🌳'
};

const BUILDING_NAMES = {
  hopital:'Hospital', ecole:'School', recherche:'Research Center',
  residentiel:'Residential', eolienne:'Wind Turbine', solaire:'Solar Panel', parc:'Park'
};

function show(html) {
  document.getElementById('app').innerHTML = html;
}

function getRoleName(roleId) {
  const role = ROLES.find(r => r.id === roleId);
  return role ? role.name : roleId;
}

function getRoleIcon(roleId) {
  const role = ROLES.find(r => r.id === roleId);
  return role ? role.icon : '❓';
}

function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

// ── VUE 1 : Accueil ──────────────────────────────────────────
async function renderWelcome() {
  stopPolling();

  show(`
    <div class="badge badge-green">🟢 Game ready</div>
    <h1>Belle<br>ville</h1>
    <p>Board game companion app.<br>Scan the QR code to join the game.</p>
    <button class="btn btn-primary" onclick="showJoinForm()">+ New Player</button>
    <div class="sep"></div>
    <h3>Players joined (<span id="player-count">0</span>/4)</h3>
    <div id="players-list"><div class="empty-msg">No players yet...</div></div>
  `);

  // Polling toutes les 3 secondes
  await refreshPlayersList();
  pollingInterval = setInterval(refreshPlayersList, 3000);
}

async function refreshPlayersList() {
  try {
    const res = await fetch(`${API}/players/current`);
    if (!res.ok) return;
    const players = await res.json();

    const countEl = document.getElementById('player-count');
    const listEl  = document.getElementById('players-list');
    if (!countEl || !listEl) return;

    countEl.textContent = players.length;

    if (players.length === 0) {
      listEl.innerHTML = `<div class="empty-msg">No players yet...</div>`;
      return;
    }

    listEl.innerHTML = players.map(p => `
      <div class="player-joined">
        <div class="player-avatar">${p.pseudo[0].toUpperCase()}</div>
        <div class="player-info">
          <div class="player-name">${p.pseudo}</div>
          <div class="player-role" style="color:#6b7280">Role hidden 🤫</div>
        </div>
        <span class="badge badge-green">✓</span>
      </div>
    `).join('');
  } catch(e) {}
}

function showJoinForm() {
  stopPolling();
  show(`
    <button class="back-btn" onclick="renderWelcome()">← Back</button>
    <h2>Join the game</h2>
    <label>Your nickname</label>
    <input id="pseudo" type="text" placeholder="Ex: Marie" maxlength="16" />
    <div id="err" class="error" style="display:none">Nickname must be at least 2 characters.</div>
    <button class="btn btn-primary" onclick="spinWheel()">Spin the wheel →</button>
  `);
}

// ── VUE 2 : Roue des rôles ───────────────────────────────────
async function spinWheel() {
  const pseudo = document.getElementById('pseudo').value.trim();
  if (pseudo.length < 2) {
    document.getElementById('err').style.display = 'block';
    return;
  }
  state.pseudo = pseudo;

  let takenRoles = [];
  try {
    const res = await fetch(`${API}/players/current`);
    if (res.ok) {
      const players = await res.json();
      takenRoles = players.map(p => p.role);
    }
  } catch(e) {}

  const availableRoles = ROLES.filter(r => !takenRoles.includes(r.id));

  if (availableRoles.length === 0) {
    alert('All roles are taken! The game is full.');
    return;
  }

  showWheelAnimation(availableRoles, takenRoles);
}

function showWheelAnimation(availableRoles, takenRoles) {
  const allRoles = ROLES;
  const chosenRole = availableRoles[Math.floor(Math.random() * availableRoles.length)];
  const segmentAngle = 360 / allRoles.length;
  const chosenIndex = allRoles.findIndex(r => r.id === chosenRole.id);
  const totalSpins = 6;
  const finalAngle = totalSpins * 360 + (360 - chosenIndex * segmentAngle - segmentAngle / 2);

  const cx = 110, cy = 110, r = 100;
  const colors = ['#14532d','#1e3a5f','#6b1a1a','#3b1f6b','#0d4a3a','#5a3200','#1a2a4a','#2d4a1a'];

  const segments = allRoles.map((role, i) => {
    const startAngle = (i * segmentAngle - 90) * Math.PI / 180;
    const endAngle   = ((i + 1) * segmentAngle - 90) * Math.PI / 180;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);

    // Centre de l'icône au milieu du segment
    const midAngle = (startAngle + endAngle) / 2;
    const tx = cx + (r * 0.62) * Math.cos(midAngle);
    const ty = cy + (r * 0.62) * Math.sin(midAngle);

    return `
      <path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 0,1 ${x2},${y2} Z"
            fill="${colors[i % colors.length]}"
            stroke="#0f1923" stroke-width="2"/>
      <text x="${tx}" y="${ty}"
            text-anchor="middle"
            dominant-baseline="central"
            font-size="18">${role.icon}</text>
    `;
  }).join('');

  show(`
    <div class="wheel-popup">
      <h2>Spinning your role...</h2>
      <div class="wheel-outer">
        <div class="wheel-pointer">▼</div>
        <div id="wheel-wrapper" style="
          transform: rotate(0deg);
          transition: none;
          width: 220px;
          height: 220px;
          border-radius: 50%;
          overflow: hidden;
          border: 3px solid #22c55e;
          box-shadow: 0 0 20px #22c55e44;
        ">
          <svg width="220" height="220" viewBox="0 0 220 220" xmlns="http://www.w3.org/2000/svg">
            ${segments}
            <circle cx="110" cy="110" r="14" fill="#0f1923" stroke="#22c55e" stroke-width="2"/>
          </svg>
        </div>
      </div>
      <div id="wheel-result" style="display:none;animation:fadeIn .5s ease">
        <div class="role-reveal">
          <div class="role-icon-big" id="result-icon"></div>
          <div class="role-name-big" id="result-name"></div>
          <div class="role-desc-reveal" id="result-desc"></div>
        </div>
        <p style="color:#9ca3af;font-size:13px;margin:1rem 0">🤫 Keep your role secret!</p>
        <button class="btn btn-primary" id="enter-btn">Enter the city →</button>
      </div>
    </div>
  `);

  setTimeout(() => {
    const wheel = document.getElementById('wheel-wrapper');
    if (!wheel) return;
    wheel.style.transition = 'transform 4s cubic-bezier(0.25, 0.1, 0.25, 1)';
    wheel.style.transform  = `rotate(${finalAngle}deg)`;
  }, 100);

  setTimeout(() => {
    const resultEl = document.getElementById('wheel-result');
    if (!resultEl) return;
    document.getElementById('result-icon').textContent = chosenRole.icon;
    document.getElementById('result-name').textContent = chosenRole.name;
    document.getElementById('result-desc').textContent = chosenRole.desc;
    resultEl.style.display = 'block';
    document.getElementById('enter-btn').onclick = () => joinWithRole(chosenRole.id);
  }, 4300);
}
async function joinWithRole(roleId) {
  state.role = roleId;

  const res = await fetch(`${API}/players/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pseudo: state.pseudo, role: state.role }),
  });

  const data = await res.json();
  if (!res.ok) return alert(data.error);

  state.game_id    = data.game_id;
  state.player_slot = data.players.find(p => p.pseudo === state.pseudo)?.slot;

  socket.emit('join_game', state.game_id);
  socket.emit('player_joined', { game_id: state.game_id, players: data.players });

  renderLobby(data.players);
}

// ── VUE 3 : Lobby ───────────────────────────────────────────
function renderLobby(players) {
  stopPolling();

  const cards = [1,2,3,4].map(slot => {
    const p = players.find(p => p.slot === slot);
    if (p) {
      const isMe = p.pseudo === state.pseudo;
      return `
        <div class="player-card">
          <div class="player-avatar large">${p.pseudo[0].toUpperCase()}</div>
          <div class="player-card-name">${p.pseudo}</div>
          <div class="player-card-role">${isMe ? '🤫 Your role is secret' : 'Role hidden 🤫'}</div>
          <span class="badge badge-green">Ready ✓</span>
        </div>`;
    }
    return `
      <div class="player-card empty">
        <div class="player-avatar large" style="color:#6b7280">?</div>
        <div class="player-card-name" style="color:#6b7280">Waiting...</div>
        <div class="player-card-role">—</div>
      </div>`;
  }).join('');

  const canStart = players.length === 4;

  show(`
    <div class="lobby-header">
      <h1>Belleville</h1>
      <div class="lobby-count">${players.length}<span>/4</span></div>
    </div>
    <p>Waiting for all players to join...</p>
    <div class="player-cards-grid">${cards}</div>
    <div class="sep"></div>
    ${canStart
      ? `<button class="btn btn-primary" onclick="startGame()">🌿 Start the game!</button>`
      : `<div style="text-align:center;color:#6b7280;font-size:13px">Waiting for ${4 - players.length} more player(s)...</div>`
    }
  `);

  pollingInterval = setInterval(async () => {
    try {
      const res = await fetch(`${API}/players/current`);
      if (res.ok) {
        const updatedPlayers = await res.json();
        if (updatedPlayers.length !== players.length) {
          renderLobby(updatedPlayers);
        }
      }
    } catch(e) {}
  }, 3000);
}

async function loadGame() {
  const res  = await fetch(`${API}/game/${state.game_id}/state`);
  const data = await res.json();
  renderGame(data);
}

function pollColor(p) {
  if (p < 8)  return '#22c55e';
  if (p < 15) return '#f59e0b';
  return '#ef4444';
}

function renderGame(data) {
  const { game, players, buildings, logs } = data;
  const me = players.find(p => p.slot === state.player_slot);
  const pct   = (game.pollution / 20) * 100;
  const color = pollColor(game.pollution);

  const buildingRows = buildings.map(b => {
    const pip0  = `<div class="b-pip ${b.level >= 1 ? 'on' : ''}"></div>`;
    const pip1  = `<div class="b-pip ${b.level >= 2 ? 'on' : ''}"></div>`;
    const canUp = b.level < 2;
    return `
      <div class="building-row">
        <span class="b-icon">${BUILDING_ICONS[b.type] || '🏗'}</span>
        <div class="b-info">
          <div class="b-name">${BUILDING_NAMES[b.type] || b.type}</div>
          <div class="b-level">Level ${b.level}</div>
        </div>
        <div class="b-pips">${pip0}${pip1}</div>
        ${canUp
          ? `<button class="btn btn-secondary" style="width:auto;padding:6px 10px;font-size:12px;margin:0" onclick="upgrade(${b.id})">+</button>`
          : `<span style="font-size:18px">✅</span>`}
      </div>`;
  }).join('');

  const logHtml = logs.map(l =>
    `<div class="log-entry">• ${l.message}</div>`
  ).join('');

  show(`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
      <div>
        <div style="font-size:20px;font-weight:800">Belleville</div>
        <div style="font-size:12px;color:#9ca3af">${me?.pseudo} — ${me?.credits} cr</div>
      </div>
      <span class="badge badge-blue">Year ${game.turn}</span>
    </div>
    <div class="pollution-bar">
      <div class="pbar-header">
        <span style="font-size:14px;font-weight:600">☁ Pollution</span>
        <span class="pbar-val" style="color:${color}">${game.pollution}</span>
      </div>
      <div class="pbar-track">
        <div class="pbar-fill" style="width:${pct}%;background:${color}"></div>
      </div>
      <div class="pbar-legend"><span>0</span><span>⚠ 15</span><span>💀 20</span></div>
    </div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">💰 Your credits</div><div class="stat-val">${me?.credits}</div></div>
      <div class="stat-card"><div class="stat-label">👥 Players</div><div class="stat-val">${players.length}</div></div>
    </div>
    <h3>Buildings</h3>
    ${buildingRows}
    <div class="sep"></div>
    <button class="btn btn-secondary" onclick="depollute()">🌱 Depollution (3 cr → -1 pollution)</button>
    <button class="btn btn-primary" onclick="endTurn()">End turn →</button>
    <div class="sep"></div>
    <h3>Game log</h3>
    <div>${logHtml}</div>
  `);
}

async function upgrade(building_id) {
  const res = await fetch(`${API}/game/${state.game_id}/upgrade`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ building_id, player_slot: state.player_slot }),
  });
  const data = await res.json();
  if (!res.ok) return alert(data.error);
  socket.emit('game_update', { game_id: state.game_id });
  loadGame();
}

async function depollute() {
  const res = await fetch(`${API}/game/${state.game_id}/depollute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ player_slot: state.player_slot }),
  });
  const data = await res.json();
  if (!res.ok) return alert(data.error);
  alert(`✅ Pollution reduced by ${data.reduction} step(s)!`);
  loadGame();
}

async function endTurn() {
  const res  = await fetch(`${API}/game/${state.game_id}/end-turn`, { method: 'POST' });
  const data = await res.json();
  if (data.lost) {
    alert('💀 Defeat! Pollution reached 20. The city is lost.');
  } else {
    alert(`📊 Report — Demand: ${data.demand} | Green: ${data.green} | Fossil: ${data.fossil_covers} | +${data.pollution_add} pollution`);
  }
  socket.emit('game_update', { game_id: state.game_id });
  loadGame();
}

socket.on('state_update', () => loadGame());

renderWelcome();