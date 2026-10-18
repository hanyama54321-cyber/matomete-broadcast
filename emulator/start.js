// 使い方: node emulator/start.js [--work <作業フォルダ>]   (先に prepare.js を実行しておく)
//
// 3社のエミュレーター(auth・firestore・functions)を同時に起動し、各社アプリの写しを
// http://localhost:8766/<key>/index.html で配る(key は hiline / alogi / meiho)。
// ログは画面と <work>/<key>/emulator.log に出す。止めるときは Ctrl+C。
// ※ 各社の projectId のまま起動するが、エミュレーターで動かすのは auth・firestore・functions だけで、
//   Storage は写しの側でダミーのポートへ向けている。通知トークンを入れたまま必読を送ると、functions が
//   本物の FCM に送ろうとするため、必読の送信を試すときはトークンを入れない(seed.js 参照)。
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { COMPANIES, APPS_PORT, workDir } = require('./config');

const work = workDir();
const firebaseBin = path.join(work, 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js');
if (!fs.existsSync(firebaseBin)) {
  console.error(`${firebaseBin} がありません。先に node emulator/prepare.js を実行してください`);
  process.exit(1);
}

const children = [];
let ready = 0;

for (const c of COMPANIES) {
  const dir = path.join(work, c.key);
  const log = fs.createWriteStream(path.join(dir, 'emulator.log'), { flags: 'w' });
  const child = spawn(process.execPath, [firebaseBin, 'emulators:start', '--only', 'auth,firestore,functions', '--project', c.projectId], {
    cwd: dir,
    env: { ...process.env, FORCE_COLOR: '0', CI: '1' },
  });
  children.push(child);
  const onData = buf => {
    for (const line of buf.toString().split(/\r?\n/)) {
      if (!line.trim()) continue;
      log.write(line + '\n');
      process.stdout.write(`[${c.label}] ${line}\n`);
      if (line.includes('All emulators ready')) {
        ready += 1;
        if (ready === COMPANIES.length) {
          console.log(`\n=== 3社のエミュレーターが起動しました。各社アプリの写し: http://localhost:${APPS_PORT}/<hiline|alogi|meiho>/index.html ===\n`);
        }
      }
    }
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  child.on('exit', code => {
    process.stdout.write(`[${c.label}] エミュレーターが終了しました(code ${code})\n`);
  });
}

// 各社アプリの写しを配る簡易サーバー(このPCの中だけ)
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const appsRoot = path.join(work, 'apps');
http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.normalize(path.join(appsRoot, pathname));
  if (!file.startsWith(appsRoot + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}).listen(APPS_PORT, '127.0.0.1');

function shutdown() {
  for (const ch of children) {
    if (ch.exitCode === null) ch.kill('SIGINT');
  }
  setTimeout(() => process.exit(0), 8000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
