const express = require('express');
const router = express.Router();
const db = require('../db/connection');

router.post('/join', async (req, res) => {
  const { pseudo, slot, role } = req.body;

  try {
    let result = await db.query(
      "SELECT * FROM games WHERE status='waiting' LIMIT 1"
    );

    let game_id;
    if (result.rows.length === 0) {
      const newGame = await db.query(
        "INSERT INTO games (status) VALUES ('waiting') RETURNING id"
      );
      game_id = newGame.rows[0].id;

      const buildings = [
        'hopital','ecole','recherche',
        'residentiel','residentiel','eolienne','eolienne','solaire','solaire'
      ];
      for (const type of buildings) {
        await db.query(
          "INSERT INTO buildings (game_id, type, level) VALUES ($1,$2,0)",
          [game_id, type]
        );
      }
    } else {
      game_id = result.rows[0].id;
    }

    const existing = await db.query(
      "SELECT * FROM players WHERE game_id=$1 AND slot=$2",
      [game_id, slot]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Slot déjà pris' });
    }

    await db.query(
      "INSERT INTO players (game_id, pseudo, slot, role) VALUES ($1,$2,$3,$4)",
      [game_id, pseudo, slot, role]
    );

    const players = await db.query(
      "SELECT * FROM players WHERE game_id=$1",
      [game_id]
    );

    res.json({ game_id, players: players.rows });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/:game_id', async (req, res) => {
  const players = await db.query(
    "SELECT * FROM players WHERE game_id=$1",
    [req.params.game_id]
  );
  res.json(players.rows);
});
router.get('/current', async (req, res) => {
  try {
    const game = await db.query(
      "SELECT * FROM games WHERE status='waiting' ORDER BY id DESC LIMIT 1"
    );
    if (game.rows.length === 0) return res.json([]);
    const players = await db.query(
      "SELECT * FROM players WHERE game_id=$1",
      [game.rows[0].id]
    );
    res.json(players.rows);
  } catch (err) {
    res.json([]);
  }
});
module.exports = router;