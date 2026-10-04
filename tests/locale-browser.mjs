// Legacy behavior regressions use a fixed locale so wording is deterministic.
// Default zh-TW and both directions are exercised by i18n-browser.test.mjs.
export async function englishPage(owner, options) {
  const page = await owner.newPage(options);
  await page.addInitScript(() => { try { localStorage.setItem('local-dashboard.locale.v1', 'en'); } catch {} });
  return page;
}
