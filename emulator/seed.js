// 使い方: node emulator/seed.js [--tokens | --clear-tokens]   (start.js でエミュレーターを起動してから)
//   (引数なし)       3社のエミュレーターを空にして、検証用のアカウント(config.js の TEST_USERS)と users を作り直す
//   --tokens         乗務員 10001〜10003 に架空の通知トークンを入れる(確認画面の「概算人数」を見るため)
//   --clear-tokens   架空の通知トークンを消す
// 注意: トークンが入ったまま必読のお知らせを作ると、functions(onAnnouncementNotify)が本物の FCM へ
//       送ろうとする。概算人数を確かめたら、必読の送信を試す前に必ず --clear-tokens を実行すること。
'use strict';

const { COMPANIES, TEST_USERS, AUTH_EMAIL_DOMAIN, AUTH_PW_SUFFIX } = require('./config');
const { call, docsBase, toFields } = require('./rest');

const TOKEN_CODES = ['10001', '10002', '10003'];

async function reset(c) {
  await call('DELETE', `http://127.0.0.1:${c.ports.auth}/emulator/v1/projects/${c.projectId}/accounts`);
  await call('DELETE', `http://127.0.0.1:${c.ports.firestore}/emulator/v1/projects/${c.projectId}/databases/(default)/documents`);
  for (const u of TEST_USERS) {
    await call('POST', `http://127.0.0.1:${c.ports.auth}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator-only`, {
      email: u.code.toLowerCase() + AUTH_EMAIL_DOMAIN,
      password: u.password + AUTH_PW_SUFFIX,
    });
    if (u.user) {
      await call('PATCH', `${docsBase(c)}/users/${u.code}`, { fields: toFields(u.user) });
    }
  }
  console.log(`${c.label}: アカウント ${TEST_USERS.length} 件・users ${TEST_USERS.filter(u => u.user).length} 件を作成`);
}

async function setTokens(c, on) {
  for (const code of TOKEN_CODES) {
    const tokenId = `emu-${code}`;
    const url = `${docsBase(c)}/users/${code}/tokens/${tokenId}`;
    if (on) {
      await call('PATCH', url, { fields: toFields({ token: `emulator-fake-token-${c.key}-${code}`, createdAt: new Date() }) });
    } else {
      try { await call('DELETE', url); } catch (e) { if (e.status !== 404) throw e; }
    }
  }
  console.log(`${c.label}: 架空の通知トークンを${on ? '入れました(10001〜10003。10003 は必読通知OFF)' : '消しました'}`);
}

(async () => {
  const mode = process.argv.includes('--tokens') ? 'tokens' : process.argv.includes('--clear-tokens') ? 'clear' : 'reset';
  for (const c of COMPANIES) {
    if (mode === 'reset') await reset(c);
    else await setTokens(c, mode === 'tokens');
  }
  if (mode === 'tokens') {
    console.log('\n※ 必読のお知らせを作る前に、必ず node emulator/seed.js --clear-tokens を実行してください(本物の FCM へ送ろうとするため)');
  }
})().catch(e => { console.error(e.message); process.exit(1); });
