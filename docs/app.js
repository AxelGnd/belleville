const API = 'https://belleville-backend.onrender.com/api';
const socket = io('https://belleville-backend.onrender.com');

let state = {
  game_id: null,
  player_slot: null,
  pseudo: null,
  role: null,
};

let pollingInterval = null;

// NOUVEAU — tableau ROLES avec lore + objectif séparés
const ROLES = [
  { id:'scientist', icon:'🔬', name:'The Scientist',
    lore:'As the head scientist of Belleville, you want to discover the next medical breakthrough. Major innovations often emerge when research and healthcare progress together.',
    desc:'Upgrade the Research Center to Level 2 and the Hospital to Level 2.' },
  { id:'ecologist', icon:'🌿', name:'The Ecologist',
    lore:'Ecology is at the heart of your vision for Belleville. Invest in renewable energy and reduce pollution before it is too late.',
    desc:'You win if the city has 4 Green Energy installations and the Pollution Gauge is below 5.' },
  { id:'industrialist', icon:'🏭', name:'The Industrialist',
    lore:'Industry keeps Belleville running, and economic growth comes first. Fossil fuels remain one of the most reliable energy sources, but they also generate significant pollution.',
    desc:'Upgrade the plant to Level 2 and push the Pollution Gauge above 15 to win.' },
  { id:'mayor', icon:'🏛', name:'The Mayor',
    lore:"As Mayor, your duty is to guarantee the well being of Belleville's citizens. Good schools, hospitals and public services are among the strongest indicators of a city's quality of life.",
    desc:'Make sure the Hospital, School and Research Center are all upgraded to at least Level 1 and at least 2 Residential Units are built.' },
  { id:'urbanist', icon:'📐', name:'The Urbanist',
    lore:'People need a place to live. Your research in urban planning shows that access to schools is a key factor in neighborhood development.',
    desc:'Build at least 3 Residential Buildings and upgrade the School to Level 2.' },
  { id:'head_doctor', icon:'🏥', name:'The Head Doctor',
    lore:"The health of Belleville's citizens depends on both medical care and air quality. Air pollution is linked to respiratory diseases and can shorten life expectancy.",
    desc:'Upgrade the Hospital to Level 2 and keep the Pollution Gauge below 3.' },
  { id:'engineer', icon:'⚙️', name:'The Engineer',
    lore:'As an engineer, you know renewable energy is the future and play a major role in reducing emissions.',
    desc:'Develop 2 different Green Energy installations (1 Solar Panel and 1 Wind Turbine) to Level 2 and help the city dismantle the Fossil Power Plant through a Grand Project.' },
  { id:'banker', icon:'💰', name:'The Banker',
    lore:'The city needs your money to fund its ambitious projects. Whether this money is earned sustainably or not is up to you.',
    desc:'You win if you own at least one Level 2 Residential Building, fund 2 public infrastructure and hold 12 Credits at the end of a round.' },
  { id:'activist', icon:'✊', name:'The Activist',
    lore:"The Fossil Power Plant is a threat to Belleville's future. Prevent it from being upgraded and push the city toward a pollution-free future.",
    desc:'You win if you launch 2 clean-up campaigns, the Power Plant remains at Level 1 and the Pollution Gauge reaches 0.' },
  { id:'developer', icon:'🏘', name:'The Property Developer',
    lore:'Belleville is growing rapidly, and new housing means new opportunities. Modern building renovations can significantly reduce energy consumption through better insulation and design.',
    desc:'Invest in residential development: own two Level 2 Residential Buildings to win and make sure the Pollution Gauge stays below 10.' },
  { id:'technocrat', icon:'💡', name:'The Technocrat',
    lore:'Innovations are the keys to a progressive city. Develop advanced research while maintaining a balanced energy transition.',
    desc:'You win if the Research Center reaches Level 2 and the city has 3 Green Energy installations.' },
  { id:'lobbyist', icon:'🤝', name:'The Fossil Lobbyist',
    lore:'Fossil power plants provide stable electricity even when wind and solar production fluctuate. You believe Belleville cannot afford to abandon traditional energy sources yet.',
    desc:'Upgrade the Fossil Power Plant to Level 2 and make sure the city has two Residential Buildings, and a Pollution level between 10 and 15.' },
  { id:'union_leader', icon:'👷', name:'The Union Leader',
    lore:'You represent the workers of Belleville. Protect employment and make sure healthcare remains a priority.',
    desc:'You win if the school gets built and if both the Hospital and the Fossil Power Plant reach Level 2.' },
  { id:'visionary', icon:'🔭', name:'The Visionary',
    lore:"Many of today's most successful cities invest simultaneously in research, housing and clean energy. You want Belleville to be built on the same model.",
    desc:'You win if the Research Center reaches Level 2, you own one Level 2 Residential Building, and the city has at least one Solar Panel and one Wind Turbine.' },
];

const BUILDING_ICONS = {
  hopital:'🏥', ecole:'🏫', recherche:'🔬',
  residentiel:'🏘', eolienne:'💨', solaire:'☀️',
  parc:'🌳', centrale_nucleaire:'⚛️'
};

