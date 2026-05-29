const API = 'https://belleville-backend.onrender.com/api';
const socket = io('https://belleville-backend.onrender.com');

let state = {
  game_id: null,
  player_slot: null,
  pseudo: null,
  role: null,
};

const ROLES = [
  { id:'promoteur',    icon:'🏘', name:'The Promoter',     desc:'2 Residential Lv2' },
  { id:'scientifique', icon:'🔬', name:'The Scientist',     desc:'Research + Hospital Lv2' },
  { id:'ecologiste',   icon:'🌿', name:'The Ecologist',     desc:'4 Green + Pollution < 3' },
  { id:'industriel',   icon:'🏭', name:'The Industrialist', desc:'Fossil Lv2 + Poll > 15' },
  { id:'maire',        icon:'🏛', name:'The Mayor',         desc:'All public buildings Lv1+' },
  { id:'banquier',     icon:'💰', name:'The Banker',        desc:'12 cr + Residential Lv2' },
  { id:'urbaniste',    icon:'📐', name:'The Urbanist',      desc:'4 Residential + School Lv2' },
  { id:'technocrate',  icon:'⚙', name:'The Technocrat',    desc:'Research Lv2 + 3 Green' },
];

const EVENTS = [
  { type:'neg', title:'Cold Wave',            desc:'All Residential buildings consume +1 Energy this turn.' },
  { type:'neg', title:'Toxic Leak ☣',         desc:'+2 Pollution immediately.' },
  { type:'neg', title:'Material Shortage',    desc:'Upgrading a building costs +1 cr this turn.' },
  { type:'neg', title:'Cloudy & No Wind',     desc:'Green Energy produces 0 this turn.' },
  { type:'neg', title:'Respiratory Crisis ☣', desc:'Each player loses 1 cr.' },
  { type:'pos', title:'European Subsidies',   desc:'Each player receives +2 cr immediately.' },
  { type:'pos', title:'Tech Breakthrough',    desc:'Upgrading to Lv2 costs 2 cr less this turn.' },
  { type:'pos', title:'Earth Day',            desc:'Next depollution action this turn is free.' },
  { type:'neu', title:'Municipal Elections',  desc:'No Grand Project this turn: +1 Pollution.' },
  { type:'neu', title:'Ecological Audit',     desc:'Fossil Lv2: +2 Poll. Fossil Lv1: -1 Poll.' },
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

// ── VUE 1 : Accueil ──────────────────────────────────────────
async function renderWelcome() {
  // Récupère les joueurs déjà connectés
  let players = [];
  try {
    const res = await fetch(`${API}/players/current`);
    if (res.ok) players = await res.json();
  } catch(e) {}

  const playersList = players.length > 0
    ? players.map(p => `
        <div class="player-joined">
          <div class="player-avatar">${p.pseudo[0].toUpperCase()}</div>
          <div class="player-info">
            <div class="player-name">${p.pseudo}</div>
            <div class="player-role">${getRoleName(p.role)}</div>
          </div>
          <span class="badge badge-green">✓</span>
        </div>
      `).join('')
    : `<div style="text-align:center;color:#6b7280;font-size:13px;padding:1rem">No players yet...</div>`;

  show(`
    <div class="badge badge-green">🟢 Game in progress</div>
    <h1>Belle<br>ville</h1>
    <p>Board game companion app.<br>Scan the QR code to join the game.</p>

    <button class="btn btn-primary" onclick="showJoinForm()">+ New Player</button>

    <div class="sep"></div>
    <h3>Players joined (${players.length}/4)</h3>
    <div id="players-list">${playersList}</div>
  `);
}

function getRoleName(roleId) {
  const role = ROLES.find(r => r.id === roleId);
  return role ? role.name : roleId;
}

function showJoinForm() {
  show(`
    <button class="back-btn" onclick="renderWelcome()">← Back</button>
    <h2>Join the game</h2>
    <label>Your nickname</label>
    <input id="pseudo" type="text" placeholder="Ex: Marie" maxlength="16" />
    <label>Your player number</label>
    <select id="slot">
      <option value="1">Player 1</option>
      <option value="2">Player 2</option>
      <option value="3">Player 3</option>
      <option value="4">Player 4</option>
    </select>
    <div id="err" class="error" style="display:none">Nickname too short.</div>
    <button class="btn btn-primary" onclick="spinWheel()">Join →</button>
  `);
}

// ── VUE 2 : Roue des rôles ───────────────────────────────────
async function spinWheel() {
  const pseudo = document.getElementById('pseudo').value.trim();
  const slot   = document.getElementById('slot').value;

  if (pseudo.length < 2) {
    document.getElementById('err').style.display = 'block';
    return;
  }

  state.pseudo      = pseudo;
  state.player_slot = parseInt(slot);

  // Récupère les rôles déjà pris
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
    alert('All roles are taken!');
    return;
  }

  // Affiche le pop-up avec la roue
  showWheelPopup(availableRoles);
}

