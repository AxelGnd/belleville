const API = 'http://localhost:3000/api';
const socket = io('http://localhost:3000');

let state = {
  game_id: null,
  player_slot: null,
  pseudo: null,
  role: null,
};

const ROLES = [
  { id:'promoteur',    icon:'🏘', name:'Le Promoteur',    desc:'2 Résidentiels Nv2' },
  { id:'scientifique', icon:'🔬', name:'Le Scientifique',  desc:'Recherche + Hôpital Nv2' },
  { id:'ecologiste',   icon:'🌿', name:'L\'Écologiste',    desc:'4 Vertes + Pollution < 3' },
  { id:'industriel',   icon:'🏭', name:'L\'Industriel',    desc:'Fossile Nv2 + Poll > 15' },
  { id:'maire',        icon:'🏛', name:'Le Maire',         desc:'Tous publics Nv1+' },
  { id:'banquier',     icon:'💰', name:'Le Banquier',      desc:'12 cr + Résidentiel Nv2' },
  { id:'urbaniste',    icon:'📐', name:'L\'Urbaniste',     desc:'4 Résidentiels + École Nv2' },
  { id:'technocrate',  icon:'⚙', name:'Le Technocrate',   desc:'Recherche Nv2 + 3 Vertes' },
];

const EVENTS = [
  { type:'neg', title:'Vague de Froid',         desc:'Résidentiels consomment +1 Énergie ce tour.' },
  { type:'neg', title:'Fuite Toxique ☣',        desc:'+2 Pollution immédiatement.' },
  { type:'neg', title:'Pénurie de matériaux',   desc:'Améliorer coûte +1 cr ce tour.' },
  { type:'neg', title:'Ciel Couvert',           desc:'Énergies Vertes produisent 0 ce tour.' },
  { type:'neg', title:'Crise Respiratoire ☣',  desc:'Chaque joueur perd 1 cr.' },
  { type:'pos', title:'Subventions Européennes',desc:'Chaque joueur reçoit +2 cr.' },
  { type:'pos', title:'Avancée Technologique',  desc:'Améliorer vers Nv2 coûte 2 cr de moins.' },
  { type:'pos', title:'Journée de la Terre',    desc:'Prochaine dépollution gratuite.' },
  { type:'neu', title:'Élections Municipales',  desc:'Sans Grand Projet ce tour : +1 Pollution.' },
  { type:'neu', title:'Audit Écologique',       desc:'Fossile Nv2 : +2 Poll. Fossile Nv1 : -1 Poll.' },
];

const BUILDING_ICONS = {
  hopital:'🏥', ecole:'🏫', recherche:'🔬',
  residentiel:'🏘', eolienne:'💨', solaire:'☀️', parc:'🌳'
};

function show(html) {
  document.getElementById('app').innerHTML = html;
}

// ── VUE 1 : Accueil ──────────────────────────────────────────
function renderWelcome() {
  show(`
    <div class="badge badge-green">🟢 Jeu en cours</div>
    <h1>Belle<br>ville</h1>
    <p>Application compagnon du jeu de plateau.<br>Scannez le QR code et rejoignez la partie.</p>
    <div class="sep"></div>
    <label>Votre pseudo</label>
    <input id="pseudo" type="text" placeholder="Ex: Marie" maxlength="16" />
    <label>Votre numéro de joueur</label>
    <select id="slot">
      <option value="1">Joueur 1</option>
      <option value="2">Joueur 2</option>
      <option value="3">Joueur 3</option>
      <option value="4">Joueur 4</option>
    </select>
    <div id="err" class="error" style="display:none">Pseudo trop court.</div>
    <button class="btn btn-primary" onclick="goToRoles()">Suivant →</button>
  `);
}

function goToRoles() {
  const pseudo = document.getElementById('pseudo').value.trim();
  const slot   = document.getElementById('slot').value;
  if (pseudo.length < 2) {
    document.getElementById('err').style.display = 'block';
    return;
  }
  state.pseudo      = pseudo;
  state.player_slot = parseInt(slot);
  renderRoles();
}