const BUILDING_NAMES = {
  hopital:'Hospital', ecole:'School', recherche:'Research Center',
  residentiel:'Residential', eolienne:'Wind Turbine', solaire:'Solar Panel',
  parc:'Park', centrale_nucleaire:'Nuclear Power Plant'
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
  const finalAngle = 6 * 360 + (360 - chosenIndex * segmentAngle - segmentAngle / 2);

  const size = 280;
  const cx = size / 2, cy = size / 2, r = size / 2;
  const colors = [
    '#14532d','#1e3a5f','#6b1a1a','#3b1f6b',
    '#0d4a3a','#5a3200','#1a2a4a','#2d4a1a',
    '#4a1a3a','#1a3a4a','#3a2a0a','#2a1a4a',
    '#1a4a2a','#4a2a1a'
  ];

  show(`
    <div style="text-align:center;padding:2rem 0">
      <h2 style="margin-bottom:2rem">Spinning your role...</h2>
      <div style="position:relative;display:inline-block">
        <div style="
          position:absolute;
          top:-26px;
          left:50%;
          transform:translateX(-50%);
          font-size:28px;
          color:#22c55e;
          z-index:10;
        ">▼</div>
        <div id="wheel-wrapper" style="
          width:${size}px;
          height:${size}px;
          border-radius:50%;
          overflow:hidden;
          transform:rotate(0deg);
          transition:none;
        ">
          <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
            ${allRoles.map((role, i) => {
              const startAngle = (i * segmentAngle - 90) * Math.PI / 180;
              const endAngle   = ((i + 1) * segmentAngle - 90) * Math.PI / 180;
              const x1 = cx + r * Math.cos(startAngle);
              const y1 = cy + r * Math.sin(startAngle);
              const x2 = cx + r * Math.cos(endAngle);
              const y2 = cy + r * Math.sin(endAngle);
              const midAngle = (startAngle + endAngle) / 2;
              const tx = cx + (r * 0.68) * Math.cos(midAngle);
              const ty = cy + (r * 0.68) * Math.sin(midAngle);
              return `
                <path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 0,1 ${x2},${y2} Z"
                      fill="${colors[i % colors.length]}"
                      stroke="#0f1923" stroke-width="2"/>
                <text x="${tx}" y="${ty}"
                      text-anchor="middle"
                      dominant-baseline="central"
                      font-size="18">${role.icon}</text>
              `;
            }).join('')}
          </svg>
        </div>
      </div>
    </div>
  `);

  setTimeout(() => {
    const wheel = document.getElementById('wheel-wrapper');
    if (!wheel) return;
    wheel.style.transition = 'transform 4s cubic-bezier(0.25, 0.1, 0.25, 1)';
    wheel.style.transform  = `rotate(${finalAngle}deg)`;
  }, 100);

  // NOUVEAU
  setTimeout(() => {
  show(`
    <div style="text-align:center;padding:3rem 1rem;animation:fadeIn .6s ease">
      <div style="font-size:72px;margin-bottom:1.5rem">${chosenRole.icon}</div>
      <div style="font-size:28px;font-weight:800;letter-spacing:-1px;margin-bottom:1rem">${chosenRole.name}</div>
      <div style="
        font-size:14px;
        color:#d1d5db;
        line-height:1.7;
        max-width:320px;
        margin:0 auto 1rem;
        font-style:italic;
      ">${chosenRole.lore}</div>
      <div style="
        background:#22c55e11;
        border:1px solid #22c55e44;
        border-radius:10px;
        padding:12px;
        font-size:13px;
        color:#22c55e;
        max-width:320px;
        margin:0 auto 2rem;
        text-align:left;
      "><strong>🎯 Objective:</strong> ${chosenRole.desc}</div>
      <div style="
        background:#1e2d3d;
        border:1px solid #22c55e44;
        border-radius:10px;
        padding:12px;
        font-size:12px;
        color:#6b7280;
        margin-bottom:2rem;
      ">🤫 Keep your role secret from other players!</div>
      <button class="btn btn-primary" onclick="joinWithRole('${chosenRole.id}')">Enter the city →</button>
    </div>
    `);
  }, 4500);
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

  state.game_id     = data.game_id;
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
  const isHost   = players[0]?.pseudo === state.pseudo;

  show(`
    <div class="lobby-header">
      <h1>Belleville</h1>
      <div class="lobby-count">${players.length}<span>/4</span></div>
    </div>
    <p>Waiting for all players to join...</p>
    <div class="player-cards-grid">${cards}</div>
    <div class="sep"></div>
    ${canStart && isHost
      ? `<button class="btn btn-primary" onclick="startGame()">🌿 Start the game!</button>`
      : canStart
      ? `<div style="text-align:center;color:#9ca3af;font-size:13px">Waiting for host to start...</div>`
      : `<div style="text-align:center;color:#6b7280;font-size:13px">Waiting for ${4 - players.length} more player(s)...</div>`
    }
  `);

  pollingInterval = setInterval(async () => {
    try {
      const res = await fetch(`${API}/players/current`);
      if (!res.ok) return;
      const updatedPlayers = await res.json();

      if (state.game_id) {
        const gameRes = await fetch(`${API}/game/${state.game_id}/state`);
        if (gameRes.ok) {
          const gameData = await gameRes.json();
          if (gameData.game?.status === 'playing') {
            stopPolling();
            renderGame(gameData);
            return;
          }
        }
      }

      if (updatedPlayers.length !== players.length) {
        renderLobby(updatedPlayers);
      }
    } catch(e) {}
  }, 2000);
}

socket.on('lobby_update', ({ players }) => renderLobby(players));

