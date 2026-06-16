const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');

const EVENTS = [
  { id:'cold_wave',     type:'crisis',       title:'Cold Wave',              desc:'All Residential buildings consume +1 Energy this turn.',  effect:'demand_plus1_residential' },
  { id:'toxic_leak',    type:'crisis',       title:'Toxic Leak',             desc:'+2 Pollution immediately.',                               effect:'pollution_plus2' },
  { id:'shortage',      type:'crisis',       title:'Material Shortage',      desc:'Upgrading costs +1 CR this turn.',                        effect:'upgrade_cost_plus1' },
  { id:'no_wind',       type:'crisis',       title:'Cloudy & No Wind',       desc:'Green Energy produces 0 this turn.',                      effect:'green_zero' },
  { id:'health_crisis', type:'crisis',       title:'Respiratory Crisis',     desc:'Each player loses 2 CR.',                                 effect:'all_lose2cr' },
  { id:'subsidy',       type:'opportunity',  title:'European Subsidies',     desc:'Each player receives +2 CR.',                             effect:'all_gain2cr' },
  { id:'tech_advance',  type:'opportunity',  title:'Tech Breakthrough',      desc:'Upgrading to Lv2 costs 1 CR less this turn.',             effect:'upgrade_cost_minus1' },
  { id:'earth_day',     type:'opportunity',  title:'Earth Day',              desc:'Next depollution this turn is free.',                     effect:'free_depollute' },
  { id:'sunny_day',     type:'opportunity',  title:'Sunny Day',              desc:'Green Energy produces +1 extra this turn.',               effect:'green_plus1' },
  { id:'elections',     type:'neutral',      title:'Municipal Elections',    desc:'No Grand Project this turn: +1 Pollution.',               effect:'elections' },
  { id:'audit',         type:'neutral',      title:'Ecological Audit',       desc:'Fossil Lv2: +2 Poll. Fossil Lv1: -1 Poll.',              effect:'audit' },
];

const COSTS = {
  hopital:            [5, 8],
  ecole:              [5, 8],
  recherche:          [6, 10],
  residentiel:        [4, 8],
  eolienne:           [4, 6],
  solaire:            [4, 6],
  parc:               [13, 20],
  centrale_nucleaire: [0, 4],
};

