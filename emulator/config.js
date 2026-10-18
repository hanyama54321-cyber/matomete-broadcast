// エミュレーター検証の共通設定。本番の Firebase には一切触れない。
// ポート(auth / firestore / functions)は broadcast.html の COMPANIES[].emulatorPorts と一致させること
'use strict';

const os = require('os');
const path = require('path');

// 各社リポジトリの devDependencies(firebase-tools)と同じ版
const FIREBASE_TOOLS_VERSION = '15.23.0';

const COMPANIES = [
  {
    key: 'hiline', label: 'HI-LINE', repo: 'matomete-app', projectId: 'anzen-matomete-app',
    ports: { auth: 9101, firestore: 8101, functions: 5101, hub: 4401, logging: 4501, eventarc: 9301, tasks: 9401, websocket: 9151, storageDummy: 9199 },
  },
  {
    key: 'alogi', label: 'A-LOGI', repo: 'matomete-alogi', projectId: 'matomete-alogi',
    ports: { auth: 9102, firestore: 8102, functions: 5102, hub: 4402, logging: 4502, eventarc: 9302, tasks: 9402, websocket: 9152, storageDummy: 9199 },
  },
  {
    key: 'meiho', label: '名豊興運', repo: 'matomete-meiho', projectId: 'matomete-meiho',
    ports: { auth: 9103, firestore: 8103, functions: 5103, hub: 4403, logging: 4503, eventarc: 9303, tasks: 9403, websocket: 9153, storageDummy: 9199 },
  },
];

// 各社アプリの写し(エミュレーターに接続する版)を配る簡易サーバー
const APPS_PORT = 8766;

// ログイン方式(各社 index.html と同じ)
const AUTH_EMAIL_DOMAIN = '@matomete.local';
const AUTH_PW_SUFFIX = '_mtm';

// 検証用アカウント。エミュレーターの中にだけ作る(本番のアカウント・パスワードとは無関係)
const TEST_USERS = [
  // ツールで使える管理者(パスワードを初期値から変えた想定)
  { code: 'BBBBB', password: 'emu-pass-B', user: { name: '管理者B', role: 'admin', team: null, passwordChanged: true } },
  // 初期パスワード(=コード)のままの管理者 → ツールで止まる
  { code: 'CCCCC', password: 'CCCCC', user: { name: '管理者C', role: 'admin', team: null, passwordChanged: false } },
  // 外部に開示済みのコード → ツールで止まる
  { code: 'AAAAA', password: 'emu-pass-A', user: { name: '管理者A', role: 'admin', team: null, passwordChanged: true } },
  // 名前(name)のない管理者 → 投稿者名を入力しないと送れない
  { code: 'EEEEE', password: 'emu-pass-E', user: { role: 'admin', team: null, passwordChanged: true } },
  // Auth にだけあって users が無い → ツールで止まる
  { code: 'DDDDD', password: 'emu-pass-D', user: null },
  // 乗務員 → ツールで止まる。10003 は必読通知をOFFにしている(概算人数から外れる)
  { code: '10001', password: 'emu-pass-1', user: { name: 'テスト乗務員1', role: 'driver', team: null, passwordChanged: true } },
  { code: '10002', password: 'emu-pass-2', user: { name: 'テスト乗務員2', role: 'driver', team: null, passwordChanged: true } },
  { code: '10003', password: 'emu-pass-3', user: { name: 'テスト乗務員3', role: 'driver', team: null, passwordChanged: true, notifyPrefs: { mustReadAnnouncement: false } } },
];

function defaultWorkDir() {
  return path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'matomete-broadcast-emu');
}

function argValue(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function workDir() {
  return path.resolve(argValue('--work', process.env.MATOMETE_EMU_WORK || defaultWorkDir()));
}

module.exports = {
  FIREBASE_TOOLS_VERSION, COMPANIES, APPS_PORT, AUTH_EMAIL_DOMAIN, AUTH_PW_SUFFIX, TEST_USERS,
  workDir, argValue,
};