// ── VUE 4 : Jeu ─────────────────────────────────────────────
async function startGame() {
  stopPolling();

  if (!state.game_id) {
    const res = await fetch(`${API}/players/current`);
    const players = await res.json();
    if (players.length > 0) {
      state.game_id = players[0].game_id;
      state.player_slot = players.find(p => p.pseudo === state.pseudo)?.slot;
    }
  }

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

function phaseLabel(phase) {
  return { event:'Event', actions:'Actions', bilan:'Report', blackout:'Blackout', waiting:'Waiting' }[phase] || phase;
}

function renderGame(data) {
  const { game, players, buildings, logs } = data;

  // Récupère le rôle depuis state ou depuis le serveur
  if (!state.role && state.player_slot) {
    const meFromServer = players.find(p => p.slot === state.player_slot);
    if (meFromServer) state.role = meFromServer.role;
  }

  const myRole = ROLES.find(r => r.id === state.role);
  const me     = players.find(p => p.slot === state.player_slot);
  const pct    = (game.pollution / 20) * 100;
  const color  = pollColor(game.pollution);
  const isMyTurn = game.current_player_slot === state.player_slot;
  const event  = game.current_event;

  // Stocke les données globalement pour les modales
  window._buildingsData = {};
  window._playersData   = players;
  window._currentEvent  = event;
  buildings.forEach(b => { window._buildingsData[b.id] = b; });

  const activePlayer = players.find(p => p.slot === game.current_player_slot);

  // Grille joueurs
  const playerBars = players.map(p => {
    const isMe     = p.slot === state.player_slot;
    const isActive = p.slot === game.current_player_slot;
    const initials = p.pseudo.substring(0, 2).toUpperCase();
    return `
      <div class="profile-bar-compact ${isMe ? 'me' : ''}" style="${isActive && game.phase === 'actions' ? 'border-color:#f59e0b' : ''}">
        <div class="profile-avatar">${initials}</div>
        <div class="profile-info">
          <div class="profile-name">
            ${p.pseudo}
            ${isMe     ? '<span class="you-tag">You</span>' : ''}
            ${isActive && game.phase === 'actions' ? '<span class="you-tag" style="background:#f59e0b">▶</span>' : ''}
          </div>
          <div class="profile-credits">💰 ${p.credits} cr</div>
          <div class="mission-bar-track" style="margin-top:4px">
            <div class="mission-bar-fill" style="width:0%"></div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Grille bâtiments
  const buildingCards = buildings.map(b => {
    const owner = b.owner_slot ? players.find(p => p.slot === b.owner_slot) : null;
    const pip0  = `<div class="b-pip ${b.level >= 1 ? 'on' : ''}"></div>`;
    const pip1  = `<div class="b-pip ${b.level >= 2 ? 'on' : ''}"></div>`;
    return `
      <div class="building-card" onclick="showBuildingDetail(${b.id})">
        <div class="b-icon">${BUILDING_ICONS[b.type] || '🏗'}</div>
        <div class="b-name">${BUILDING_NAMES[b.type] || b.type}</div>
        <div class="b-pips">${pip0}${pip1}</div>
        ${owner ? `<div class="b-owner">${owner.pseudo}</div>` : '<div style="height:15px"></div>'}
      </div>
    `;
  }).join('');

  // Zone de phase
  let phaseZone = '';

  // NOUVEAU
if (game.phase === 'event') {
  phaseZone = `
    <div class="phase-banner event">
      <div class="phase-label">📅 Phase 1 — Event</div>
      <div class="phase-desc">Player 1 enters the 3-letter code printed on the event card (ex: COL, HEA, TOX...).</div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <input id="event-number" type="text" maxlength="3" placeholder="Code (ex: COL)"
          style="flex:1;padding:8px 12px;background:#0f1923;border:1px solid #2d3f50;border-radius:8px;color:#fff;font-size:14px;outline:none;text-transform:uppercase" />
        <button class="btn btn-primary" style="width:auto;padding:8px 16px;margin:0" onclick="submitEvent()">→</button>
      </div>
    </div>
  `;
}

  if (game.phase === 'actions') {
    if (event) {
      const typeColor = event.type === 'crisis' ? '#ef4444' : event.type === 'opportunity' ? '#22c55e' : '#f59e0b';
      phaseZone += `
        <div class="event-active" style="border-color:${typeColor}44;background:${typeColor}11">
          <div style="font-size:11px;color:${typeColor};text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">${event.type}</div>
          <div style="font-size:14px;font-weight:700;margin-bottom:4px">${event.title}</div>
          <div style="font-size:12px;color:#9ca3af">${event.desc}</div>
        </div>
      `;
    }

    if (isMyTurn) {
      phaseZone += `
        <div class="phase-banner actions">
          <div class="phase-label">⚡ Your turn!</div>
          <div class="phase-desc">Choose an action or pass your turn.</div>
          <div class="actions-zone">
            <button class="btn btn-secondary" onclick="showBuildMenu()">🏗 Build / Upgrade</button>
            <button class="btn btn-secondary" onclick="doAction('depollute')">🌱 Depollution (3 cr)</button>
            <button class="btn btn-secondary" style="border-color:#6b7280;color:#9ca3af" onclick="doAction('pass')">⏭ Pass</button>
          </div>
        </div>
      `;
    } else {
      phaseZone += `
        <div class="phase-banner waiting">
          <div class="phase-label">⏳ ${activePlayer?.pseudo || '...'}'s turn</div>
          <div class="phase-desc">Waiting for their action...</div>
        </div>
      `;
    }
  }

  if (game.phase === 'bilan') {
    phaseZone = `
      <div class="phase-banner bilan">
        <div class="phase-label">⚖️ Phase 3 — Environmental Report</div>
        <div class="phase-desc">All players have played. Calculate the city's impact.</div>
        <button class="btn btn-primary" onclick="endTurn()">📊 Calculate report</button>
      </div>
    `;
  }
  if (game.phase === 'blackout') {
  const downgradable = buildings.filter(b => b.level > 0 && b.type !== 'centrale_nucleaire');
  phaseZone = `
    <div class="phase-banner" style="background:#450a0a22;border-color:#ef444444">
      <div class="phase-label" style="color:#ef4444">⚡ BLACKOUT!</div>
      <div class="phase-desc">Demand exceeded supply. The city must downgrade ${game.blackout_excess} building level(s). Vote together which buildings to downgrade.</div>
      <div class="build-list">
        ${downgradable.map(b => `
          <div class="build-row">
            <div class="build-left">
              <span class="build-icon">${BUILDING_ICONS[b.type]||'🏗'}</span>
              <div class="build-name">${BUILDING_NAMES[b.type]||b.type} (Lv${b.level})</div>
            </div>
            <button class="build-btn" style="background:#ef4444" onclick="blackoutDowngrade(${b.id})">Downgrade</button>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}
// Si une demande d'aide est active et je ne suis pas le demandeur → vue contributeur
if (game.help_request && game.help_request.requester_slot !== state.player_slot) {
  renderHelpContributorView(game.help_request, players);
  return;
}

// Si je suis le demandeur d'une aide active, montrer ma vue dédiée
if (game.help_request && game.help_request.requester_slot === state.player_slot) {
  showHelpRequesterView();
  return;
}

// Si une dépollution groupée est en cours et je ne l'ai pas encore confirmée
if (game.depollute_request && !game.depollute_request.confirmed.includes(state.player_slot) && game.depollute_request.initiator_slot !== state.player_slot) {
  renderDepolluteBoostView(game.depollute_request, me);
  return;
}

  show(`
    <div class="game-header">
      <div>
        <div class="game-title">Belleville</div>
        <div class="game-sub">Year ${game.turn} · ${phaseLabel(game.phase)}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="icon-btn" onclick="showRolesList()">📋</button>
      </div>
    </div>

    ${myRole ? `
      <div class="my-role-banner">
        <span style="font-size:18px">${myRole.icon}</span>
        <div>
          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px">Your role</div>
          <div style="font-size:13px;font-weight:600">${myRole.name}</div>
        </div>
        <button class="icon-btn" onclick="showMyRole()" style="margin-left:auto;font-size:12px;padding:4px 8px">Details</button>
      </div>
    ` : ''}

    <div class="pollution-bar">
      <div class="pbar-header">
        <span style="font-size:14px;font-weight:600">☁ Pollution</span>
        <span class="pbar-val" style="color:${color}">${game.pollution} / 20</span>
      </div>
      <div class="pbar-track">
        <div class="pbar-fill" style="width:${pct}%;background:${color}"></div>
      </div>
      <div class="pbar-legend"><span>0</span><span>⚠ 15</span><span>💀 20</span></div>
    </div>

    <div class="sep"></div>

    <h3>Players</h3>
    <div class="players-grid">${playerBars}</div>

    <div class="sep"></div>

    ${phaseZone}

    <div class="sep"></div>

    <h3>Buildings</h3>
    <div class="buildings-grid">${buildingCards}</div>

    <div class="sep"></div>

    <h3>Game log</h3>
    <div>${logs.map(l => `<div class="log-entry">• ${l.message}</div>`).join('')}</div>
  `);
}

// ── Mon rôle ─────────────────────────────────────────────────
function showMyRole() {
  const myRole = ROLES.find(r => r.id === state.role);
  if (!myRole) return;

  show(`
    <button class="back-btn" onclick="loadGame()">← Back to game</button>
    <div style="text-align:center;padding:2rem 0;animation:fadeIn .4s ease">
      <div style="font-size:64px;margin-bottom:1rem">${myRole.icon}</div>
      <div style="font-size:26px;font-weight:800;margin-bottom:1rem">${myRole.name}</div>
      <div style="font-size:14px;color:#9ca3af;line-height:1.7;max-width:320px;margin:0 auto 2rem">${myRole.desc}</div>
      <div style="background:#14532d22;border:1px solid #22c55e44;border-radius:10px;padding:12px;font-size:12px;color:#22c55e">
        🤫 Keep this secret from other players!
      </div>
    </div>
  `);
}

// ── Liste des rôles ──────────────────────────────────────────
function showRolesList() {
  const roleCards = ROLES.map(r => `
    <div class="role-info-card">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
        <span style="font-size:28px">${r.icon}</span>
        <span style="font-size:15px;font-weight:700">${r.name}</span>
      </div>
      <div style="font-size:13px;color:#9ca3af;line-height:1.6">${r.desc}</div>
    </div>
  `).join('');

  show(`
    <button class="back-btn" onclick="loadGame()">← Back to game</button>
    <h2>All roles & objectives</h2>
    <p>Complete your secret objective to win. Pollution reaching 20 means everyone loses!</p>
    ${roleCards}
  `);
}

// ── Détail bâtiment ──────────────────────────────────────────
function showBuildingDetail(buildingId) {
  const building = window._buildingsData[buildingId];
  const players  = window._playersData || [];
  if (!building) return;

  const owner = building.owner_slot ? players.find(p => p.slot === building.owner_slot) : null;

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:1rem">
        <span style="font-size:36px">${BUILDING_ICONS[building.type] || '🏗'}</span>
        <div>
          <div style="font-size:18px;font-weight:700">${BUILDING_NAMES[building.type] || building.type}</div>
          <div style="font-size:12px;color:#9ca3af">Level ${building.level} / 2</div>
          ${owner ? `<div style="font-size:12px;color:#22c55e">Owned by ${owner.pseudo}</div>` : ''}
        </div>
      </div>
      <button class="btn btn-secondary" style="margin-top:.5rem" onclick="closeModal()">Close</button>
    </div>
  `;
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  document.body.appendChild(modal);
  window._currentModal = modal;
}

// ── Menu construction ────────────────────────────────────────
function showBuildMenu() {
  const buildings    = Object.values(window._buildingsData || {});
  const me           = window._playersData?.find(p => p.slot === state.player_slot);
  const currentEvent = window._currentEvent || null;

  const costs = {
    hopital:            [5, 8],
    ecole:              [5, 8],
    recherche:          [6, 10],
    residentiel:        [4, 8],
    eolienne:           [4, 6],
    solaire:            [4, 6],
    parc:               [13, 20],
    centrale_nucleaire: [0, 4],
  };

  const grouped = {};
  for (const b of buildings) {
    if (!grouped[b.type]) grouped[b.type] = [];
    grouped[b.type].push(b);
  }

  const recherche   = buildings.find(b => b.type === 'recherche');
  const rechercheOk = recherche && recherche.level >= 1;

  const rows = Object.entries(grouped).map(([type, list]) => {
    // Cas spécial : centrale nucléaire (upgrade ou démantèlement)
    // NOUVEAU — bloc complet et fonctionnel
if (type === 'centrale_nucleaire') {
  const centrale = list[0];
  const canUpgrade   = centrale.level === 1;
  const canDismantle = centrale.level >= 1;

  if (!canUpgrade && !canDismantle) {
    return `
      <div class="build-row max">
        <div class="build-left">
          <span class="build-icon">⚛️</span>
          <div class="build-info">
            <div class="build-name">Nuclear Power Plant</div>
            <div class="build-status" style="color:#6b7280">Dismantled</div>
          </div>
        </div>
      </div>`;
  }

  return `
    <div class="build-row">
      <div class="build-left">
        <span class="build-icon">⚛️</span>
        <div class="build-info">
          <div class="build-name">Nuclear Power Plant (Lv${centrale.level})</div>
        </div>
      </div>
      <div style="display:flex;gap:8px">
        ${canUpgrade ? `
          <div style="text-align:center">
            <div class="build-cost">💰 4 cr</div>
            ${me?.credits >= 4 ? `
              <button class="build-btn" onclick="doAction('upgrade',${centrale.id});closeModal()">Lv 1→2</button>
            ` : `
              <button class="build-btn disabled" disabled>Lv 1→2</button>
              <button class="build-btn" style="background:#60a5fa;margin-top:4px" onclick="requestHelp(${centrale.id},'upgrade');closeModal()">🤝 Ask for help</button>
            `}
          </div>` : ''}
        ${canDismantle ? `
          <div style="text-align:center">
            <div class="build-cost">💰 16 cr</div>
            ${me?.credits >= 16 ? `
              <button class="build-btn" style="background:#ef4444" onclick="dismantlePlant(${centrale.id});closeModal()">☢️ Dismantle</button>
            ` : `
              <button class="build-btn disabled" disabled>☢️ Dismantle</button>
              <button class="build-btn" style="background:#60a5fa;margin-top:4px" onclick="requestHelp(${centrale.id},'dismantle');closeModal()">🤝 Ask for help</button>
            `}
          </div>` : ''}
      </div>
    </div>
  `;
}
    const hasLv0 = list.find(b => b.level === 0);
    const hasLv1 = list.find(b => b.level === 1);

    let cost0 = costs[type]?.[0] ?? 0;
    let cost1 = costs[type]?.[1] ?? 0;

    if (currentEvent?.effect === 'upgrade_cost_plus1') {
      if (cost0 > 0) cost0 += 1;
      if (cost1 > 0) cost1 += 1;
    }
    if (currentEvent?.effect === 'upgrade_cost_minus2') {
  cost1 = Math.max(0, cost1 - 2);
}
    const canBuy0 = hasLv0 && cost0 > 0;
    const canBuy1 = hasLv1 && cost1 > 0 && (type === 'recherche' || rechercheOk);

    if (!canBuy0 && !canBuy1) return `
      <div class="build-row max">
        <div class="build-left">
          <span class="build-icon">${BUILDING_ICONS[type]||'🏗'}</span>
          <div class="build-info">
            <div class="build-name">${BUILDING_NAMES[type]||type}</div>
            <div class="build-status" style="color:#22c55e">✅ All maxed</div>
          </div>
        </div>
      </div>`;

    const btn0 = canBuy0 ? `
  <div style="text-align:center">
    <div class="build-cost">💰 ${cost0} cr</div>
    ${me?.credits >= cost0 ? `
      <button class="build-btn" onclick="doAction('upgrade',${hasLv0.id});closeModal()">Lv 0→1</button>
    ` : `
      <button class="build-btn disabled" disabled>Lv 0→1</button>
      <button class="build-btn" style="background:#60a5fa;margin-top:4px" onclick="requestHelp(${hasLv0.id});closeModal()">🤝 Ask for help</button>
    `}
  </div>` : '';

const btn1 = canBuy1 ? `
  <div style="text-align:center">
    <div class="build-cost">💰 ${cost1} cr</div>
    ${me?.credits >= cost1 ? `
      <button class="build-btn" onclick="doAction('upgrade',${hasLv1.id});closeModal()">Lv 1→2</button>
    ` : `
      <button class="build-btn disabled" disabled>Lv 1→2</button>
      <button class="build-btn" style="background:#60a5fa;margin-top:4px" onclick="requestHelp(${hasLv1.id});closeModal()">🤝 Ask for help</button>
    `}
  </div>` : '';

    return `
      <div class="build-row">
        <div class="build-left">
          <span class="build-icon">${BUILDING_ICONS[type]||'🏗'}</span>
          <div class="build-name">${BUILDING_NAMES[type]||type}</div>
        </div>
        <div style="display:flex;gap:8px">
          ${btn0}${btn1}
        </div>
      </div>`;
  }).join('');

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
        <h2 style="margin:0">Build / Upgrade</h2>
        <span style="font-size:13px;color:#9ca3af">💰 ${me?.credits ?? 0} cr</span>
      </div>
      ${currentEvent?.effect === 'upgrade_cost_plus1' ? `<div style="font-size:12px;color:#ef4444;margin-bottom:8px">⚠ Material Shortage: +1 cr on all upgrades this turn</div>` : ''}
      ${currentEvent?.effect === 'upgrade_cost_minus1' ? `<div style="font-size:12px;color:#22c55e;margin-bottom:8px">✨ Tech Breakthrough: -1 cr on Lv2 upgrades this turn</div>` : ''}
      <div class="build-list">${rows}</div>
      <button class="btn btn-secondary" style="margin-top:1rem" onclick="closeModal()">Close</button>
    </div>
  `;
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  document.body.appendChild(modal);
  window._currentModal = modal;
}
async function dismantlePlant(building_id) {
  if (!confirm('Dismantle the Nuclear Power Plant for 16 cr? Pollution -10. This cannot be undone.')) return;

  const res = await fetch(`${API}/game/${state.game_id}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ player_slot: state.player_slot, action_type: 'dismantle', building_id }),
  });
  const data = await res.json();
  if (!res.ok) return alert(data.error);
  alert('☢️ Nuclear Power Plant dismantled! -10 pollution!');
  socket.emit('game_update', { game_id: state.game_id });
  loadGame();
}
function closeModal() {
  if (window._currentModal) {
    window._currentModal.remove();
    window._currentModal = null;
  }
}

// ── Actions ──────────────────────────────────────────────────
async function doAction(action_type, building_id = null) {
  const body = { player_slot: state.player_slot, action_type };
  if (building_id !== null) body.building_id = building_id;

  const res = await fetch(`${API}/game/${state.game_id}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) return alert(data.error);
  socket.emit('game_update', { game_id: state.game_id });

  if (data.boost_started) {
    showDepolluteInitiatorWaitView();
    return;
  }

  loadGame();
}
function showDepolluteInitiatorWaitView() {
  stopPolling();
  show(`
    <div style="text-align:center;padding:2rem 0">
      <h2>🌱 Depollution started</h2>
      <p>Waiting for other players to finish contributing to the boost...</p>
    </div>
  `);
  pollingInterval = setInterval(async () => {
    const res = await fetch(`${API}/game/${state.game_id}/state`);
    const data = await res.json();
    if (!data.game.depollute_request) {
      stopPolling();
      loadGame();
    }
  }, 1500);
}

async function drawEvent() {
  const num = document.getElementById('event-number')?.value;
  const res = await fetch(`${API}/game/${state.game_id}/draw-event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_number: num || null }),
  });
  const data = await res.json();
  if (!res.ok) return alert(data.error);

  // Affiche la popup de l'événement
  showEventPopup(data.event);
}

