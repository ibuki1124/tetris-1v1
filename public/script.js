const socket = io();

// --- 通信部分 (Phase 1) ---
function joinRoom() {
    const roomId = document.getElementById('room-input').value;
    if (roomId) socket.emit('join_game', roomId);
    else alert("部屋IDを入力してください");
}

socket.on('join_success', (roomId) => {
    document.getElementById('join-screen').style.display = 'none';
    document.getElementById('game-wrapper').style.display = 'block';
    document.getElementById('current-room').innerText = roomId;
    
    // ゲーム開始！
    initGame();
});

socket.on('join_full', () => { document.getElementById('error-msg').innerText = "満員です！"; });
socket.on('game_start', () => {
    document.getElementById('status').innerText = "BATTLE START!";
    document.getElementById('status').style.color = "#4ecca3";
    document.getElementById('status').style.fontWeight = "bold";
});

// --- ゲームエンジン (Ultra Tetris Pro ベース) ---

const COLS = 10, ROWS = 20, BLOCK = 30;
const COLORS = {
  I: '#00f0f0', O: '#f0f000', T: '#a000f0', S: '#00f000', Z: '#f00000', J: '#0000f0', L: '#f0a000', GHOST: 'rgba(255,255,255,0.1)'
};
const SHAPES = {
  I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
  O: [[1,1],[1,1]],
  T: [[0,1,0],[1,1,1],[0,0,0]],
  S: [[0,1,1],[1,1,0],[0,0,0]],
  Z: [[1,1,0],[0,1,1],[0,0,0]],
  J: [[1,0,0],[1,1,1],[0,0,0]],
  L: [[0,0,1],[1,1,1],[0,0,0]],
};

// Canvas要素の取得
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const holdCtx = document.getElementById('hold').getContext('2d');
const nextCtx = document.getElementById('next').getContext('2d');

let board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
let score = 0, lines = 0, level = 1, combo = -1, paused = false;
let lastTime = 0, dropCounter = 0;
let bag = [], nextQueue = [], holdType = null, canHold = true, current = null;
let requestId = null; // アニメーション停止用

// 初期化関数
function initGame() {
    // リセット
    board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    score = 0; lines = 0; level = 1; combo = -1;
    bag = []; nextQueue = []; holdType = null; canHold = true;
    
    spawn();
    updateUI();
    if(requestId) cancelAnimationFrame(requestId);
    update();
}

// --- ユーティリティ ---
const createPiece = (type) => ({
  type, 
  shape: SHAPES[type], 
  x: Math.floor(COLS/2) - Math.floor(SHAPES[type][0].length/2), 
  y: type === 'I' ? -1 : 0
});

const getNextPiece = () => {
  if (bag.length <= 7) {
    let newBag = Object.keys(SHAPES);
    for (let i = newBag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newBag[i], newBag[j]] = [newBag[j], newBag[i]];
    }
    bag.push(...newBag);
  }
  nextQueue.push(bag.shift());
  if (nextQueue.length < 5) return getNextPiece();
  return nextQueue.shift();
};

const rotate = (matrix, dir) => {
  const m = matrix.map(row => [...row]);
  for (let y = 0; y < m.length; ++y) {
    for (let x = 0; x < y; ++x) [m[x][y], m[y][x]] = [m[y][x], m[x][y]];
  }
  return dir > 0 ? m.map(row => row.reverse()) : m.reverse();
};

const collide = (shape, x, y) => shape.some((row, dy) => row.some((v, dx) => v && (x + dx < 0 || x + dx >= COLS || y + dy >= ROWS || (board[y + dy] && board[y + dy][x + dx]))));

// --- 回転システム（Wall Kick） ---
function attemptRotation(dir) {
  const oldShape = current.shape;
  const newShape = rotate(current.shape, dir);
  const pos = {x: current.x, y: current.y};
  
  const offsets = [0, 1, -1, -2, 2];
  for (let offset of offsets) {
    if (!collide(newShape, pos.x + offset, pos.y)) {
      current.x += offset;
      current.shape = newShape;
      return true;
    }
  }
  return false;
}

// --- ゲームロジック ---
function spawn() {
  current = createPiece(getNextPiece());
  canHold = true;
  // 出現した瞬間に衝突＝ゲームオーバー
  if (collide(current.shape, current.x, current.y)) {
    gameOver();
  }
}

function lock() {
  current.shape.forEach((row, dy) => row.forEach((v, dx) => {
    // 盤面の上端より上にあるかチェック（簡単なゲームオーバー判定）
    if(v && current.y + dy < 0) {
        return gameOver();
    }
    if (v && current.y + dy >= 0) {
        board[current.y + dy][current.x + dx] = current.type;
    }
  }));
  clearLines();
  spawn();
}

function clearLines() {
  let count = 0;
  board = board.filter(row => {
    const isFull = row.every(cell => cell !== null);
    if (isFull) count++;
    return !isFull;
  });
  
  if (count > 0) {
    combo++;
    lines += count;
    // スコア計算
    score += ([0, 100, 300, 500, 800][count] + (combo * 50)) * level;
    level = Math.floor(lines / 10) + 1;
    flashEffect();
  } else {
    combo = -1;
  }
  while (board.length < ROWS) board.unshift(Array(COLS).fill(null));
  updateUI();
}

