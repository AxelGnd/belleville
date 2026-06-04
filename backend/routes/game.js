const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');

const EVENTS = [
  { id:'cold_wave',      type:'crisis',      title:'Vague de Froid',           desc:'Tous les Résidentiels consomment +1 énergie ce tour.',   effect:'demand_plus1_residential' },
  { id:'toxic_leak',     type:'crisis',      title:'Fuite Toxique',            desc:'Avancez la Pollution de 2 cases immédiatement.',         effect:'pollution_plus2' },
  { id:'shortage',       type:'crisis',      title:'Pénurie de Matériaux',     desc:'Améliorer un bâtiment coûte +1 CR ce tour.',             effect:'upgrade_cost_plus1' },
  { id:'no_wind',        type:'crisis',      title:'Ciel Couvert',             desc:'Les Énergies Vertes produisent 0 énergie ce tour.',      effect:'green_zero' },
  { id:'health_crisis',  type:'crisis',      title:'Crise Respiratoire',       desc:'Chaque joueur perd 2 CR.',                               effect:'all_lose2cr', protected_by:'hopital_2' },
  { id:'subsidy',        type:'opportunity', title:'Subventions Européennes',  desc:'Chaque joueur reçoit +2 CR.',                            effect:'all_gain2cr' },
  { id:'tech_advance',   type:'opportunity', title:'Avancée Technologique',    desc:'Améliorer vers Nv2 coûte 1 CR de moins ce tour.',        effect:'upgrade_cost_minus1' },
  { id:'earth_day',      type:'opportunity', title:'Journée de la Terre',      desc:'La prochaine Dépollution est gratuite ce tour.',         effect:'free_depollute' },
  { id:'sunny_day',      type:'opportunity', title:'Journée Ensoleillée',      desc:'Les Énergies Vertes produisent 1 énergie de plus.',      effect:'green_plus1' },
  { id:'elections',      type:'neutral',     title:'Élections Municipales',    desc:'Si aucun Grand Projet ce tour : +1 Pollution.',          effect:'elections' },
  { id:'audit',          type:'neutral',     title:'Audit Écologique',         desc:'Centrale Nv2 → +2 Pollution. Centrale Nv1 → -1.',       effect:'audit' },
];

const COSTS = {
  hopital:            [5, 8],
  ecole:              [5, 8],
  recherche:          [6, 10],
  residentiel:        [4, 8],
  eolienne:           [4, 0],
  solaire:            [4, 0],
  parc:               [13, 20],
  centrale_nucleaire: [0, 4],
};

router.get('/:game_id/state', async (req, res) => {
  const id = req.params.game_id;
  const [game, players, buildings, logs] = await Promise.all([
    db.query("SELECT * FROM games WHERE id=$1", [id]),
    db.query("SELECT * FROM players WHERE game_id=$1 ORDER BY slot", [id]),
    db.query("SELECT * FROM buildings WHERE game_id=$1", [id]),
    db.query("SELECT * FROM game_log WHERE game_id=$1 ORDER BY id DESC LIMIT 20", [id]),
  ]);
  res.json({
    game:      game.rows[0],
    players:   players.rows,
    buildings: buildings.rows,
    logs:      logs.rows,
  });
});

router.post('/:game_id/start', async (req, res) => {
  const id = req.params.game_id;
  await db.query(
    "UPDATE games SET status='playing', phase='event', current_player_slot=1, turn=1 WHERE id=$1",
    [id]
  );
  await log(id, 1, '🏙 La partie commence ! Phase : Événement');
  res.json({ success: true });
});