async function submitEvent() {
  await drawEvent();
}

function showEventPopup(event) {
  const typeColor = event.type === 'crisis' ? '#ef4444' : event.type === 'opportunity' ? '#22c55e' : '#f59e0b';
  const typeBg    = event.type === 'crisis' ? '#450a0a' : event.type === 'opportunity' ? '#14532d' : '#1c1917';

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div style="display:inline-block;padding:3px 10px;border-radius:20px;background:${typeBg};color:${typeColor};font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">
        #${event.id} · ${event.type}
      </div>
      <div style="font-size:20px;font-weight:800;margin-bottom:12px">${event.title}</div>
      <div style="font-size:13px;color:#d1d5db;line-height:1.7;margin-bottom:.75rem;font-style:italic">${event.story}</div>
      <div style="font-size:13px;color:#9ca3af;line-height:1.7;margin-bottom:1.5rem">${event.info}</div>
      <div style="background:${typeBg}33;border:1px solid ${typeColor}44;border-radius:10px;padding:12px;margin-bottom:1.5rem">
        <div style="font-size:11px;color:${typeColor};text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Effect on the game</div>
        <div style="font-size:13px;color:#d1d5db">${getEffectDescription(event)}</div>
      </div>
      <button class="btn btn-primary" style="margin:0" onclick="closeModal();loadGame()">Start turn →</button>
    </div>
  `;
  modal.addEventListener('click', e => { if (e.target === modal) { closeModal(); loadGame(); } });
  document.body.appendChild(modal);
  window._currentModal = modal;

  socket.emit('game_update', { game_id: state.game_id });
}

function getEffectDescription(event) {
  const effects = {
    'demand_plus1_all':    '⚡ All buildings with level > 0 consume +1 Energy this round.',
    'toxic_leak':          '☣️ If Hospital < Lv2: +2 Pollution immediately.',
    'upgrade_cost_plus1':  '🔨 All building upgrades cost +1 cr this round.',
    'green_zero':          '☁️ All Green Energy installations produce 0 this round.',
    'respiratory_crisis':  '😷 Lv2: nothing. Lv1: -1 cr each. Lv0: -2 cr each.',
    'park_zero':           '🌵 Parks lose their passive pollution reduction this round.',
    'all_gain2cr':         '💰 Every player receives +2 Credits now.',
    'upgrade_cost_minus2': '🔬 Level 2 upgrades cost -2 cr this round.',
    'free_depollute':      '🌱 The next Depollution Campaign action is free.',
    'pollution_minus1':    '🚲 Pollution reduced by 1 immediately.',
    'elections':           '🗳️ If no Grand Project is funded this round: +1 Pollution.',
    'audit':               '📋 Fossil Lv2: +2 Poll. Lv1: +1 Poll. Dismantled: -1 Poll.',
  };
  return effects[event.effect] || event.desc;
}
async function endTurn() {
  const res  = await fetch(`${API}/game/${state.game_id}/end-turn`, { method: 'POST' });
  const data = await res.json();
  if (!res.ok) { alert(data.error); return; }

  if (data.lost) {
    socket.emit('game_end', { game_id: state.game_id, won: false, winners: [] });
    showEndScreen(false, []);
    return;
  }

  // NOUVEAU
if (data.winners && data.winners.length > 0) {
    socket.emit('game_end', { game_id: state.game_id, won: true, winners: data.winners, pollution: data.new_pollution });
    showEndScreen(true, data.winners, data.new_pollution);
    return;
}

  let msg = `📊 Report — Demand: ${data.demand} | Green: ${data.green} | Fossil: ${data.effective_fossil} | +${data.pollution_add} pollution`;
  if (data.blackout) msg += `\n⚡ BLACKOUT! Overload of ${data.blackout_excess}`;
  alert(msg);

  socket.emit('game_update', { game_id: state.game_id });
  loadGame();
}

// NOUVEAU
socket.on('game_ended', ({ won, winners, pollution }) => {
  stopPolling();
  showEndScreen(won, winners, pollution ?? 0);
});
// ── Écran de fin ─────────────────────────────────────────────
// NOUVEAU
function getPollutionDebrief(pollution) {
  if (pollution <= 5) return "🌿 Excellent result: Belleville kept its air remarkably clean while achieving victory.";
  if (pollution <= 10) return "🙂 Good balance: the city grew while keeping pollution under control.";
  if (pollution <= 15) return "⚠️ Mixed result: the objective was reached, but pollution remains a real concern for Belleville.";
  return "🚨 Fragile victory: the objective was reached, but Belleville is on the verge of an environmental crisis.";
}

function showEndScreen(won, winners, pollution = 0) {
  stopPolling(); // ← arrête tout polling

  if (won) {
    const debrief = getPollutionDebrief(pollution);
    // NOUVEAU
const winnerCards = (winners || []).map(w => {
  const role = ROLES.find(r => r.id === w.role);
  return `
    <div style="background:#14532d22;border:1px solid #22c55e44;border-radius:12px;padding:1.25rem;margin-bottom:10px;text-align:center">
      <div style="font-size:48px;margin-bottom:8px">${role?.icon || '🏆'}</div>
      <div style="font-size:20px;font-weight:800;margin-bottom:4px;color:#fff">${w.pseudo || 'Unknown player'}</div>
      <div style="font-size:14px;color:#22c55e;font-weight:600">${role?.name || w.role || 'Unknown role'}</div>
      <div style="font-size:12px;color:#9ca3af;margin-top:6px">${role?.desc || ''}</div>
    </div>
  `;
}).join('');

    // NOUVEAU
    show(`
      <div style="text-align:center;padding:2rem 0">
        <div style="font-size:64px;margin-bottom:1rem">🏆</div>
        <h1 style="color:#22c55e;margin-bottom:0.5rem">Victory!</h1>
        <p style="margin-bottom:2rem">A player has completed their secret objective!</p>

        ${winnerCards}
        <div style="background:#1e2d3d;border:1px solid #2d3f50;border-radius:10px;padding:14px;margin:1.5rem 0;font-size:13px;color:#d1d5db">
          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">City debrief · Pollution: ${pollution}/20</div>
          ${debrief}
        </div>
        <button class="btn btn-primary" style="margin-top:1rem" onclick="newGame()">🌿 New game</button>
      </div>
    `);
  } else {
    show(`
      <div style="text-align:center;padding:2rem 0">
        <div style="font-size:64px;margin-bottom:1rem">💀</div>
        <h1 style="color:#ef4444;margin-bottom:0.5rem">Defeat!</h1>
        <p style="margin-bottom:2rem">Pollution reached 20. The city is lost.</p>
        <button class="btn btn-primary" onclick="newGame()">🌿 New game</button>
      </div>
    `);
  }
}

async function newGame() {
  // Réinitialise le state local
  state.game_id     = null;
  state.player_slot = null;
  state.pseudo      = null;
  state.role        = null;
  renderWelcome();
}

socket.on('state_update', async () => {
  if (!state.game_id) return;
  const res  = await fetch(`${API}/game/${state.game_id}/state`);
  const data = await res.json();
  // NOUVEAU
  if (data.game?.status === 'won') { stopPolling(); showEndScreen(true, data.game.winners_cache || [], data.game.pollution); return; }
  if (data.game?.status === 'lost') { stopPolling(); showEndScreen(false, []); return; }
  renderGame(data);
});
async function blackoutDowngrade(building_id) {
  const res  = await fetch(`${API}/game/${state.game_id}/blackout-downgrade`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ building_id }),
  });
  const data = await res.json();
  if (!res.ok) return alert(data.error);

  // NOUVEAU
if (data.resolved && data.winners?.length > 0) {
    showEndScreen(true, data.winners, data.pollution);
    return;
}

  socket.emit('game_update', { game_id: state.game_id });
  loadGame();
}
async function dismantlePlant(building_id) {
  if (!confirm('Dismantle the Nuclear Power Plant? This cannot be undone.')) return;
  await doAction('dismantle', building_id);
}
// NOUVEAU
async function requestHelp(building_id, action_type = 'upgrade') {
  const res = await fetch(`${API}/game/${state.game_id}/help/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ building_id, requester_slot: state.player_slot, action_type }),
  });
  const data = await res.json();
  if (!res.ok) return alert(data.error);
  socket.emit('game_update', { game_id: state.game_id });
  showHelpRequesterView();
}

