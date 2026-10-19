// 周知 一括投稿ツールを、このPCの中だけで開くための簡易サーバー(依存パッケージなし)。
// - ツール本体 index.html だけを / で返す(README や .git などほかのファイルは返さない)。
//   0.1.0 までの /broadcast.html は、? 以降(?emulator=1 など)を保ったまま / へ移す
// - 127.0.0.1 と ::1 にだけ待ち受けるため、ほかのPCからは接続できない
// - Host ヘッダーが localhost / 127.0.0.1 / [::1] 以外の要求は断る(DNS リバインディング対策)
// 使い方: node serve.js [--open]   (--open を付けると既定のブラウザで開く)
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 8765;
const FILE = path.join(__dirname, 'index.html');
const URL_TO_OPEN = `http://localhost:${PORT}/`;
const ALLOWED_HOSTS = [`localhost:${PORT}`, `127.0.0.1:${PORT}`, `[::1]:${PORT}`];

function handler(req, res) {
  const host = String(req.headers.host || '').toLowerCase();
  if (!ALLOWED_HOSTS.includes(host)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, HEAD' });
    res.end('Method Not Allowed');
    return;
  }
  const url = new URL(req.url, `http://${host}`);
  if (url.pathname === '/broadcast.html' || url.pathname === '/index.html') {
    res.writeHead(302, { Location: '/' + url.search });
    res.end();
    return;
  }
  if (url.pathname !== '/') {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
    return;
  }
  fs.readFile(FILE, (err, buf) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('index.html を読めませんでした');
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    });
    res.end(req.method === 'HEAD' ? undefined : buf);
  });
}

function openBrowser() {
  if (process.platform !== 'win32') return;
  spawn('cmd', ['/c', 'start', '', URL_TO_OPEN], { detached: true, stdio: 'ignore' }).unref();
}

let listening = 0;
function onListening() {
  listening += 1;
  if (listening > 1) return;
  console.log('周知 一括投稿ツールを起動しました。');
  console.log(`  ${URL_TO_OPEN}`);
  console.log('終了するときは、この画面を閉じるか Ctrl+C を押してください。');
  if (process.argv.includes('--open')) openBrowser();
}

// IPv4(127.0.0.1)は必須。IPv6(::1)は使えるPCでだけ待ち受ける(localhost が ::1 になるPCのため)
const v4 = http.createServer(handler);
v4.on('error', e => {
  if (e.code === 'EADDRINUSE') {
    console.error(`ポート ${PORT} はすでに使われています。ツールがもう起動していないか確かめてください(起動済みなら ${URL_TO_OPEN} を開くだけで使えます)。`);
  } else {
    console.error('起動できませんでした:', e.message);
  }
  process.exit(1);
});
v4.listen(PORT, '127.0.0.1', onListening);

const v6 = http.createServer(handler);
v6.on('error', () => { /* IPv6 が無効なPCでは何もしない */ });
v6.listen(PORT, '::1', onListening);
