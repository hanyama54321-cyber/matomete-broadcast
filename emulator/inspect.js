// 使い方(start.js でエミュレーターを起動してから):
//   node emulator/inspect.js list                        3社の announcements の一覧
//   node emulator/inspect.js get <key> <id>              1件の全項目を型つきで表示
//   node emulator/inspect.js compare <key> <idA> <idB>   同じ社の2件を項目名・型で機械的に比べる(違えば終了コード1)
//   node emulator/inspect.js fnlog                       各社の onAnnouncementNotify の実行回数と、送信まで進んだ回数(emulator.log から)
//   node emulator/inspect.js tokens                      各社の架空の通知トークンの件数
// key は hiline / alogi / meiho
'use strict';

const fs = require('fs');
const path = require('path');
const { COMPANIES, workDir } = require('./config');
const { company, call, docsBase, typeOf, plain } = require('./rest');

async function getDoc(c, id) {
  return call('GET', `${docsBase(c)}/announcements/${encodeURIComponent(id)}`);
}

async function listDocs(c) {
  const res = await call('GET', `${docsBase(c)}/announcements?pageSize=300`);
  return (res && res.documents) || [];
}

function short(s, n = 28) {
  s = String(s == null ? '' : s).replace(/\s+/g, ' ');
  return s.length > n ? s.slice(0, n) + '…' : s;
}

async function cmdList() {
  for (const c of COMPANIES) {
    const docs = await listDocs(c);
    console.log(`\n■ ${c.label}(${c.projectId}) announcements ${docs.length} 件`);
    for (const d of docs) {
      const f = d.fields || {};
      const v = k => (f[k] ? plain(f[k]) : undefined);
      const id = d.name.split('/').pop();
      console.log(`  ${id}  author=${v('authorUid')}/${v('authorName')}  mustRead=${v('mustRead')}  notifiedAt=${f.notifiedAt ? 'あり' : 'なし'}  項目数=${Object.keys(f).length}  「${short(v('title'))}」`);
    }
  }
}

async function cmdGet(key, id) {
  const c = company(key);
  const d = await getDoc(c, id);
  const f = d.fields || {};
  for (const k of Object.keys(f).sort()) {
    console.log(`${k.padEnd(14)} ${typeOf(f[k]).padEnd(16)} ${JSON.stringify(plain(f[k]))}`);
  }
}

async function cmdCompare(key, idA, idB) {
  const c = company(key);
  const [a, b] = await Promise.all([getDoc(c, idA), getDoc(c, idB)]);
  const fa = a.fields || {};
  const fb = b.fields || {};
  const keys = [...new Set([...Object.keys(fa), ...Object.keys(fb)])].sort();
  let mismatch = 0;
  console.log(`${c.label}: A=${idA} / B=${idB}`);
  console.log(`${'項目'.padEnd(13)} ${'A の型'.padEnd(15)} ${'B の型'.padEnd(15)} 型   内容`);
  for (const k of keys) {
    const ta = fa[k] ? typeOf(fa[k]) : '(なし)';
    const tb = fb[k] ? typeOf(fb[k]) : '(なし)';
    const sameType = ta === tb;
    if (!sameType) mismatch += 1;
    let content = '';
    if (fa[k] && fb[k] && ta !== 'timestamp') {
      content = JSON.stringify(plain(fa[k])) === JSON.stringify(plain(fb[k])) ? '同じ' : `違う(A=${JSON.stringify(plain(fa[k]))} / B=${JSON.stringify(plain(fb[k]))})`;
    } else if (ta === 'timestamp' && tb === 'timestamp') {
      content = '(サーバー時刻)';
    }
    console.log(`${k.padEnd(14)} ${ta.padEnd(16)} ${tb.padEnd(16)} ${sameType ? 'OK ' : 'NG '}  ${content}`);
  }
  console.log(mismatch ? `\n結果: 項目名・型の違い ${mismatch} 件` : `\n結果: 項目名・型はすべて一致(${keys.length} 項目)`);
  process.exitCode = mismatch ? 1 : 0;
}

function cmdFnlog() {
  const work = workDir();
  for (const c of COMPANIES) {
    const file = path.join(work, c.key, 'emulator.log');
    const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const lines = text.split(/\r?\n/);
    const began = lines.filter(l => /Beginning execution of .*onAnnouncementNotify/.test(l)).length;
    const reached = lines.filter(l => l.includes('送信対象トークンなし(0件)') || l.includes('送信結果:')).length;
    const errors = lines.filter(l => /onAnnouncementNotify/.test(l) && /error|Error|失敗/.test(l)).length;
    console.log(`${c.label}: onAnnouncementNotify の実行 ${began} 回 / 送信まで進んだ回数 ${reached} 回 / エラーらしき行 ${errors}`);
  }
}

async function cmdTokens() {
  for (const c of COMPANIES) {
    let n = 0;
    for (const code of ['10001', '10002', '10003']) {
      const res = await call('GET', `${docsBase(c)}/users/${code}/tokens`);
      n += ((res && res.documents) || []).length;
    }
    console.log(`${c.label}: 架空の通知トークン ${n} 件`);
  }
}

(async () => {
  const [cmd, ...args] = process.argv.slice(2).filter(a => !a.startsWith('--'));
  if (cmd === 'list') await cmdList();
  else if (cmd === 'get') await cmdGet(args[0], args[1]);
  else if (cmd === 'compare') await cmdCompare(args[0], args[1], args[2]);
  else if (cmd === 'fnlog') cmdFnlog();
  else if (cmd === 'tokens') await cmdTokens();
  else {
    console.log('使い方: node emulator/inspect.js list | get <key> <id> | compare <key> <idA> <idB> | fnlog | tokens');
    process.exitCode = 1;
  }
})().catch(e => { console.error(e.message); process.exit(1); });
