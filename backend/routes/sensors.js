const express = require('express');
const router = express.Router();
const db = require('../db/connection');

router.post('/push', async (req, res) => {
  const { game_id, sensor_name, value } = req.body;
  await db.query(
    "INSERT INTO sensors (game_id, sensor_name, value) VALUES ($1,$2,$3)",
    [game_id, sensor_name, value]
  );
  res.json({ success: true });
});

router.get('/:game_id/:sensor_name', async (req, res) => {
  const rows = await db.query(
    "SELECT * FROM sensors WHERE game_id=$1 AND sensor_name=$2 ORDER BY recorded_at DESC LIMIT 1",
    [req.params.game_id, req.params.sensor_name]
  );
  res.json(rows.rows[0] ?? null);
});

module.exports = router;