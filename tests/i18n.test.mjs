import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { locales, STORAGE_KEY, getLocale, setLocale, t, message, codeText, initializeI18n, setText, setAttributeText } from '../ui/i18n.mjs';

test('locale keys and named placeholders match exactly', () => {
  assert.deepEqual(Object.keys(locales.en).sort(), Object.keys(locales['zh-TW']).sort());
  const placeholders = text => [...text.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map(m => m[1]).sort();
  for (const key of Object.keys(locales.en)) assert.deepEqual(placeholders(locales.en[key]), placeholders(locales['zh-TW'][key]), key);
  for (const [key, value] of Object.entries(locales.en)) if (key !== 'settings.language.zhTW') assert.doesNotMatch(value, /[\u4e00-\u9fff]/, key);
});
test('all literal translation and HTML attribute references exist in both locales', async () => {
  const files = ['dashboard.mjs', 'index.html', ...(await readdir(new URL('../ui/', import.meta.url))).filter(n => n.endsWith('.mjs') && !n.startsWith('locale-')).map(n => 'ui/' + n)];
  for (const file of files) {
    const text = await readFile(new URL('../' + file, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /\bmessage\(\s*(?:undefined\b|null\b|['"]['"])/, `${file}: invalid explicit key`);
    const keys = [...text.matchAll(/\b(?:t|message)\(\s*['"]([^'"]+)['"]/g), ...text.matchAll(/data-i18n(?:-(?:placeholder|aria-label|title))?="([^"]+)"/g)];
    for (const [, key] of keys) for (const locale of Object.values(locales)) assert.equal(Object.hasOwn(locale, key), true, `${file}: ${key}`);
  }
});
test('structured TW report field labels have explicit bilingual coverage', async () => {
  const source = await readFile(new URL('../ui/tw-reports.mjs', import.meta.url), 'utf8');
  const shapes = source.slice(source.indexOf('const publicInfo ='), source.indexOf('const labels ='));
  const fields = new Set([...shapes.matchAll(/['"]([A-Za-z][A-Za-z0-9_]*)['"]|\b([A-Za-z][A-Za-z0-9_]*)\s*:/g)].map(m => m[1] ?? m[2]));
  const labels = source.slice(source.indexOf('const labels ='), source.indexOf('const label ='));
  for (const key of fields) {
    if (['DAILY', 'WEEKLY'].includes(key) || new RegExp('\\b' + key + '\\s*:').test(labels)) continue;
    for (const locale of Object.values(locales)) assert.equal(Object.hasOwn(locale, 'twFacts.' + key), true, key);
  }
});
function fixture(saved, { getThrows = false, setThrows = false } = {}) {
  const nodes = [], values = new Map([[STORAGE_KEY, saved]]), listeners = new Map();
  const node = () => { const attrs = new Map(); const n = { textContent: '', attrs, setAttribute(k,v) { attrs.set(k,String(v)); }, removeAttribute(k) { attrs.delete(k); }, getAttribute(k) { return attrs.get(k); } }; nodes.push(n); return n; };
  const storage = { getItem(k) { if (getThrows) throw Error('denied'); return values.get(k); }, setItem(k,v) { if (setThrows) throw Error('denied'); values.set(k,v); } };
  const selector = { value: '', addEventListener(k, f) { listeners.set(k,f); } };
  const doc = { documentElement: {}, defaultView: { localStorage: storage }, getElementById() { return selector; }, querySelectorAll(query) { const attr = query.slice(1,-1); return nodes.filter(n => n.attrs.has(attr)); } };
  return { doc, node, values, selector, listeners };
}
test('default, persistence, invalid preference, storage get/set errors and document lang', () => {
  for (const saved of [undefined, null, '', 'invalid', '{broken']) {
    const f = fixture(saved); initializeI18n(f.doc); assert.equal(getLocale(), 'zh-TW'); assert.equal(f.doc.documentElement.lang, 'zh-TW');
  }
  const f = fixture('en'); initializeI18n(f.doc); assert.equal(getLocale(), 'en');
  setLocale('zh-TW'); assert.equal(f.values.get(STORAGE_KEY), 'zh-TW'); assert.equal(f.doc.documentElement.lang, 'zh-TW');
  setLocale('en'); assert.equal(f.doc.documentElement.lang, 'en'); assert.equal(f.selector.value, 'en');
  for (const options of [{ getThrows: true }, { setThrows: true }]) {
    const f = fixture('en', options); initializeI18n(f.doc);
    if (options.getThrows) { assert.equal(getLocale(), 'zh-TW'); setLocale('en'); assert.equal(getLocale(), 'zh-TW'); }
    if (options.setThrows) { setLocale('en'); assert.equal(getLocale(), 'zh-TW'); }
  }
});
test('fallback keys, inherited properties, unknown codes and safe bounded interpolation', () => {
  initializeI18n(fixture().doc);
  for (const key of ['future.key', 'toString', 'constructor', '__proto__']) assert.equal(t(key), key);
  assert.equal(codeText('FUTURE_SOURCE_CODE'), 'FUTURE_SOURCE_CODE');
  assert.match(String(codeText('PARTIAL')), /PARTIAL/);
  const value = '<img onerror=alert(1)> {count}';
  assert.equal(t('common.codeLabel', { label: value, code: 'RAW' }), `${value}（RAW）`);
});
test('text and attribute bindings remain independent; raw source collisions are never translated', () => {
  const f = fixture(); initializeI18n(f.doc); const n = f.node();
  setAttributeText(n, 'title', message('common.codeLabel', { label: 'source', code: 'ID' }));
  setText(n, message('nav.overview')); setLocale('en');
  assert.equal(n.textContent, locales.en['nav.overview']); assert.equal(n.getAttribute('title'), 'source (ID)');
  setText(n, 'Loading'); setLocale('zh-TW'); assert.equal(n.textContent, 'Loading'); assert.equal(n.getAttribute('title'), 'source（ID）');
  setText(n, message('nav.overview')); setAttributeText(n, 'title', 'Overview {count} <b>RAW</b>'); setLocale('en');
  assert.equal(n.getAttribute('title'), 'Overview {count} <b>RAW</b>');
  for (const source of ['Overview', 'PARTIAL', 'Loading', locales.en['common.loading'], '{count}', '<b>RAW</b>']) {
    setText(n, source); setLocale('zh-TW'); setLocale('en'); assert.equal(n.textContent, source);
  }
  assert.throws(() => setAttributeText(n, 'onclick', message('nav.overview')));
});