router.post('/:game_id/draw-event', async (req, res) => {
  const id = req.params.game_id;
  const game = (await db.query("SELECT * FROM games WHERE id=$1", [id])).rows[0];

  if (game.phase !== 'event') return res.status(400).json({ error: 'Pas en phase Événement' });

  const event = EVENTS[Math.floor(Math.random() * EVENTS.length)];

  if (event.effect === 'pollution_plus2') {
    const hopital = (await db.query("SELECT * FROM buildings WHERE game_id=$1 AND type='hopital'", [id])).rows[0];
    const amount = hopital?.level >= 1 ? 1 : 2;
    await db.query("UPDATE games SET pollution=LEAST(20, pollution+$1) WHERE id=$2", [amount, id]);
  }
  if (event.effect === 'all_gain2cr') {
    await db.query("UPDATE players SET credits=credits+2 WHERE game_id=$1", [id]);
  }
  if (event.effect === 'all_lose2cr') {
    const hopital = (await db.query("SELECT * FROM buildings WHERE game_id=$1 AND type='hopital'", [id])).rows[0];
    if (!hopital || hopital.level < 2) {
      await db.query("UPDATE players SET credits=GREATEST(0,credits-2) WHERE game_id=$1", [id]);
    }
  }
  if (event.effect === 'audit') {
    const centrale = (await db.query("SELECT * FROM buildings WHERE game_id=$1 AND type='centrale_nucleaire'", [id])).rows[0];
    if (centrale?.level >= 2) {
      await db.query("UPDATE games SET pollution=LEAST(20, pollution+2) WHERE id=$1", [id]);
    } else {
      await db.query("UPDATE games SET pollution=GREATEST(0, pollution-1) WHERE id=$1", [id]);
    }
  }

  await db.query(
    "UPDATE games SET phase='actions', current_player_slot=1, actions_done=0, current_event=$2 WHERE id=$1",
    [id, JSON.stringify(event)]
  );
  await log(id, game.turn, `🎴 Événement : ${event.title} — ${event.desc}`);

  res.json({ event });
});

router.post('/:game_id/action', async (req, res) => {
  const { player_slot, action_type, building_id } = req.body;
  const id = req.params.game_id;

  const game = (await db.query("SELECT * FROM games WHERE id=$1", [id])).rows[0];
  if (game.phase !== 'actions') return res.status(400).json({ error: 'Pas en phase Actions' });
  if (Number(game.current_player_slot) !== Number(player_slot)) return res.status(400).json({ error: "Ce n'est pas ton tour" });

  const player = (await db.query("SELECT * FROM players WHERE game_id=$1 AND slot=$2", [id, player_slot])).rows[0];
  const event  = game.current_event;

  if (action_type === 'pass') {
    await nextPlayer(id, game);
    await log(id, game.turn, `⏭ Joueur ${player_slot} passe son tour`);
    return res.json({ success: true });
  }

  if (action_type === 'upgrade') {
    const building = (await db.query("SELECT * FROM buildings WHERE id=$1 AND game_id=$2", [building_id, id])).rows[0];
    if (!building) return res.status(404).json({ error: 'Bâtiment introuvable' });
    if (building.level >= 2) return res.status(400).json({ error: 'Déjà au niveau maximum' });

    if (Number(building.level) === 1 && building.type !== 'recherche') {
      const recherche = (await db.query("SELECT * FROM buildings WHERE game_id=$1 AND type='recherche'", [id])).rows[0];
      if (!recherche || Number(recherche.level) < 1) {
        return res.status(400).json({ error: 'Le Centre de Recherche doit être Nv1 pour construire un Nv2' });
      }
    }

    let cost = COSTS[building.type]?.[building.level] ?? 4;
    if (cost === 0) return res.status(400).json({ error: 'Ce bâtiment ne peut pas être amélioré' });

    if (event?.effect === 'upgrade_cost_plus1')  cost += 1;
    if (event?.effect === 'upgrade_cost_minus1' && building.level === 1) cost = Math.max(0, cost - 1);

    if (player.credits < cost) return res.status(400).json({ error: `Crédits insuffisants (besoin: ${cost})` });

    await db.query("UPDATE buildings SET level=level+1, owner_slot=$1 WHERE id=$2", [player_slot, building_id]);
    await db.query("UPDATE players SET credits=credits-$1 WHERE game_id=$2 AND slot=$3", [cost, id, player_slot]);

    if (building.type === 'centrale_nucleaire' && building.level === 1) {
      await db.query("UPDATE games SET fossil_level=2, pollution=LEAST(20,pollution+4) WHERE id=$1", [id]);
    }

    await log(id, game.turn, `🏗 Joueur ${player_slot} améliore ${building.type} → Nv${building.level + 1} (-${cost} cr)`);
    await nextPlayer(id, game);
    return res.json({ success: true, new_level: building.level + 1, cost });
  }

  if (action_type === 'depollute') {
    const ecole = (await db.query("SELECT * FROM buildings WHERE game_id=$1 AND type='ecole'", [id])).rows[0];
    if (!ecole || ecole.level < 1) return res.status(400).json({ error: "L'École doit être au Niveau 1" });

    const isFree = event?.effect === 'free_depollute';
    const cost   = isFree ? 0 : 3;

    if (player.credits < cost) return res.status(400).json({ error: 'Crédits insuffisants' });

    const reduction = ecole.level >= 2 ? 2 : 1;
    await db.query("UPDATE players SET credits=credits-$1 WHERE game_id=$2 AND slot=$3", [cost, id, player_slot]);
    await db.query("UPDATE games SET pollution=GREATEST(0,pollution-$1) WHERE id=$2", [reduction, id]);

    if (isFree) {
      await db.query("UPDATE games SET current_event=current_event::jsonb - 'effect' WHERE id=$1", [id]);
    }

    await log(id, game.turn, `🌱 Joueur ${player_slot} dépollue (-${reduction} pollution, -${cost} cr)`);
    await nextPlayer(id, game);
    return res.json({ success: true, reduction, cost });
  }

  return res.status(400).json({ error: 'Action inconnue' });
});

