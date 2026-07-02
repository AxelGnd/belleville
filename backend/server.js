require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.FRONTEND_URL, methods: ['GET','POST'] }
});

app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(express.json());

app.use('/api/players', require('./routes/players'));
app.use('/api/game',    require('./routes/game'));
app.use('/api/sensors', require('./routes/sensors'));

io.on('connection', (socket) => {
  console.log('Client connecté :', socket.id);

  socket.on('join_game', (game_id) => {
    socket.join(`game_${game_id}`);
  });

  socket.on('player_joined', (data) => {
    io.to(`game_${data.game_id}`).emit('lobby_update', data);
  });

  socket.on('game_update', (data) => {
    io.to(`game_${data.game_id}`).emit('state_update', data);
  });

  socket.on('disconnect', () => {
    console.log('Client déconnecté :', socket.id);
  });
  socket.on('game_end', (data) => {
  io.to(`game_${data.game_id}`).emit('game_ended', data);
});
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Serveur lancé sur le port ${PORT}`));