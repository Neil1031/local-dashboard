import { mountUsSignals } from './us-signals.mjs';
import { mountUsSecTransactions } from './us-sec-transactions.mjs';
import { mountUsTickerDetail } from './us-ticker-detail.mjs';

// Ticker carries only a filter/navigation key; never source IDs or event linkage.
export function mountUsStocks(document, fetcher) {
  const ticker = mountUsTickerDetail(document, fetcher);
  const navigateTicker = value => { if (ticker.setTicker(value)) { select('ticker'); document.getElementById('tickerInput').focus(); } };
  const pages = { signals: mountUsSignals(document, fetcher, navigateTicker), sec: mountUsSecTransactions(document, fetcher, navigateTicker), ticker };
  const buttons = [...document.querySelectorAll('[data-us-page]')];
  let current = 'signals', active = false;
  function select(page) {
    if (!Object.hasOwn(pages, page)) return;
    current = page;
    for (const [key, controller] of Object.entries(pages)) {
      controller.hide(); document.getElementById({ signals: 'signalsPanel', sec: 'secPanel', ticker: 'tickerPanel' }[key]).hidden = key !== page;
    }
    for (const button of buttons) {
      const selected = button.dataset.usPage === page;
      button.classList.toggle('active', selected);
      if (selected) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    }
    if (active) pages[page].show();
  }
  buttons.forEach(button => button.addEventListener('click', () => select(button.dataset.usPage)));
  return { show() { active = true; select(current); }, hide() { active = false; Object.values(pages).forEach(page => page.hide()); } };
}
