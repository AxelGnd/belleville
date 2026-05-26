const express = require('express');
const router = express.Router();
const db = require('../db/connection');

router.get('/:game_id/state', async (req, res) => {
  const id = req.params.game_id;
  const [[game]]    = await db.query("SELECT * FROM games WHERE id=?", [id]);
  const [players]   = await db.query("SELECT * FROM players WHERE game_id=?", [id]);
  const [buildings] = await db.query("SELECT * FROM buildings WHERE game_id=?", [id]);
  const [logs]      = await db.query(
    "SELECT * FROM game_log WHERE game_id=? ORDER BY id DESC LIMIT 10", [id]
  );
  res.json({ game, players, buildings, logs });
});

router.post('/:game_id/start', async (req, res) => {
  await db.query(
    "UPDATE games SET status='playing' WHERE id=?",
    [req.params.game_id]
  );
  res.json({ success: true });
});

router.post('/:game_id/upgrade', async (req, res) => {
  const { building_id, player_slot } = req.body;
  const id = req.params.game_id;

  const [[building]] = await db.query(
    "SELECT * FROM buildings WHERE id=? AND game_id=?", [building_id, id]
  );
  const [[player]] = await db.query(
    "SELECT * FROM players WHERE game_id=? AND slot=?", [id, player_slot]
  );

  const costs = {
    hopital:     [5, 8],
    ecole:       [5, 8],
    recherche:   [6, 10],
    residentiel: [4, 8],
    eolienne:    [4, 6],
    solaire:     [4, 6]
  };
  const cost = costs[building.type]?.[building.level] ?? 4;

  if (player.credits < cost) {
    return res.status(400).json({ error: 'Crédits insuffisants' });
  }

  await db.query("UPDATE buildings SET level=level+1 WHERE id=?", [building_id]);
  await db.query(
    "UPDATE players SET credits=credits-? WHERE game_id=? AND slot=?",
    [cost, id, player_slot]
  );

  await db.query(
    "INSERT INTO game_log (game_id, turn, message) SELECT id, turn, ? FROM games WHERE id=?",
    [`Joueur ${player_slot} améliore ${building.type} (Nv${building.level + 1})`, id]
  );

  res.json({ success: true, new_level: building.level + 1 });
});

router.post('/:game_id/end-turn', async (req, res) => {
  const id = req.params.game_id;
  const [[game]]    = await db.query("SELECT * FROM games WHERE id=?", [id]);
  const [buildings] = await db.query("SELECT * FROM buildings WHERE game_id=?", [id]);

  let demand = 0;
  let green  = 0;

  for (const b of buildings) {
    if (['hopital','ecole','recherche','residentiel'].includes(b.type)) {
      demand += b.level;
    }
    if (['eolienne','solaire'].includes(b.type) && b.level > 0) {
      green += b.level;
    }
  }

  const fossil_covers = Math.max(0, demand - green);
  const multiplier    = game.fossil_level === 2 ? 2 : 1;
  const pollution_add = fossil_covers * multiplier;
  const new_pollution = Math.min(20, game.pollution + pollution_add);

  await db.query(
    "UPDATE games SET pollution=?, turn=turn+1 WHERE id=?",
    [new_pollution, id]
  );

  await db.query(
    "UPDATE players SET credits=credits+3 WHERE game_id=?", [id]
  );

  await db.query(
    "INSERT INTO game_log (game_id, turn, message) VALUES (?,?,?)",
    [id, game.turn, `Bilan : demande ${demand}, vert ${green}, fossile couvre ${fossil_covers}, +${pollution_add} pollution`]
  );

  const lost = new_pollution >= 20;
  res.json({ demand, green, fossil_covers, pollution_add, new_pollution, lost });
});

router.post('/:game_id/depollute', async (req, res) => {
  const { player_slot } = req.body;
  const id = req.params.game_id;

  const [[player]] = await db.query(
    "SELECT * FROM players WHERE game_id=? AND slot=?", [id, player_slot]
  );
  if (player.credits < 3) {
    return res.status(400).json({ error: 'Crédits insuffisants' });
  }

  const [[ecole]] = await db.query(
    "SELECT * FROM buildings WHERE game_id=? AND type='ecole'", [id]
  );
  if (!ecole || ecole.level < 1) {
    return res.status(400).json({ error: "L'École doit être au Niveau 1" });
  }

  const reduction = ecole.level >= 2 ? 2 : 1;
  await db.query(
    "UPDATE players SET credits=credits-3 WHERE game_id=? AND slot=?", [id, player_slot]
  );
  await db.query(
    "UPDATE games SET pollution=GREATEST(0, pollution-?) WHERE id=?", [reduction, id]
  );

  res.json({ success: true, reduction });
});

module.exports = router;