function flashEffect() {
  canvas.style.backgroundColor = '#333';
  setTimeout(() => canvas.style.backgroundColor = '#000', 50);
}

function gameOver() {
  alert(`GAME OVER\nScore: ${score}`);
  initGame(); // リスタート
}

// --- 描画系 ---
function drawBlock(c, x, y, color, size = BLOCK, isGhost = false) {
  c.fillStyle = color;
  c.globalAlpha = isGhost ? 0.3 : 1;
  c.fillRect(x * size, y * size, size - 1, size - 1);
  c.globalAlpha = 1;
  if (!isGhost) {
    c.strokeStyle = 'rgba(255,255,255,0.1)';
    c.strokeRect(x * size, y * size, size - 1, size - 1);
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // 盤面の描画
  board.forEach((row, y) => row.forEach((type, x) => type && drawBlock(ctx, x, y, COLORS[type])));
  
  if (current) {
    // ゴースト（落下予想地点）
    let gy = current.y;
    while (!collide(current.shape, current.x, gy + 1)) gy++;
    current.shape.forEach((row, dy) => row.forEach((v, dx) => v && drawBlock(ctx, current.x + dx, gy + dy, COLORS[current.type], BLOCK, true)));

    // 現在のピース
    current.shape.forEach((row, dy) => row.forEach((v, dx) => v && drawBlock(ctx, current.x + dx, current.y + dy, COLORS[current.type])));
  }

  drawPreview(holdCtx, holdType);
  drawNextQueue();
}

function drawPreview(c, type) {
  c.clearRect(0, 0, 100, 100);
  if (!type) return;
  const shape = SHAPES[type];
  const s = 20;
  const ox = (100 - shape[0].length * s) / 2;
  const oy = (100 - shape.length * s) / 2;
  shape.forEach((row, y) => row.forEach((v, x) => v && drawBlock(c, x + (ox/s), y + (oy/s), COLORS[type], s)));
}

function drawNextQueue() {
  nextCtx.clearRect(0, 0, 100, 300);
  nextQueue.slice(0, 4).forEach((type, i) => {
    const shape = SHAPES[type];
    const s = 18;
    shape.forEach((row, y) => row.forEach((v, x) => v && drawBlock(nextCtx, x + 1, y + 1 + (i * 4), COLORS[type], s)));
  });
}

function updateUI() {
  document.getElementById('score').innerText = score.toLocaleString();
  document.getElementById('level').innerText = level;
  document.getElementById('lines').innerText = lines;
}

// --- 入力制御 (WASD & 矢印キー対応) ---
document.addEventListener('keydown', e => {
  if (document.getElementById('join-screen').style.display !== 'none') return; // 入室前は操作しない

  const key = e.key.toLowerCase();
  
  // 移動 (左: ArrowLeft / a, 右: ArrowRight / d)
  if ((key === 'arrowleft' || key === 'a') && !collide(current.shape, current.x - 1, current.y)) current.x--;
  if ((key === 'arrowright' || key === 'd') && !collide(current.shape, current.x + 1, current.y)) current.x++;
  
  // ソフトドロップ (下: ArrowDown / s)
// 下: ArrowDown / s
  if (key === 'arrowdown' || key === 's') { 
    if (!collide(current.shape, current.x, current.y + 1)) {
        // 下に移動できる場合
        current.y++;
        score += 1;
        updateUI();
        dropCounter = 0; // 自動落下のタイマーをリセット（二重に落ちるのを防ぐ）
    } else {
        // ★ここを追加：これ以上下がれない（床についた）場合は、即座に固定！
        lock();
        dropCounter = 0;
    }
  }

  // ハードドロップ (Space)
  if (key === ' ') { 
    let count = 0;
    while (!collide(current.shape, current.x, current.y + 1)) {
        current.y++;
        count++;
    }
    score += count * 2;
    lock();
  }
  
  // 回転 (上: ArrowUp / w) -> 右回転
  if (key === 'arrowup' || key === 'w') attemptRotation(1);
  
  // ホールド (Shift)
  if (key === 'shift') {
    if (canHold) {
      if (!holdType) {
        holdType = current.type;
        spawn();
      } else {
        [holdType, current] = [current.type, createPiece(holdType)];
        // ホールドから出した時、位置をリセット
        current.x = Math.floor(COLS/2) - Math.floor(SHAPES[current.type][0].length/2);
        current.y = current.type === 'I' ? -1 : 0;
      }
      canHold = false;
    }
  }
});

function update(time = 0) {
  if (!paused) {
    const dt = time - lastTime;
    lastTime = time;
    dropCounter += dt;
    const speed = Math.max(50, 1000 - (level - 1) * 100);
    
    if (dropCounter > speed) {
      if (!collide(current.shape, current.x, current.y + 1)) {
        current.y++;
      } else {
        lock();
      }
      dropCounter = 0;
    }
  }
  draw();
  requestId = requestAnimationFrame(update);
}