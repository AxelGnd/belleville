const express = require('express');
const router = express.Router();
const db = require('../db/connection');

router.post('/join', async (req, res) => {
  const { pseudo, slot, role } = req.body;

  try {
    let [games] = await db.query(
      "SELECT * FROM games WHERE status='waiting' LIMIT 1"
    );

    let game_id;
    if (games.length === 0) {
      const [result] = await db.query(
        "INSERT INTO games (status) VALUES ('waiting')"
      );
      game_id = result.insertId;

      const buildings = [
        'hopital','ecole','recherche',
        'residentiel','residentiel','eolienne','eolienne','solaire','solaire'
      ];
      for (const type of buildings) {
        await db.query(
          "INSERT INTO buildings (game_id, type, level) VALUES (?,?,0)",
          [game_id, type]
        );
      }
    } else {
      game_id = games[0].id;
    }

    const [existing] = await db.query(
      "SELECT * FROM players WHERE game_id=? AND slot=?",
      [game_id, slot]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Slot déjà pris' });
    }

    await db.query(
      "INSERT INTO players (game_id, pseudo, slot, role) VALUES (?,?,?,?)",
      [game_id, pseudo, slot, role]
    );

    const [players] = await db.query(
      "SELECT * FROM players WHERE game_id=?",
      [game_id]
    );

    res.json({ game_id, players });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/:game_id', async (req, res) => {
  const [players] = await db.query(
    "SELECT * FROM players WHERE game_id=?",
    [req.params.game_id]
  );
  res.json(players);
});

module.exports = router;