function showHelpRequesterView() {
  stopPolling();
  fetch(`${API}/game/${state.game_id}/state`).then(r => r.json()).then(data => {
    renderHelpView(data.game.help_request, data.players);
  });
  pollingInterval = setInterval(async () => {
    const res = await fetch(`${API}/game/${state.game_id}/state`);
    const data = await res.json();
    if (!data.game.help_request) { stopPolling(); loadGame(); return; }
    renderHelpView(data.game.help_request, data.players);
  }, 1500);
}

function renderHelpView(hr, players) {
  if (!hr) { stopPolling(); loadGame(); return; }

  // Ne pas re-rendre (et donc écraser le champ) pendant que le joueur tape
   const activeInput = document.getElementById('my-contrib-input');
  if (activeInput) {
    state.pendingContribAmount = activeInput.value;
  }

  // On garde une référence pour submitMyContribution() (évite un fetch + une race condition)
  state.currentHelpRequest = hr;

  const me = players.find(p => p.slot === state.player_slot);
  const isRequester = state.player_slot === hr.requester_slot;
  const requester = players.find(p => p.slot === hr.requester_slot);

  // Total déjà engagé (contributions + requester)
  const totalContributed = Object.values(hr.contributions).reduce((a,b) => a+b, 0);
  const requesterContrib = hr.requester_contribution ?? 0;
  const totalEngaged = totalContributed + requesterContrib;
  const stillNeeded = Math.max(0, hr.cost - totalEngaged);
  const canLaunch = isRequester && totalEngaged >= hr.cost;

  // Ma contribution actuelle
  const myContrib = isRequester
    ? requesterContrib
    : (hr.contributions[state.player_slot] || 0);

  // Max que je peux encore ajouter maintenant (delta, pas total)
  const maxICanAdd = Math.max(0, Math.min(me?.credits ?? 0, stillNeeded));

  // Barre de progression
  const pct = Math.min(100, (totalEngaged / hr.cost) * 100);

  // Liste des contributions de chaque joueur
  const contribRows = players.map(p => {
    const contrib = p.slot === hr.requester_slot
      ? (hr.requester_contribution ?? 0)
      : (hr.contributions[p.slot] || 0);
    const isMe = p.slot === state.player_slot;
    return `
      <div class="build-row">
        <div class="build-left">
          <div class="profile-avatar" style="width:28px;height:28px;font-size:11px">${p.pseudo.substring(0,2).toUpperCase()}</div>
          <div class="build-name">${p.pseudo}${isMe ? ' <span class="you-tag">You</span>' : ''}${p.slot === hr.requester_slot ? ' 🙋' : ''}</div>
        </div>
        <div style="font-weight:600;color:${contrib > 0 ? '#22c55e' : '#6b7280'}">${contrib > 0 ? `+${contrib} cr` : '—'}</div>
      </div>
    `;
  }).join('');

  show(`
    <div style="padding:1rem 0">
      <h2 style="text-align:center;margin-bottom:.25rem">🤝 Team Build</h2>
      <p style="text-align:center;margin-bottom:1.5rem">${requester?.pseudo} needs help to upgrade a building</p>

      <div style="text-align:center;margin-bottom:1rem">
        <div style="font-size:28px;font-weight:800;color:${totalEngaged >= hr.cost ? '#22c55e' : '#fff'}">${totalEngaged} <span style="font-size:16px;color:#6b7280">/ ${hr.cost} cr</span></div>
        <div style="height:8px;background:#1e2d3d;border-radius:4px;margin:.5rem 0;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${totalEngaged >= hr.cost ? '#22c55e' : '#60a5fa'};border-radius:4px;transition:width .3s"></div>
        </div>
        <div style="font-size:12px;color:#6b7280">${stillNeeded > 0 ? `Still needed: ${stillNeeded} cr` : '✅ Ready to launch!'}</div>
      </div>

      <div class="sep"></div>

      <h3>Contributions</h3>
      <div class="build-list" style="margin-bottom:1rem">${contribRows}</div>

      <div class="sep"></div>

      <h3>Your contribution</h3>
      <p style="color:#9ca3af;font-size:12px;margin-bottom:.5rem">
        You already gave ${myContrib} cr · You have ${me?.credits ?? 0} cr · Max you can add now: ${maxICanAdd} cr
      </p>
      <div style="display:flex;gap:8px;margin-bottom:.5rem">
        ${[1,2,5].filter(v => v <= maxICanAdd).map(v => `
          <button class="build-btn" style="flex:1;padding:8px" onclick="quickContribute(${v})">+${v} cr</button>
        `).join('')}
      </div>
      <div style="display:flex;gap:8px;margin-bottom:1rem">
<input id="my-contrib-input" type="number" min="0" max="${maxICanAdd}"
  value="${state.pendingContribAmount ?? ''}"
  oninput="state.pendingContribAmount = this.value"
  placeholder="Amount to add"
  style="flex:1;padding:10px 12px;background:#0f1923;border:1px solid #2d3f50;border-radius:8px;color:#fff;font-size:15px;outline:none" />
        <button class="build-btn" style="padding:10px 16px" onclick="submitMyContribution()">Add</button>
      </div>

      <div style="display:flex;flex-direction:column;gap:8px">
        ${canLaunch ? `
          <button class="btn btn-primary" style="margin:0" onclick="launchHelpUpgrade()">🚀 Launch upgrade!</button>
        ` : isRequester ? `
          <button class="btn btn-primary disabled" disabled style="margin:0">🚀 Launch (${totalEngaged}/${hr.cost} cr)</button>
        ` : ''}
        ${isRequester ? `
          <button class="btn btn-secondary" style="margin:0" onclick="cancelHelpRequest()">❌ Cancel & refund all</button>
        ` : ''}
      </div>
    </div>
  `);
}

