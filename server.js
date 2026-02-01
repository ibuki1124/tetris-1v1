const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 'public' フォルダの中身をブラウザに公開する設定
app.use(express.static('public'));

// クライアント（ブラウザ）が接続してきた時の処理
io.on('connection', (socket) => {
    console.log('ユーザーが接続しました ID:', socket.id);

    // 切断した時の処理
    socket.on('disconnect', () => {
        console.log('ユーザーが切断しました ID:', socket.id);
    });
});

// サーバーをポート3000で起動
server.listen(3000, () => {
    console.log('サーバーが起動しました: http://localhost:3000');
});