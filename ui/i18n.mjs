import zhTW from './locale-zh-TW.mjs';
import en from './locale-en.mjs';

export const STORAGE_KEY = 'local-dashboard.locale.v1';
export const locales = Object.freeze({ 'zh-TW': zhTW, en });
let locale = 'zh-TW', storage, currentDocument, storageFailed = false;
const listeners = new Set(), bindings = new WeakMap();
const valid = value => Object.hasOwn(locales, value);
const resolve = value => isMessage(value) ? t(value.key, value.params) : Array.isArray(value) ? value.map(resolve).join(' · ') : String(value ?? '');
export const isMessage = value => value !== null && typeof value === 'object' && value.i18nMessage === true;

export function getLocale() { return locale; }
export function t(key, params = {}) {
  const lookup = resource => Object.hasOwn(resource, key) && typeof resource[key] === 'string' ? resource[key] : undefined;
  const template = lookup(locales[locale]) ?? lookup(zhTW) ?? String(key);
  return template.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (token, name) =>
    Object.hasOwn(params, name) ? resolve(params[name]).slice(0, 65536) : token);
}
// A presentation descriptor retains the key and held values, never a loader.
// Text bindings update existing nodes, preserving focus, details and handlers.
export function message(key, params = {}) {
  return Object.freeze({ i18nMessage: true, key, params: Object.freeze({ ...params }), toString() { return t(key, this.params); } });
}
export function codeText(code) {
  if (typeof code !== 'string') return code;
  const key = ['state.', 'reason.', 'coverage.', 'diagnostics.'].map(prefix => prefix + code).find(key => Object.hasOwn(zhTW, key));
  if (!key) return code;
  return zhTW[key].includes(code) && en[key].includes(code) ? message(key) : message('common.codeLabel', { label: message(key), code });
}
export function setText(node, value, format = resolve) {
  node.removeAttribute('data-i18n');
  const held = bindings.get(node) ?? {};
  node.textContent = format(typeof value === 'function' ? value() : value);
  if (isMessage(value) || typeof value === 'function') {
    const native = Boolean(node.ownerDocument);
    if (native && !node.firstChild) node.append(node.ownerDocument.createTextNode(''));
    bindings.set(node, { ...held, value, format, native, anchor: node.firstChild });
    node.setAttribute('data-i18n-dynamic', '');
  } else { bindings.set(node, { attrs: held.attrs }); node.removeAttribute('data-i18n-dynamic'); }
}
export function setAttributeText(node, attribute, value) {
  if (!['aria-label', 'title', 'placeholder'].includes(attribute)) throw new Error('UNSAFE_TRANSLATION_ATTRIBUTE');
  if (isMessage(value)) {
    node.setAttribute('data-i18n-' + attribute, value.key);
    const attrs = bindings.get(node)?.attrs ?? {};
    bindings.set(node, { ...(bindings.get(node) ?? {}), attrs: { ...attrs, [attribute]: value } });
  } else {
    node.removeAttribute('data-i18n-' + attribute);
    const held = bindings.get(node) ?? {}, attrs = { ...held.attrs }; delete attrs[attribute];
    bindings.set(node, { ...held, attrs });
  }
  node.setAttribute(attribute, resolve(value));
}
export function applyTranslations(document = currentDocument) {
  if (!document) return;
  document.documentElement.lang = locale;
  for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
  for (const attribute of ['aria-label', 'title', 'placeholder']) {
    for (const node of document.querySelectorAll('[data-i18n-' + attribute + ']')) {
      const held = bindings.get(node)?.attrs?.[attribute];
      node.setAttribute(attribute, held ? resolve(held) : t(node.getAttribute('data-i18n-' + attribute)));
    }
  }
  for (const node of document.querySelectorAll('[data-i18n-dynamic]')) {
    const held = bindings.get(node); if (!held?.value) continue;
    // Update only the originally owned text node. Subsequent timestamps,
    // details and controls are preserved. A cleared binding cannot revive.
    if (held.native && held.anchor?.parentNode !== node) {
      bindings.set(node, { attrs: held.attrs }); node.removeAttribute('data-i18n-dynamic'); continue;
    }
    const text = held.format(typeof held.value === 'function' ? held.value() : held.value);
    if (held.native) held.anchor.textContent = text; else node.textContent = text;
  }
  const selector = document.getElementById('languagePreference'); if (selector) selector.value = locale;
}
export function subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
export function setLocale(value) {
  let next = !storageFailed && valid(value) ? value : 'zh-TW';
  try { storage?.setItem(STORAGE_KEY, next); } catch { storageFailed = true; next = 'zh-TW'; }
  const changed = locale !== next; locale = next; applyTranslations();
  if (changed) for (const listener of listeners) listener(locale);
  return locale;
}
export function initializeI18n(document, storageProvider = () => document.defaultView.localStorage) {
  currentDocument = document; storage = undefined; locale = 'zh-TW'; storageFailed = false;
  try { storage = storageProvider(); const saved = storage?.getItem(STORAGE_KEY); if (valid(saved)) locale = saved; }
  catch { storage = undefined; storageFailed = true; }
  applyTranslations(document);
  const selector = document.getElementById('languagePreference');
  if (selector) selector.addEventListener('change', () => setLocale(selector.value));
}
