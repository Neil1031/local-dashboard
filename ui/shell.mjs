export const primaryPages = Object.freeze({
  overview: ['Overview', '排程現況、接下來的工作與已觀察執行。'],
  projects: ['Projects', 'Local Dashboard 的工程設計建置快照。'],
  automations: ['Automations', '目前 Scheduler 快照與七天已觀察歷史。'],
  us: ['US Stocks', 'Signals 與 SEC Transactions · 唯讀 partial slices。'],
  tw: ['TW Stocks', 'Taiwan Volume Watch · 已保存 daily observation 唯讀契約。'],
  performance: ['Performance', 'Insider AI report · 已保存的研究觀察與報酬。'],
  reports: ['Reports', 'US Insider 唯讀報告 · All 只包含已接入來源。'],
  evidence: ['Data & Evidence', 'Taiwan · 來源狀態、保存身分與資料缺口的唯讀證據。'],
  settings: ['Settings', '只修改 Dashboard 顯示 metadata。']
});

export function mountShell(document, onShow) {
  const buttons = [...document.querySelectorAll('[data-page]')];
  const views = [...document.querySelectorAll('[data-page-view]')];
  let current;
  function show(page, updateLocation = true) {
    if (!Object.hasOwn(primaryPages, page)) page = 'overview';
    current = page;
    for (const button of buttons) {
      const active = button.dataset.page === page;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    for (const view of views) view.hidden = view.dataset.pageView !== page;
    document.getElementById('pageTitle').textContent = primaryPages[page][0];
    document.getElementById('pageDescription').textContent = primaryPages[page][1];
    if (updateLocation) document.defaultView.history.replaceState(null, '', `#${page}`);
    onShow(page);
  }
  buttons.forEach(button => button.addEventListener('click', () => show(button.dataset.page)));
  document.defaultView.addEventListener('hashchange', () => show(document.defaultView.location.hash.slice(1), false));
  return { show, get current() { return current; }, start() { show(document.defaultView.location.hash.slice(1), false); } };
}
