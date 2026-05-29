const express = require('express');
const router = express.Router();
const db = require('../db/connection');

router.get('/:game_id/state', async (req, res) => {
  const id = req.params.game_id;
  const game     = await db.query("SELECT * FROM games WHERE id=$1", [id]);
  const players  = await db.query("SELECT * FROM players WHERE game_id=$1", [id]);
  const buildings= await db.query("SELECT * FROM buildings WHERE game_id=$1", [id]);
  const logs     = await db.query(
    "SELECT * FROM game_log WHERE game_id=$1 ORDER BY id DESC LIMIT 10", [id]
  );
  res.json({
    game:      game.rows[0],
    players:   players.rows,
    buildings: buildings.rows,
    logs:      logs.rows
  });
});

router.post('/:game_id/start', async (req, res) => {
  await db.query(
    "UPDATE games SET status='playing' WHERE id=$1",
    [req.params.game_id]
  );
  res.json({ success: true });
});

router.post('/:game_id/upgrade', async (req, res) => {
  const { building_id, player_slot } = req.body;
  const id = req.params.game_id;

  const building = await db.query(
    "SELECT * FROM buildings WHERE id=$1 AND game_id=$2", [building_id, id]
  );
  const player = await db.query(
    "SELECT * FROM players WHERE game_id=$1 AND slot=$2", [id, player_slot]
  );

  if (!building.rows[0]) return res.status(404).json({ error: 'Bâtiment introuvable' });
  if (!player.rows[0])   return res.status(404).json({ error: 'Joueur introuvable' });

  const b = building.rows[0];
  const p = player.rows[0];

  const costs = {
    hopital:     [5, 8],
    ecole:       [5, 8],
    recherche:   [6, 10],
    residentiel: [4, 8],
    eolienne:    [4, 6],
    solaire:     [4, 6]
  };
  const cost = costs[b.type]?.[b.level] ?? 4;

  if (p.credits < cost) {
    return res.status(400).json({ error: 'Crédits insuffisants' });
  }

  await db.query("UPDATE buildings SET level=level+1 WHERE id=$1", [building_id]);
  await db.query(
    "UPDATE players SET credits=credits-$1 WHERE game_id=$2 AND slot=$3",
    [cost, id, player_slot]
  );

  await db.query(
    "INSERT INTO game_log (game_id, turn, message) SELECT id, turn, $1 FROM games WHERE id=$2",
    [`Joueur ${player_slot} améliore ${b.type} (Nv${b.level + 1})`, id]
  );

  res.json({ success: true, new_level: b.level + 1 });
});

router.post('/:game_id/end-turn', async (req, res) => {
  const id = req.params.game_id;
  const game      = await db.query("SELECT * FROM games WHERE id=$1", [id]);
  const buildings = await db.query("SELECT * FROM buildings WHERE game_id=$1", [id]);

  const g = game.rows[0];
  let demand = 0;
  let green  = 0;

  for (const b of buildings.rows) {
    if (['hopital','ecole','recherche','residentiel'].includes(b.type)) {
      demand += b.level;
    }
    if (['eolienne','solaire'].includes(b.type) && b.level > 0) {
      green += b.level;
    }
  }

  const fossil_covers = Math.max(0, demand - green);
  const multiplier    = g.fossil_level === 2 ? 2 : 1;
  const pollution_add = fossil_covers * multiplier;
  const new_pollution = Math.min(20, g.pollution + pollution_add);

  await db.query(
    "UPDATE games SET pollution=$1, turn=turn+1 WHERE id=$2",
    [new_pollution, id]
  );

  await db.query(
    "UPDATE players SET credits=credits+3 WHERE game_id=$1", [id]
  );

  await db.query(
    "INSERT INTO game_log (game_id, turn, message) VALUES ($1,$2,$3)",
    [id, g.turn, `Bilan : demande ${demand}, vert ${green}, fossile ${fossil_covers}, +${pollution_add} pollution`]
  );

  const lost = new_pollution >= 20;
  res.json({ demand, green, fossil_covers, pollution_add, new_pollution, lost });
});

router.post('/:game_id/depollute', async (req, res) => {
  const { player_slot } = req.body;
  const id = req.params.game_id;

  const player = await db.query(
    "SELECT * FROM players WHERE game_id=$1 AND slot=$2", [id, player_slot]
  );
  if (!player.rows[0] || player.rows[0].credits < 3) {
    return res.status(400).json({ error: 'Crédits insuffisants' });
  }

  const ecole = await db.query(
    "SELECT * FROM buildings WHERE game_id=$1 AND type='ecole'", [id]
  );
  if (!ecole.rows[0] || ecole.rows[0].level < 1) {
    return res.status(400).json({ error: "L'École doit être au Niveau 1" });
  }

  const reduction = ecole.rows[0].level >= 2 ? 2 : 1;
  await db.query(
    "UPDATE players SET credits=credits-3 WHERE game_id=$1 AND slot=$2", [id, player_slot]
  );
  await db.query(
    "UPDATE games SET pollution=GREATEST(0, pollution-$1) WHERE id=$2", [reduction, id]
  );

  res.json({ success: true, reduction });
});

module.exports = router;