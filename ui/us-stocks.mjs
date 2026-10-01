import { mountUsSignals } from './us-signals.mjs';
import { mountUsSecTransactions } from './us-sec-transactions.mjs';

// Two fixed subpages. Ticker Detail stays visibly DESIGNED.
export function mountUsStocks(document, fetcher) {
  const pages = { signals: mountUsSignals(document, fetcher), sec: mountUsSecTransactions(document, fetcher) };
  const buttons = [...document.querySelectorAll('[data-us-page]')];
  let current = 'signals', active = false;
  function select(page) {
    if (!Object.hasOwn(pages, page)) return;
    current = page;
    for (const [key, controller] of Object.entries(pages)) {
      controller.hide(); document.getElementById(key === 'signals' ? 'signalsPanel' : 'secPanel').hidden = key !== page;
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