router.post('/:game_id/end-turn', async (req, res) => {
  const id = req.params.game_id;
  const game      = (await db.query("SELECT * FROM games WHERE id=$1", [id])).rows[0];
  const buildings = (await db.query("SELECT * FROM buildings WHERE game_id=$1", [id])).rows;
  const event     = game.current_event;

  if (game.phase !== 'bilan') return res.status(400).json({ error: 'Pas encore en phase Bilan' });

  let demand = 0;
  let green  = 0;

  for (const b of buildings) {
    if (['hopital','ecole','recherche','residentiel'].includes(b.type)) {
      let lvl = b.level;
      if (b.type === 'residentiel' && event?.effect === 'demand_plus1_residential') lvl += 1;
      demand += lvl;
    }
    if (['eolienne','solaire'].includes(b.type) && b.level > 0) {
      let prod = b.level;
      if (event?.effect === 'green_zero') prod = 0;
      if (event?.effect === 'green_plus1') prod += 1;
      green += prod;
    }
    if (b.type === 'parc' && b.level > 0) {
      await db.query("UPDATE games SET pollution=GREATEST(0,pollution-$1) WHERE id=$2", [b.level, id]);
    }
  }

  const centrale = buildings.find(b => b.type === 'centrale_nucleaire');
  const fossilBaseConsumption = centrale ? Number(centrale.level) : 0;
  demand += fossilBaseConsumption;

  const fossil_covers = Math.max(0, demand - green);
  const maxFossil     = game.fossil_level >= 2 ? 8 : 4;

  let blackout = false;
  let blackout_excess = 0;
  if (fossil_covers > maxFossil) {
    blackout = true;
    blackout_excess = fossil_covers - maxFossil;
  }

  const multiplier       = game.fossil_level >= 2 ? 2 : 1;
  const effective_fossil = Math.min(fossil_covers, maxFossil);
  const pollution_add    = effective_fossil * multiplier;
  const new_pollution    = Math.min(20, game.pollution + pollution_add);

  await db.query(
    "UPDATE games SET pollution=$1, turn=turn+1, phase='event', current_event=NULL WHERE id=$2",
    [new_pollution, id]
  );

  await db.query("UPDATE players SET credits=credits+3 WHERE game_id=$1", [id]);

  const residentiels = buildings.filter(b => b.type === 'residentiel' && b.owner_slot && b.level > 0);
  for (const r of residentiels) {
    await db.query(
      "UPDATE players SET credits=credits+$1 WHERE game_id=$2 AND slot=$3",
      [r.level, id, r.owner_slot]
    );
  }

  await log(id, game.turn, `📊 Bilan : demande ${demand}, vert ${green}, fossile ${effective_fossil}, +${pollution_add} pollution`);

  const lost = new_pollution >= 20;
  if (lost) await db.query("UPDATE games SET status='lost' WHERE id=$1", [id]);

  const winners = await checkVictory(id);
  if (winners.length > 0) {
    await db.query("UPDATE games SET status='won' WHERE id=$1", [id]);
    for (const w of winners) {
      await log(id, game.turn, `🏆 ${w.pseudo} a gagné avec le rôle ${w.role} !`);
    }
  }

  res.json({
    demand, green, fossil_covers, effective_fossil,
    pollution_add, new_pollution, lost,
    blackout, blackout_excess,
    winners: winners.map(w => ({ pseudo: w.pseudo, role: w.role })),
  });
});