async function submitMyContribution() {
  const input = document.getElementById('my-contrib-input');
  const amount = parseInt(input?.value ?? state.pendingContribAmount) || 0;
  if (amount <= 0) return alert('Enter an amount greater than 0');
  state.pendingContribAmount = '';
  await sendContribution(amount);
}

async function quickContribute(amount) {
  await sendContribution(amount);
}

async function sendContribution(amount) {
  const hr = state.currentHelpRequest;
  const isRequester = hr && state.player_slot === hr.requester_slot;
  const route = isRequester ? 'requester-contribute' : 'contribute';

  const res = await fetch(`${API}/game/${state.game_id}/help/${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ player_slot: state.player_slot, amount }),
  });
  const data = await res.json();
  if (!res.ok) return alert(data.error);
  state.currentHelpRequest = data.help_request;
  state.pendingContribAmount = ''; // reset après envoi réussi
  const players = await fetch(`${API}/game/${state.game_id}/state`).then(r => r.json()).then(d => d.players);
  renderHelpView(data.help_request, players);
  socket.emit('game_update', { game_id: state.game_id });
}

async function launchHelpUpgrade() {
  const res = await fetch(`${API}/game/${state.game_id}/help/launch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ player_slot: state.player_slot }),
  });
  const data = await res.json();
  if (!res.ok) return alert(data.error);
  stopPolling();
  socket.emit('game_update', { game_id: state.game_id });
  loadGame();
}

