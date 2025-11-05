const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));
// Maps roomId to {players: [...], state, interval}
const rooms = {};

function makeRoomId() {
    return crypto.randomBytes(3).toString('hex');
}

function createInitialState() {
  const width = 800;
  const height = 600;
  const paddleHeight = 100;
  return {
    width,
    height,
    paddleHeight,
    paddles: [height / 2 - paddleHeight / 2, height / 2 - paddleHeight / 2],
    ball: { x: width / 2, y: height / 2, vx: 6 * (Math.random() > 0.5 ? 1 : -1), vy: 3 * (Math.random() > 0.5 ? 1 : -1) },
    score: [0, 0],
    running: false,
  };
}

function resetBall(state, dir) {
  state.ball.x = state.width / 2;
  state.ball.y = state.height / 2;
  const speed = 6;
  const angle = (Math.random() * (Math.PI / 3)) - (Math.PI / 6); // random angle between -30 to 30 degrees
  state.ball.vx = speed * Math.cos(angle) * (dir === 1 ? 1 : -1);
  state.ball.vy = speed * Math.sin(angle) * (Math.random() > 0.5 ? 1 : -1);
}

function startGameLoop(roomId) {
  const room = rooms[roomId];
  if (!room || room.interval) return;

  const tickRate = 1000 / 60;
  room.state.running = true;

  room.interval = setInterval(() => {
    const s = room.state;
    s.ball.x += s.ball.vx;
    s.ball.y += s.ball.vy;

    // Top & bottom collisions
    if (s.ball.y <= 0) { s.ball.y = 0; s.ball.vy *= -1; }
    if (s.ball.y >= s.height) { s.ball.y = s.height; s.ball.vy *= -1; }

    const paddleXLeft = 20;
    const paddleXRight = s.width - 20;
    const paddleW = 10;

    // Left paddle
    if (s.ball.x - 5 <= paddleXLeft + paddleW) {
      const paddle_y = s.paddles[0];
      if (s.ball.y >= paddle_y && s.ball.y <= paddle_y + s.paddleHeight) {
        s.ball.x = paddleXLeft + paddleW + 5;
        s.ball.vx *= -1.05;
        // Add vertical velocity based on where it hit the paddle
        const diff = (s.ball.y - (paddle_y + s.paddleHeight / 2)) / (s.paddleHeight / 2);
        s.ball.vy += diff * 2;
      }
    }

    // Right paddle
    if (s.ball.x + 5 >= paddleXRight) {
      const paddle_y = s.paddles[1];
      if (s.ball.y >= paddle_y && s.ball.y <= paddle_y + s.paddleHeight) {
        s.ball.x = paddleXRight - 5;
        s.ball.vx *= -1.05;
        const diff = (s.ball.y - (paddle_y + s.paddleHeight / 2)) / (s.paddleHeight / 2);
        s.ball.vy += diff * 2;
      }
    }

    // Scoring
    if (s.ball.x < 0) {
      s.score[1] += 1;
      resetBall(s, 1);
    }
    if (s.ball.x > s.width) {
      s.score[0] += 1;
      resetBall(s, -1);
    }

    // Clamp paddles
    for (let i = 0; i < 2; i++) {
      if (s.paddles[i] < 0) s.paddles[i] = 0;
      if (s.paddles[i] + s.paddleHeight > s.height) s.paddles[i] = s.height - s.paddleHeight;
    }

    // Broadcast state
    const gameState = {
      ball: s.ball,
      paddles: s.paddles,
      score: s.score,
      width: s.width,
      height: s.height,
      paddleHeight: s.paddleHeight,
    };

    io.to(roomId).emit('gameState', gameState);
  }, tickRate);
}

function stopGameLoop(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  if (room.interval) {
    clearInterval(room.interval);
    room.interval = null;
  }
  room.state.running = false;
}

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  socket.on('createGame', (callback) => {
    const roomId = makeRoomId();
    rooms[roomId] = {
      players: [socket.id],
      state: createInitialState(),
      interval: null,
    };
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.playerIndex = 0;
    console.log(`room ${roomId} created by ${socket.id}`);
    callback({ ok: true, roomId, playerIndex: 0 });
  });

  socket.on('joinGame', (roomId, callback) => {
    const room = rooms[roomId];
    if (!room) {
      callback({ ok: false, error: 'Room not found' });
      return;
    }
    if (room.players.length >= 2) {
      callback({ ok: false, error: 'Room full' });
      return;
    }
    room.players.push(socket.id);
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.playerIndex = 1;
    console.log(`${socket.id} joined room ${roomId}`);
    callback({ ok: true, roomId, playerIndex: 1 });

    startGameLoop(roomId);
  });

  socket.on('paddleMove', (posY) => {
    const roomId = socket.data.roomId;
    const playerIndex = socket.data.playerIndex;
    if (!roomId || playerIndex === undefined) return;
    const room = rooms[roomId];
    if (!room) return;

    const topY = posY - room.state.paddleHeight / 2;
    room.state.paddles[playerIndex] = topY;
  });

  socket.on('disconnect', () => {
    console.log('socket disconnected', socket.id);
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = rooms[roomId];
    if (!room) return;

    // Remove player
    room.players = room.players.filter(id => id !== socket.id);
    io.to(roomId).emit('playerLeft');

    stopGameLoop(roomId);
    delete rooms[roomId];
    console.log(`room ${roomId} deleted`);
  });
});

server.listen(3000, () => {
  console.log(`Server running on port ${3000}`);
});