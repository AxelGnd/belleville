const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');

router.post('/join', async (req, res) => {
  const { pseudo, role } = req.body;
  try {
    let result = await db.query(
      "SELECT * FROM games WHERE status='waiting' ORDER BY id DESC LIMIT 1"
    );

    let game_id;
    if (result.rows.length === 0) {
      const newGame = await db.query(
        "INSERT INTO games (status) VALUES ('waiting') RETURNING id"
      );
      game_id = newGame.rows[0].id;

      const buildings = [
        'hopital','ecole','recherche',
        'residentiel','residentiel','residentiel',
        'eolienne','eolienne','solaire','solaire',
        'parc','parc','parc',
        
      ];
      for (const type of buildings) {
        await db.query(
          "INSERT INTO buildings (game_id, type, level) VALUES ($1,$2,0)",
          [game_id, type]
        );
      }
      await db.query(
  "INSERT INTO buildings (game_id, type, level) VALUES ($1,'centrale_nucleaire',1)",
  [game_id]
);
    } else {
      game_id = result.rows[0].id;
    }

    const taken = await db.query(
      "SELECT slot FROM players WHERE game_id=$1", [game_id]
    );
    const takenSlots = taken.rows.map(r => r.slot);
    const slot = [1,2,3,4].find(s => !takenSlots.includes(s));

    if (!slot) return res.status(409).json({ error: 'Game is full' });

    const roleCheck = await db.query(
      "SELECT * FROM players WHERE game_id=$1 AND role=$2", [game_id, role]
    );
    if (roleCheck.rows.length > 0) {
      return res.status(409).json({ error: 'Role already taken' });
    }

    await db.query(
      "INSERT INTO players (game_id, pseudo, slot, role) VALUES ($1,$2,$3,$4)",
      [game_id, pseudo, slot, role]
    );

    const players = await db.query(
      "SELECT * FROM players WHERE game_id=$1", [game_id]
    );

    res.json({ game_id, players: players.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/current', async (req, res) => {
  try {
    const game = await db.query(
      "SELECT * FROM games WHERE status IN ('waiting','playing') ORDER BY id DESC LIMIT 1"
    );
    if (game.rows.length === 0) return res.json([]);
    const players = await db.query(
      "SELECT * FROM players WHERE game_id=$1 ORDER BY slot",
      [game.rows[0].id]
    );
    res.json(players.rows);
  } catch (err) {
    res.json([]);
  }
});

router.get('/reconnect/:pseudo', async (req, res) => {
  const { pseudo } = req.params;
  try {
    const player = await db.query("SELECT * FROM players WHERE pseudo=$1 ORDER BY id DESC LIMIT 1", [pseudo]);
    if (!player.rows[0]) return res.status(404).json({ error: 'Joueur introuvable' });
    const p = player.rows[0];
    const game = await db.query("SELECT * FROM games WHERE id=$1", [p.game_id]);
    if (!game.rows[0] || game.rows[0].status === 'waiting') {
      return res.status(404).json({ error: 'Pas de partie en cours' });
    }
    res.json({ player: p, game: game.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/reset', async (req, res) => {
  try {
    await db.query("TRUNCATE TABLE game_log, sensors, buildings, players, games RESTART IDENTITY CASCADE");
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Reset failed' });
  }
});

module.exports = router;