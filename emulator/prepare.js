// 使い方: node emulator/prepare.js --repos <3社のリポジトリを並べたフォルダ> [--work <作業フォルダ>]
//
// 3社のリポジトリ(matomete-app / matomete-alogi / matomete-meiho)は読むだけで、何も書き込まない。
// 作業フォルダ(既定: %LOCALAPPDATA%\matomete-broadcast-emu)に次を作る。
//   <work>/<key>/        firestore.rules・firestore.indexes.json・storage.rules・functions の写しと、社ごとにポートを分けた firebase.json
//   <work>/apps/<key>/   各社アプリの写し。index.html にだけ「エミュレーターへ接続する」数行を足す
//   <work>/node_modules  firebase-tools(各社リポジトリと同じ版)
// Google ドライブの中に node_modules を作らないよう、作業フォルダはリポジトリの外に置く。
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { FIREBASE_TOOLS_VERSION, COMPANIES, workDir, argValue } = require('./config');

const reposDir = argValue('--repos');
if (!reposDir) {
  console.error('--repos <3社のリポジトリを並べたフォルダ> を指定してください');
  process.exit(1);
}
const work = workDir();

function run(cmd, cwd) {
  console.log(`> [${path.basename(cwd)}] ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit' });
}

function copyDir(src, dst, skipNames) {
  fs.mkdirSync(dst, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    if (skipNames.includes(ent.name)) continue;
    const s = path.join(src, ent.name);
    const d = path.join(dst, ent.name);
    if (ent.isDirectory()) copyDir(s, d, skipNames);
    else fs.copyFileSync(s, d);
  }
}

function readIf(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch (e) { return null; }
}

function firebaseJson(c) {
  const p = c.ports;
  return {
    firestore: { rules: 'firestore.rules', indexes: 'firestore.indexes.json' },
    storage: { rules: 'storage.rules' },
    functions: [{ source: 'functions', codebase: 'default', runtime: 'nodejs22' }],
    emulators: {
      singleProjectMode: true,
      auth: { host: '127.0.0.1', port: p.auth },
      firestore: { host: '127.0.0.1', port: p.firestore, websocketPort: p.websocket },
      functions: { host: '127.0.0.1', port: p.functions },
      // 手順書の登録(0.5.0)の確認用。storage.rules は Firestore の users を参照する(同じエミュレーターの Firestore を見る)
      storage: { host: '127.0.0.1', port: p.storage },
      eventarc: { host: '127.0.0.1', port: p.eventarc },
      tasks: { host: '127.0.0.1', port: p.tasks },
      hub: { host: '127.0.0.1', port: p.hub },
      logging: { host: '127.0.0.1', port: p.logging },
      ui: { enabled: false },
    },
  };
}

// 各社アプリの写しを、エミュレーターにだけ接続するように書き換える(本番の Firebase には触れない)
function patchAppIndex(html, c) {
  const anchor = "const fbFunctions = firebase.app().functions('asia-northeast1');";
  const count = html.split(anchor).length - 1;
  if (count !== 1) throw new Error(`${c.repo}/index.html に接続の目印が ${count} 箇所あります(1箇所のはず)`);
  const p = c.ports;
  const inject = [
    anchor,
    '// [matomete-broadcast 検証用の写し] エミュレーターにだけ接続する(Storage も含む)',
    `fbAuth.useEmulator('http://127.0.0.1:${p.auth}', { disableWarnings: true });`,
    `fbDb.useEmulator('127.0.0.1', ${p.firestore});`,
    `fbFunctions.useEmulator('127.0.0.1', ${p.functions});`,
    `fbStorage.useEmulator('127.0.0.1', ${p.storage});`,
  ].join('\n');
  return html.replace(anchor, inject);
}

fs.mkdirSync(work, { recursive: true });
console.log(`作業フォルダ: ${work}`);

if (!fs.existsSync(path.join(work, 'node_modules', 'firebase-tools', 'package.json'))) {
  fs.writeFileSync(path.join(work, 'package.json'), JSON.stringify({ name: 'matomete-broadcast-emu', private: true }, null, 2));
  run(`npm install --no-audit --no-fund firebase-tools@${FIREBASE_TOOLS_VERSION}`, work);
}

for (const c of COMPANIES) {
  const repo = path.join(reposDir, c.repo);
  if (!['firestore.rules', 'storage.rules', 'index.html'].every(f => fs.existsSync(path.join(repo, f)))) {
    console.error(`${repo} に firestore.rules / storage.rules / index.html がありません`);
    process.exit(1);
  }
  const dir = path.join(work, c.key);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(path.join(repo, 'firestore.rules'), path.join(dir, 'firestore.rules'));
  fs.copyFileSync(path.join(repo, 'storage.rules'), path.join(dir, 'storage.rules'));
  fs.copyFileSync(path.join(repo, 'firestore.indexes.json'), path.join(dir, 'firestore.indexes.json'));
  fs.writeFileSync(path.join(dir, 'firebase.json'), JSON.stringify(firebaseJson(c), null, 2));
  fs.writeFileSync(path.join(dir, '.firebaserc'), JSON.stringify({ projects: { default: c.projectId } }, null, 2));

  // functions は node_modules を除いて写す。依存関係が変わったときだけ入れ直す
  const fnDst = path.join(dir, 'functions');
  const oldLock = readIf(path.join(fnDst, 'package-lock.json'));
  for (const ent of fs.existsSync(fnDst) ? fs.readdirSync(fnDst) : []) {
    if (ent !== 'node_modules') fs.rmSync(path.join(fnDst, ent), { recursive: true, force: true });
  }
  copyDir(path.join(repo, 'functions'), fnDst, ['node_modules']);
  const newLock = readIf(path.join(fnDst, 'package-lock.json'));
  if (!fs.existsSync(path.join(fnDst, 'node_modules')) || oldLock !== newLock) {
    run('npm ci --no-audit --no-fund', fnDst);
  }

  // 各社アプリの写し
  const appDst = path.join(work, 'apps', c.key);
  fs.rmSync(appDst, { recursive: true, force: true });
  fs.mkdirSync(appDst, { recursive: true });
  for (const f of fs.readdirSync(repo)) {
    if (/^(firebase-messaging-sw\.js|manifest\.json|icon.*\.(png|svg))$/.test(f)) {
      fs.copyFileSync(path.join(repo, f), path.join(appDst, f));
    }
  }
  const html = fs.readFileSync(path.join(repo, 'index.html'), 'utf8');
  fs.writeFileSync(path.join(appDst, 'index.html'), patchAppIndex(html, c));
  const head = execSync('git rev-parse --short HEAD', { cwd: repo }).toString().trim();
  console.log(`${c.label}: ${c.repo}@${head} の写しを用意しました`);
}
console.log('完了。次は node emulator/start.js で3社のエミュレーターを起動します。');