async function cancelHelpRequest() {
  await fetch(`${API}/game/${state.game_id}/help/cancel`, { method: 'POST' });
  stopPolling();
  socket.emit('game_update', { game_id: state.game_id });
  loadGame();
}
function renderHelpContributorView(hr, players) {
  showHelpRequesterView();
}

async function contributeToHelp() {
  const amount = parseInt(document.getElementById('contrib-amount').value);
  if (!amount || amount <= 0) return alert('Enter a valid amount');

  const res = await fetch(`${API}/game/${state.game_id}/help/contribute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ player_slot: state.player_slot, amount }),
  });
  const data = await res.json();
  if (!res.ok) return alert(data.error);
  socket.emit('game_update', { game_id: state.game_id });
  loadGame();
}
function renderDepolluteBoostView(dr, me) {
  stopPolling();
  const alreadyDone = dr.confirmed.includes(state.player_slot);

  show(`
    <div style="text-align:center;padding:1rem 0">
      <h2>🌱 Group Depollution Boost</h2>
      <p>Pay 2 cr to reduce pollution by 1 (repeatable). Total reduced so far: ${dr.pollution_reduced}</p>
      <p style="color:#9ca3af">You have ${me?.credits ?? 0} cr</p>
      ${alreadyDone
        ? `<p style="color:#22c55e">✅ You're done. Waiting for others...</p>`
        : `
          <button class="btn btn-primary ${me?.credits < 2 ? 'disabled':''}" ${me?.credits < 2 ? 'disabled':''} onclick="contributeDepolluteBoost()">💰 Pay 2cr → -1 pollution</button>
          <button class="btn btn-secondary" onclick="finishDepolluteBoost()">✅ I'm done</button>
        `}
    </div>
  `);

  pollingInterval = setInterval(async () => {
    const res = await fetch(`${API}/game/${state.game_id}/state`);
    const data = await res.json();
    if (!data.game.depollute_request) {
      stopPolling();
      loadGame();
      return;
    }
    renderDepolluteBoostView(data.game.depollute_request, data.players.find(p => p.slot === state.player_slot));
  }, 1500);
}

async function contributeDepolluteBoost() {
  const res = await fetch(`${API}/game/${state.game_id}/depollute-boost/contribute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ player_slot: state.player_slot }),
  });
  const data = await res.json();
  if (!res.ok) return alert(data.error);
  socket.emit('game_update', { game_id: state.game_id });
  loadGame();
}

async function finishDepolluteBoost() {
  const res = await fetch(`${API}/game/${state.game_id}/depollute-boost/done`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ player_slot: state.player_slot }),
  });
  const data = await res.json();
  if (!res.ok) return alert(data.error);
  stopPolling();
  socket.emit('game_update', { game_id: state.game_id });
  loadGame();
}
// ── Démarrage ────────────────────────────────────────────────
renderWelcome();