const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const roomRestartState = {}; 

io.on('connection', (socket) => {
    
    // 通常の対戦入室
    socket.on('join_game', (roomId) => {
        const room = io.sockets.adapter.rooms.get(roomId);
        const userCount = room ? room.size : 0;

        if (userCount < 2) {
            socket.join(roomId);
            socket.emit('join_success', roomId, 'multi');
            if (userCount + 1 === 2) {
                io.to(roomId).emit('game_start');
            }
        } else {
            socket.emit('join_full');
        }
    });

    // ▼▼▼ 修正：1人練習モード入室 ▼▼▼
    socket.on('join_practice', () => {
        // IDをユーザーが入力しにくい特殊なものに変更
        // これにより、ユーザーが "practice" という部屋を作っても競合しなくなります
        const roomId = `__solo_${socket.id}`; 
        socket.join(roomId);
        
        socket.emit('join_success', roomId, 'solo');
        socket.emit('game_start');
    });
    // ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

    socket.on('update_board', (data) => {
        socket.broadcast.to(data.roomId).emit('opponent_board', data);
    });

    socket.on('attack', (data) => {
        socket.broadcast.to(data.roomId).emit('receive_attack', data.lines);
    });

    socket.on('player_gameover', (roomId) => {
        socket.broadcast.to(roomId).emit('opponent_won');
    });

    // リトライ要求
    socket.on('restart_request', (roomId) => {
        // ▼▼▼ 修正：特殊な接頭辞の時だけ即リトライ ▼▼▼
        if (roomId.startsWith('__solo_')) {
            io.to(roomId).emit('game_start');
            return;
        }
        // ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

        if (!roomRestartState[roomId]) {
            roomRestartState[roomId] = new Set();
        }
        
        roomRestartState[roomId].add(socket.id);

        const room = io.sockets.adapter.rooms.get(roomId);
        const currentMemberCount = room ? room.size : 0;

        if (currentMemberCount < 2) {
            socket.emit('reset_waiting');
            roomRestartState[roomId].clear();
            return;
        }

        if (roomRestartState[roomId].size >= currentMemberCount) {
            io.to(roomId).emit('game_start');
            roomRestartState[roomId].clear(); 
        }
    });

    socket.on('disconnect', () => {});
});

server.listen(3000, () => {
    console.log('サーバー起動: http://localhost:3000');
});