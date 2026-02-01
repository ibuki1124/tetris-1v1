// サーバーへ接続開始
const socket = io();

// 接続成功した時の処理
socket.on('connect', () => {
    console.log('サーバーに接続しました！ ID:', socket.id);
    
    // 画面の文字を書き換えて、接続できたことを表示
    const statusDiv = document.getElementById('status');
    statusDiv.innerText = 'サーバー接続成功！ ID: ' + socket.id;
    statusDiv.style.color = 'green';
});