// ── VUE 2 : Rôles ───────────────────────────────────────────
function renderRoles() {
  const cards = ROLES.map(r => `
    <div class="role-card" id="role-${r.id}" onclick="selectRole('${r.id}')">
      <div class="role-icon">${r.icon}</div>
      <div class="role-name">${r.name}</div>
      <div class="role-desc">${r.desc}</div>
    </div>
  `).join('');

  show(`
    <button class="btn btn-secondary" onclick="renderWelcome()" style="margin-bottom:1rem">← Retour</button>
    <h2>Choisissez votre rôle secret</h2>
    <div class="role-grid">${cards}</div>
    <div id="role-err" class="error" style="display:none">Choisissez un rôle.</div>
    <button class="btn btn-primary" onclick="joinGame()">Rejoindre la partie →</button>
  `);
}

function selectRole(id) {
  document.querySelectorAll('.role-card').forEach(c => c.classList.remove('selected'));
  document.getElementById(`role-${id}`).classList.add('selected');
  state.role = id;
}

// ── VUE 3 : Lobby ───────────────────────────────────────────
async function joinGame() {
  if (!state.role) {
    document.getElementById('role-err').style.display = 'block';
    return;
  }

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

function renderLobby(players) {
  const rows = [1,2,3,4].map(slot => {
    const p = players.find(p => p.slot === slot);
    if (p) {
      return `
        <div class="player-row filled">
          <div class="player-avatar">${p.pseudo[0].toUpperCase()}</div>
          <div class="player-info">
            <div class="player-name">${p.pseudo}</div>
            <div class="player-role">${p.role}</div>
          </div>
          <span class="badge badge-green">✓</span>
        </div>`;
    }
    return `
      <div class="player-row empty">
        <div class="player-avatar">?</div>
        <div class="player-info">
          <div class="player-name">Joueur ${slot}</div>
          <div class="player-role">En attente…</div>
        </div>
      </div>`;
  }).join('');

  const canStart = players.length === 4;

  show(`
    <div class="wait-center">
      <div class="wait-count">${players.length}</div>
      <div class="wait-label">/ 4 joueurs connectés</div>
    </div>
    <div>${rows}</div>
    <div class="sep"></div>
    ${canStart
      ? `<button class="btn btn-primary" onclick="startGame()">🌿 Lancer la partie !</button>`
      : `<p style="text-align:center">En attente des autres joueurs…</p>`}
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
          <div class="b-name">${b.type}</div>
          <div class="b-level">Niveau ${b.level}</div>
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
      <span class="badge badge-blue">Année ${game.turn}</span>
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
      <div class="stat-card"><div class="stat-label">💰 Vos crédits</div><div class="stat-val">${me?.credits}</div></div>
      <div class="stat-card"><div class="stat-label">👥 Joueurs</div><div class="stat-val">${players.length}</div></div>
    </div>

    <h3>Événement du tour</h3>
    <div class="event-card ${event.type}">
      <div class="event-title">${event.title}</div>
      <div class="event-desc">${event.desc}</div>
    </div>

    <h3>Bâtiments</h3>
    ${buildingRows}

    <div class="sep"></div>
    <button class="btn btn-secondary" onclick="depollute()">🌱 Dépollution (3 cr → -1 pollution)</button>
    <button class="btn btn-primary" onclick="endTurn()">Fin du tour →</button>

    <div class="sep"></div>
    <h3>Journal</h3>
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
  alert(`✅ Pollution réduite de ${data.reduction} case(s) !`);
  loadGame();
}

async function endTurn() {
  const res  = await fetch(`${API}/game/${state.game_id}/end-turn`, { method: 'POST' });
  const data = await res.json();
  if (data.lost) {
    alert('💀 Défaite ! La pollution a atteint 20. La ville est perdue.');
  } else {
    alert(`📊 Bilan — Demande : ${data.demand} | Vert : ${data.green} | Fossile : ${data.fossil_covers} | +${data.pollution_add} pollution`);
  }
  socket.emit('game_update', { game_id: state.game_id });
  loadGame();
}

socket.on('state_update', () => loadGame());

// ── Démarrage ────────────────────────────────────────────────
renderWelcome();