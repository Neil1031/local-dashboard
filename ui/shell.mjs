import { message, t, setText, setAttributeText, codeText, isMessage } from './i18n.mjs';
export const primaryPages = Object.freeze({
  overview: [message("nav.overview"), message("page.overview.description")],
  projects: [message("nav.projects"), message("page.projects.description")],
  automations: [message("nav.automations"), message("page.automations.description")],
  us: [message("nav.usStocks"), message("shell.signals.sec.transactions.partial.slices")],
  tw: [message("nav.twStocks"), message("shell.taiwan.volume.watch.daily.observation")],
  performance: [message("nav.performance"), message("shell.insider.ai.report")],
  reports: [message("nav.reports"), message("shell.us.insider.all")],
  evidence: [message("nav.evidence"), message("shell.taiwan")],
  settings: [message("nav.settings"), message("shell.dashboard.metadata")]
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
    setText(document.getElementById('pageTitle'), primaryPages[page][0]);
    setText(document.getElementById('pageDescription'), primaryPages[page][1]);
    if (updateLocation) document.defaultView.history.replaceState(null, '', `#${page}`);
    onShow(page);
  }
  buttons.forEach(button => button.addEventListener('click', () => show(button.dataset.page)));
  document.defaultView.addEventListener('hashchange', () => show(document.defaultView.location.hash.slice(1), false));
  return { show, get current() { return current; }, start() { show(document.defaultView.location.hash.slice(1), false); } };
}