// ── GET state ────────────────────────────────────────────────
router.get('/:game_id/state', async (req, res) => {
  try {
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
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST start ───────────────────────────────────────────────
router.post('/:game_id/start', async (req, res) => {
  try {
    const id = req.params.game_id;
    await db.query(
      "UPDATE games SET status='playing', phase='event', current_player_slot=1, turn=1 WHERE id=$1",
      [id]
    );
    await addLog(id, 1, '🏙 Game started! Phase: Event');
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST draw-event ──────────────────────────────────────────
router.post('/:game_id/draw-event', async (req, res) => {
  try {
    const id   = req.params.game_id;
    const game = (await db.query("SELECT * FROM games WHERE id=$1", [id])).rows[0];

    if (game.phase !== 'event') return res.status(400).json({ error: 'Not in Event phase' });

    const event = EVENTS[Math.floor(Math.random() * EVENTS.length)];

    if (event.effect === 'pollution_plus2') {
      await db.query("UPDATE games SET pollution=LEAST(20, pollution+2) WHERE id=$1", [id]);
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
      "UPDATE games SET phase='actions', current_player_slot=1, current_event=$2 WHERE id=$1",
      [id, JSON.stringify(event)]
    );
    await addLog(id, game.turn, `🎴 Event: ${event.title} — ${event.desc}`);

    res.json({ event });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST action ──────────────────────────────────────────────
router.post('/:game_id/action', async (req, res) => {
  try {
    const { player_slot, action_type, building_id } = req.body;
    const id = req.params.game_id;

    const game = (await db.query("SELECT * FROM games WHERE id=$1", [id])).rows[0];
    if (game.phase !== 'actions') return res.status(400).json({ error: 'Not in Actions phase' });
    if (game.current_player_slot !== player_slot) return res.status(400).json({ error: "Not your turn" });

    const player = (await db.query("SELECT * FROM players WHERE game_id=$1 AND slot=$2", [id, player_slot])).rows[0];
    const event  = game.current_event;

    if (action_type === 'pass') {
      await nextPlayer(id, game);
      await addLog(id, game.turn, `⏭ Player ${player_slot} passes`);
      return res.json({ success: true });
    }

    if (action_type === 'upgrade') {
      const building = (await db.query("SELECT * FROM buildings WHERE id=$1 AND game_id=$2", [building_id, id])).rows[0];
      if (!building) return res.status(404).json({ error: 'Building not found' });
      if (building.level >= 2) return res.status(400).json({ error: 'Already at max level' });

      if (building.level === 1 && building.type !== 'recherche') {
        const recherche = (await db.query("SELECT * FROM buildings WHERE game_id=$1 AND type='recherche'", [id])).rows[0];
        if (!recherche || recherche.level < 1) {
          return res.status(400).json({ error: 'Research Center must be Lv1 to build Lv2' });
        }
      }

      let cost = COSTS[building.type]?.[building.level] ?? 4;
      if (cost === 0) return res.status(400).json({ error: 'This building cannot be upgraded' });

      if (event?.effect === 'upgrade_cost_plus1')  cost += 1;
      if (event?.effect === 'upgrade_cost_minus1' && building.level === 1) cost = Math.max(0, cost - 1);

      if (player.credits < cost) return res.status(400).json({ error: `Not enough credits (need: ${cost})` });

      await db.query("UPDATE buildings SET level=level+1, owner_slot=$1 WHERE id=$2", [player_slot, building_id]);
      await db.query("UPDATE players SET credits=credits-$1 WHERE game_id=$2 AND slot=$3", [cost, id, player_slot]);

      if (building.type === 'centrale_nucleaire' && building.level === 1) {
        await db.query("UPDATE games SET fossil_level=2, pollution=LEAST(20,pollution+4) WHERE id=$1", [id]);
      }

      await addLog(id, game.turn, `🏗 Player ${player_slot} upgrades ${building.type} → Lv${building.level + 1} (-${cost} cr)`);
      await nextPlayer(id, game);
      return res.json({ success: true, new_level: building.level + 1, cost });
    }

    if (action_type === 'depollute') {
      const ecole = (await db.query("SELECT * FROM buildings WHERE game_id=$1 AND type='ecole'", [id])).rows[0];
      if (!ecole || ecole.level < 1) return res.status(400).json({ error: 'School must be at Level 1' });

      const isFree = event?.effect === 'free_depollute';
      const cost   = isFree ? 0 : 3;
      if (player.credits < cost) return res.status(400).json({ error: 'Not enough credits' });

      const reduction = ecole.level >= 2 ? 2 : 1;
      await db.query("UPDATE players SET credits=credits-$1 WHERE game_id=$2 AND slot=$3", [cost, id, player_slot]);
      await db.query("UPDATE games SET pollution=GREATEST(0,pollution-$1) WHERE id=$2", [reduction, id]);

      await addLog(id, game.turn, `🌱 Player ${player_slot} depollutes (-${reduction} pollution, -${cost} cr)`);
      await nextPlayer(id, game);
      return res.json({ success: true, reduction, cost });
    }
    if (action_type === 'dismantle') {
  const building = (await db.query("SELECT * FROM buildings WHERE id=$1 AND game_id=$2", [building_id, id])).rows[0];
  if (building.type !== 'centrale_nucleaire') return res.status(400).json({ error: 'Not the power plant' });

  await db.query("UPDATE buildings SET level=0, owner_slot=NULL WHERE id=$1", [building_id]);
  await addLog(id, game.turn, `☢️ Player ${player_slot} dismantled the Nuclear Power Plant`);
  await nextPlayer(id, game);
  return res.json({ success: true });
}

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST end-turn ────────────────────────────────────────────
// ── POST end-turn ────────────────────────────────────────────
router.post('/:game_id/end-turn', async (req, res) => {
  try {
    const id        = req.params.game_id;
    const game       = (await db.query("SELECT * FROM games WHERE id=$1", [id])).rows[0];
    const buildings  = (await db.query("SELECT * FROM buildings WHERE game_id=$1", [id])).rows;
    const event      = game.current_event;

    if (game.phase !== 'bilan') return res.status(400).json({ error: 'Not in Bilan phase yet' });

    let demand = 0;
    let green  = 0;

    for (const b of buildings) {
      if (['hopital','ecole','recherche','centrale_nucleaire'].includes(b.type)) {
        demand += b.level;
      }
      if (b.type === 'residentiel') {
        if (b.level === 1) demand += 2;
        if (b.level === 2) demand += 1;
        if (event?.effect === 'demand_plus1_residential' && b.level > 0) demand += 1;
      }
      if (['eolienne','solaire'].includes(b.type) && b.level > 0) {
        let prod = b.level;
        if (event?.effect === 'green_zero')  prod = 0;
        if (event?.effect === 'green_plus1') prod += 1;
        green += prod;
      }
      if (b.type === 'parc' && b.level > 0) {
        await db.query("UPDATE games SET pollution=GREATEST(0,pollution-$1) WHERE id=$2", [b.level, id]);
      }
    }

    const centrale = buildings.find(b => b.type === 'centrale_nucleaire');
    const fossilLevel = centrale?.level ?? 0;

    // Capacité et coût pollution par énergie selon le niveau
    const maxFossil    = fossilLevel >= 2 ? 6 : fossilLevel === 1 ? 4 : 0;
    const pollutionPerEnergy = fossilLevel >= 2 ? 2 : 1;

    const remainingDemand  = Math.max(0, demand - green);
    const effective_fossil = Math.min(remainingDemand, maxFossil);
    const pollution_add    = effective_fossil * pollutionPerEnergy;

    const blackout_excess = Math.max(0, remainingDemand - maxFossil);
    const blackout = blackout_excess > 0;

    const gameNow = (await db.query("SELECT pollution FROM games WHERE id=$1", [id])).rows[0];
    const new_pollution = Math.min(20, gameNow.pollution + pollution_add);

    // Si pas de blackout, on avance le tour normalement
    if (!blackout) {
      await db.query(
        "UPDATE games SET pollution=$1, turn=turn+1, phase='event', current_event=NULL WHERE id=$2",
        [new_pollution, id]
      );
      await applyEndOfTurnBonuses(id, buildings);
      await addLog(id, game.turn, `📊 Report: demand ${demand}, green ${green}, fossil ${effective_fossil}, +${pollution_add} pollution`);

      const lost = new_pollution >= 20;
      if (lost) await db.query("UPDATE games SET status='lost' WHERE id=$1", [id]);

      const winners = await checkVictory(id);
      if (winners.length > 0) {
        await db.query("UPDATE games SET status='won' WHERE id=$1", [id]);
        for (const w of winners) await addLog(id, game.turn, `🏆 ${w.pseudo} won with role ${w.role}!`);
      }

      return res.json({
        demand, green, effective_fossil, pollution_add, new_pollution,
        lost, blackout: false,
        winners: winners.map(w => ({ pseudo: w.pseudo, role: w.role })),
      });
    }

    // ── BLACKOUT : on bloque en phase de vote, pollution déjà ajoutée pour le fossile max ──
    await db.query(
      "UPDATE games SET pollution=$1, phase='blackout', blackout_excess=$2 WHERE id=$3",
      [new_pollution, blackout_excess, id]
    );
    await addLog(id, game.turn, `⚡ BLACKOUT! Demand exceeded by ${blackout_excess}. Vote to downgrade ${blackout_excess} building level(s).`);

    res.json({
      demand, green, effective_fossil, pollution_add, new_pollution,
      lost: new_pollution >= 20,
      blackout: true,
      blackout_excess,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST blackout-downgrade — vote pour descendre un bâtiment ──
router.post('/:game_id/blackout-downgrade', async (req, res) => {
  try {
    const { building_id } = req.body;
    const id = req.params.game_id;

    const game = (await db.query("SELECT * FROM games WHERE id=$1", [id])).rows[0];
    if (game.phase !== 'blackout') return res.status(400).json({ error: 'Not in blackout phase' });
    if (game.blackout_excess <= 0) return res.status(400).json({ error: 'No more downgrades needed' });

    const building = (await db.query("SELECT * FROM buildings WHERE id=$1 AND game_id=$2", [building_id, id])).rows[0];
    if (!building) return res.status(404).json({ error: 'Building not found' });
    if (building.level <= 0) return res.status(400).json({ error: 'Building already at level 0' });

    await db.query("UPDATE buildings SET level=level-1 WHERE id=$1", [building_id]);
    const newExcess = game.blackout_excess - 1;

    await addLog(id, game.turn, `⬇️ ${building.type} downgraded to Lv${building.level - 1} (blackout)`);

    if (newExcess <= 0) {
      // Blackout résolu → on termine le tour normalement
      const buildings = (await db.query("SELECT * FROM buildings WHERE game_id=$1", [id])).rows;
      await db.query(
        "UPDATE games SET turn=turn+1, phase='event', current_event=NULL, blackout_excess=0 WHERE id=$1",
        [id]
      );
      await applyEndOfTurnBonuses(id, buildings);
      await addLog(id, game.turn, '✅ Blackout resolved. Moving to next turn.');

      const winners = await checkVictory(id);
      if (winners.length > 0) {
        await db.query("UPDATE games SET status='won' WHERE id=$1", [id]);
        for (const w of winners) await addLog(id, game.turn, `🏆 ${w.pseudo} won with role ${w.role}!`);
      }

      return res.json({ success: true, resolved: true, winners: winners.map(w => ({ pseudo: w.pseudo, role: w.role })) });
    }

    await db.query("UPDATE games SET blackout_excess=$1 WHERE id=$2", [newExcess, id]);
    res.json({ success: true, resolved: false, remaining: newExcess });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Helpers ──────────────────────────────────────────────────
async function nextPlayer(game_id, game) {
  const players = (await db.query("SELECT * FROM players WHERE game_id=$1 ORDER BY slot", [game_id])).rows;
  const slots   = players.map(p => p.slot);
  const idx     = slots.indexOf(game.current_player_slot);
  const next    = slots[idx + 1];

  if (!next) {
    await db.query("UPDATE games SET phase='bilan', current_player_slot=NULL WHERE id=$1", [game_id]);
    await addLog(game_id, game.turn, '⚖️ All players played → Bilan phase');
  } else {
    await db.query("UPDATE games SET current_player_slot=$1 WHERE id=$2", [next, game_id]);
  }
}

async function addLog(game_id, turn, message) {
  await db.query(
    "INSERT INTO game_log (game_id, turn, message) VALUES ($1,$2,$3)",
    [game_id, turn, message]
  );
}

async function checkVictory(game_id) {
  const game      = (await db.query("SELECT * FROM games WHERE id=$1", [game_id])).rows[0];
  const players   = (await db.query("SELECT * FROM players WHERE game_id=$1", [game_id])).rows;
  const buildings = (await db.query("SELECT * FROM buildings WHERE game_id=$1", [game_id])).rows;

  const pollution   = game.pollution;
  const bldg        = (type) => buildings.filter(b => b.type === type);
  const lvl         = (type, minLevel) => buildings.some(b => b.type === type && b.level >= minLevel);
  const greenCount  = buildings.filter(b => ['eolienne','solaire'].includes(b.type) && b.level >= 1).length;
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
async function applyEndOfTurnBonuses(game_id, buildings) {
  await db.query("UPDATE players SET credits=credits+3 WHERE game_id=$1", [game_id]);

  const residentiels = buildings.filter(b => b.type === 'residentiel' && b.owner_slot && b.level > 0);
  for (const r of residentiels) {
    const bonus = r.level === 1 ? 1 : r.level === 2 ? 2 : 0;
    await db.query(
      "UPDATE players SET credits=credits+$1 WHERE game_id=$2 AND slot=$3",
      [bonus, game_id, r.owner_slot]
    );
  }
}
module.exports = router;