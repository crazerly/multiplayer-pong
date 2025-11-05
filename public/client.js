const socket = io();

const createBtn = document.getElementById('createBtn');
const joinBtn = document.getElementById('joinBtn');
const roomInput = document.getElementById('roomInput');
const shareLink = document.getElementById('shareLink');
const lobby = document.getElementById('lobby');
const gameScreen = document.getElementById('gameScreen');
const leaveBtn = document.getElementById('leaveBtn');
const scoreElem = document.getElementById('score');

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let index = null;
let roomId = null;
let latestState = null;

function showLobby() {
  lobby.classList.remove('hidden');
  gameScreen.classList.add('hidden');
}

function showGame() {
  lobby.classList.add('hidden');
  gameScreen.classList.remove('hidden');
}

createBtn.addEventListener('click', () => {
  socket.emit('createGame', (res) => {
    if (res.ok) {
      index = res.playerIndex;
      roomId = res.roomId;
      const url = location.origin + '?room=' + roomId;
      shareLink.textContent = `Share this link: ${url}`;
      showGame();
    }
  });
});

joinBtn.addEventListener('click', () => {
  let val = roomInput.value.trim();
  if (!val) return;
  try {
    const url = new URL(val);
    if (url.searchParams.get('room')) val = url.searchParams.get('room');
  } catch(e) { }
  socket.emit('joinGame', val, (res) => {
    if (!res.ok) {
      alert(res.error || 'Failed to join');
      return;
    }
    index = res.playerIndex;
    roomId = res.roomId;
    showGame();
  });
});

(function tryAutoJoin() {
  const params = new URLSearchParams(location.search);
  const room = params.get('room');
  if (room) {
    roomInput.value = room;
  }
})();

leaveBtn.addEventListener('click', () => {
  location.reload();
});

let mouseY = null;
let touchY = null;

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
  mouseY = y;
  sendPaddle(y);
});

canvas.addEventListener('touchmove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const touch = e.touches[0];
  const y = ((touch.clientY - rect.top) / rect.height) * canvas.height;
  touchY = y;
  sendPaddle(y);
  e.preventDefault();
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (index == null) return;
  if (e.key == 'ArrowUp' || e.key == 'w') {
    adjustPaddle(-20);
  }
  if (e.key == 'ArrowDown' || e.key == 's') {
    adjustPaddle(20);
  }
});

function adjustPaddle(delta) {
  if (!latestState) return;
  const newY = latestState.paddles[index] + delta;
  sendPaddle(newY + latestState.paddleHeight / 2);
}

function sendPaddle(y) {
  if (!roomId || index === null) return;
  socket.emit('paddleMove', y);
}

function render(state) {
  latestState = state;
  ctx.clearRect(0,0,canvas.width, canvas.height);

  if (canvas.width != state.width || canvas.height != state.height) {
    canvas.width = state.width;
    canvas.height = state.height;
  }

  // Net
  ctx.fillStyle = '#1f2937';
  for (let y=0; y < state.height; y += 20) {
    ctx.fillRect(state.width/2 - 2, y+5, 4, 12);
  }

  // Paddles
  ctx.fillStyle = '#eef2ff';
  ctx.fillRect(20, state.paddles[0], 10, state.paddleHeight);
  ctx.fillRect(state.width - 30, state.paddles[1], 10, state.paddleHeight);

  // Ball
  ctx.beginPath();
  ctx.arc(state.ball.x, state.ball.y, 7, 0, Math.PI*2);
  ctx.fill();

  // Score
  scoreElem.textContent = `${state.score[0]} : ${state.score[1]}`;
}

socket.on('gameState', (state) => {
  render(state);
});

socket.on('playerLeft', () => {
  alert('Opponent left. The game ended.');
  location.reload();
});

// Show game if user created a room and URL has ?room=
socket.on('connect', () => {
  const params = new URLSearchParams(location.search);
  const room = params.get('room');
  if (room && !roomId) {
    socket.emit('joinGame', room, (res) => {
      if (!res.ok) {
        console.log('auto join failed', res);
      } else {
        index = res.playerIndex;
        roomId = res.roomId;
        showGame();
      }
    });
  }
});