// エミュレーターの REST API を呼ぶための小さな道具(seed.js・inspect.js で共用)。
// Authorization: Bearer owner はエミュレーター専用の「ルールを通さない」読み書き。本番では使えない
'use strict';

const { COMPANIES } = require('./config');

function company(key) {
  const c = COMPANIES.find(x => x.key === key);
  if (!c) throw new Error(`会社のキーが違います: ${key}(hiline / alogi / meiho)`);
  return c;
}

async function call(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { /* JSON でない応答 */ }
  if (!res.ok) {
    const err = new Error(`${method} ${url} → ${res.status} ${text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

const docsBase = c => `http://127.0.0.1:${c.ports.firestore}/v1/projects/${c.projectId}/databases/(default)/documents`;

// JS の値 → Firestore REST の型付きの値
function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  return { mapValue: { fields: toFields(v) } };
}
function toFields(obj) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, toValue(v)]));
}

// Firestore REST の型付きの値 → 型名(配列は中身の型も含める)
function typeOf(v) {
  const t = Object.keys(v)[0];
  if (t === 'arrayValue') {
    const inner = [...new Set(((v.arrayValue && v.arrayValue.values) || []).map(typeOf))];
    return `array<${inner.join('|') || '(空)'}>`;
  }
  if (t === 'mapValue') return 'map';
  return t.replace(/Value$/, '');
}
// Firestore REST の型付きの値 → JS の値(比較・表示用)
function plain(v) {
  const t = Object.keys(v)[0];
  if (t === 'arrayValue') return ((v.arrayValue && v.arrayValue.values) || []).map(plain);
  if (t === 'mapValue') return Object.fromEntries(Object.entries((v.mapValue && v.mapValue.fields) || {}).map(([k, x]) => [k, plain(x)]));
  if (t === 'nullValue') return null;
  if (t === 'integerValue') return Number(v.integerValue);
  return v[t];
}

module.exports = { company, call, docsBase, toFields, typeOf, plain };