function showWheelPopup(availableRoles) {
  // Choisit le rôle aléatoirement
  const chosenRole = availableRoles[Math.floor(Math.random() * availableRoles.length)];

  show(`
    <div class="wheel-popup">
      <h2>Spinning the wheel...</h2>
      <div class="wheel-container">
        <div class="wheel" id="wheel">
          ${availableRoles.map((r, i) => `
            <div class="wheel-segment" style="--i:${i};--total:${availableRoles.length}">
              <span>${r.icon}</span>
            </div>
          `).join('')}
        </div>
        <div class="wheel-arrow">▼</div>
      </div>
      <div class="wheel-result" id="wheel-result" style="display:none">
        <div class="role-reveal">
          <div class="role-icon-big">${chosenRole.icon}</div>
          <div class="role-name-big">${chosenRole.name}</div>
          <div class="role-desc-reveal">${chosenRole.desc}</div>
        </div>
        <p style="color:#9ca3af;font-size:13px;margin-top:1rem">This is your secret objective!</p>
        <button class="btn btn-primary" onclick="joinWithRole('${chosenRole.id}')">Enter the city →</button>
      </div>
    </div>
  `);

  // Animation de la roue
  const wheel = document.getElementById('wheel');
  wheel.style.transition = 'transform 3s cubic-bezier(0.17, 0.67, 0.12, 0.99)';
  wheel.style.transform  = `rotate(${720 + Math.random() * 360}deg)`;

  setTimeout(() => {
    document.getElementById('wheel-result').style.display = 'block';
  }, 3200);
}

async function joinWithRole(roleId) {
  state.role = roleId;

  const res = await fetch(`${API}/players/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pseudo: state.pseudo,
      slot:   state.player_slot,
      role:   state.role,
    }),
  });

  const data = await res.json();
  if (!res.ok) return alert(data.error);

  state.game_id = data.game_id;
  socket.emit('join_game', state.game_id);
  socket.emit('player_joined', { game_id: state.game_id, players: data.players });

  renderLobby(data.players);
}

// ── VUE 3 : Lobby ───────────────────────────────────────────
function renderLobby(players) {
  const cards = players.map(p => `
    <div class="player-card">
      <div class="player-avatar large">${p.pseudo[0].toUpperCase()}</div>
      <div class="player-card-name">${p.pseudo}</div>
      <div class="player-card-role">${getRoleName(p.role)}</div>
      <span class="badge badge-green">Ready</span>
    </div>
  `).join('');

  const emptySlots = 4 - players.length;
  const empty = Array(emptySlots).fill(`
    <div class="player-card empty">
      <div class="player-avatar large">?</div>
      <div class="player-card-name">Waiting...</div>
      <div class="player-card-role">—</div>
    </div>
  `).join('');

  const canStart = players.length === 4;

  show(`
    <div class="lobby-header">
      <h1>Belleville</h1>
      <div class="lobby-count">${players.length}<span>/4</span></div>
    </div>
    <p>Waiting for all players to join...</p>

    <div class="player-cards-grid">
      ${cards}${empty}
    </div>

    <div class="sep"></div>

    ${canStart
      ? `<button class="btn btn-primary" onclick="startGame()">🌿 Start the game!</button>`
      : `<div style="text-align:center;color:#6b7280;font-size:13px">Waiting for ${emptySlots} more player(s)...</div>`
    }
  `);
}

socket.on('lobby_update', ({ players }) => renderLobby(players));

// ── VUE 4 : Jeu ─────────────────────────────────────────────
async function startGame() {
  await fetch(`${API}/game/${state.game_id}/start`, { method: 'POST' });
  socket.emit('game_update', { game_id: state.game_id });
  loadGame();
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
    const pip0 = `<div class="b-pip ${b.level >= 1 ? 'on' : ''}"></div>`;
    const pip1 = `<div class="b-pip ${b.level >= 2 ? 'on' : ''}"></div>`;
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

  const event = EVENTS[Math.floor(Math.random() * EVENTS.length)];

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

    <h3>Event this turn</h3>
    <div class="event-card ${event.type}">
      <div class="event-title">${event.title}</div>
      <div class="event-desc">${event.desc}</div>
    </div>

    <h3>Buildings</h3>
    ${buildingRows}

    <div class="sep"></div>
    <button class="btn btn-secondary" onclick="depollute()">🌱 Depollution campaign (3 cr → -1 pollution)</button>
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

// ── Démarrage ────────────────────────────────────────────────
renderWelcome();