router.post('/:game_id/dismantle', async (req, res) => {
  const { player_slot } = req.body;
  const id = req.params.game_id;

  const game = (await db.query("SELECT * FROM games WHERE id=$1", [id])).rows[0];
  if (game.phase !== 'actions') return res.status(400).json({ error: 'Pas en phase Actions' });
  if (Number(game.current_player_slot) !== Number(player_slot)) return res.status(400).json({ error: "Ce n'est pas ton tour" });

  const players = (await db.query("SELECT * FROM players WHERE game_id=$1", [id])).rows;
  const totalCredits = players.reduce((sum, p) => sum + p.credits, 0);

  if (totalCredits < 16) return res.status(400).json({ error: `Crédits collectifs insuffisants (${totalCredits}/16 cr)` });

  let remaining = 16;
  for (const p of players) {
    const contribution = Math.min(p.credits, remaining);
    if (contribution > 0) {
      await db.query("UPDATE players SET credits=credits-$1 WHERE game_id=$2 AND slot=$3", [contribution, id, p.slot]);
      remaining -= contribution;
    }
    if (remaining <= 0) break;
  }

  await db.query("UPDATE buildings SET level=0, owner_slot=NULL WHERE game_id=$1 AND type='centrale_nucleaire'", [id]);
  await db.query("UPDATE games SET fossil_level=0, pollution=0 WHERE id=$1", [id]);

  await log(id, game.turn, `💥 La Centrale Fossile a été démantelée ! Pollution remise à 0.`);
  await nextPlayer(id, game);

  res.json({ success: true });
});

async function nextPlayer(game_id, game) {
  const players = (await db.query("SELECT * FROM players WHERE game_id=$1 ORDER BY slot", [game_id])).rows;
  const slots   = players.map(p => p.slot);
  const idx     = slots.indexOf(game.current_player_slot);
  const next    = slots[idx + 1];

  if (!next) {
    await db.query("UPDATE games SET phase='bilan', current_player_slot=NULL WHERE id=$1", [game_id]);
    await log(game_id, game.turn, '⚖️ Tous les joueurs ont joué → Phase Bilan');
  } else {
    await db.query("UPDATE games SET current_player_slot=$1 WHERE id=$2", [next, game_id]);
  }
}

async function log(game_id, turn, message) {
  await db.query(
    "INSERT INTO game_log (game_id, turn, message) VALUES ($1,$2,$3)",
    [game_id, turn, message]
  );
}

async function checkVictory(game_id) {
  const game      = (await db.query("SELECT * FROM games WHERE id=$1", [game_id])).rows[0];
  const players   = (await db.query("SELECT * FROM players WHERE game_id=$1", [game_id])).rows;
  const buildings = (await db.query("SELECT * FROM buildings WHERE game_id=$1", [game_id])).rows;

  const pollution  = game.pollution;
  const bldg       = (type) => buildings.filter(b => b.type === type);
  const lvl        = (type, minLevel) => buildings.some(b => b.type === type && b.level >= minLevel);
  const greenCount = buildings.filter(b => ['eolienne','solaire'].includes(b.type) && b.level >= 1).length;
  const fossilLevel = buildings.find(b => b.type === 'centrale_nucleaire')?.level ?? 0;
  const dismantled  = fossilLevel === 0;

  const winners = [];

  for (const p of players) {
    let won = false;
    switch(p.role) {
      case 'scientist':    won = lvl('recherche',2) && lvl('hopital',2); break;
      case 'ecologist':    won = greenCount >= 4 && pollution < 3; break;
      case 'industrialist':won = fossilLevel >= 2 && pollution > 15; break;
      case 'mayor':        won = lvl('hopital',1) && lvl('ecole',1) && lvl('recherche',1); break;
      case 'urbanist':     won = bldg('residentiel').filter(b => b.level >= 1).length >= 3 && lvl('ecole',2); break;
      case 'head_doctor':  won = lvl('hopital',2) && pollution < 5; break;
      case 'engineer':     won = greenCount >= 4 && dismantled; break;
      case 'banker':       won = p.credits >= 12 && bldg('residentiel').some(b => b.level >= 2 && b.owner_slot === p.slot); break;
      case 'activist':     won = fossilLevel <= 1 && pollution === 0; break;
      case 'developer':    won = bldg('residentiel').filter(b => b.level >= 2 && b.owner_slot === p.slot).length >= 2; break;
      case 'technocrat':   won = lvl('recherche',2) && greenCount >= 3 && fossilLevel <= 1; break;
      case 'lobbyist':     won = fossilLevel >= 2 && bldg('residentiel').filter(b => b.level >= 1).length >= 2 && pollution > 10 && pollution < 15; break;
      case 'union_leader': won = lvl('hopital',2) && fossilLevel >= 2; break;
      case 'visionary':    won = lvl('recherche',2) && bldg('residentiel').some(b => b.level >= 2 && b.owner_slot === p.slot) && greenCount >= 1; break;
    }
    if (won) winners.push(p);
  }

  return winners;
}

module.exports = router;