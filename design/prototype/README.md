# Local Dashboard static prototype

Open `index.html` directly in a browser. All entries and metrics are **SAMPLE / PROTOTYPE DATA**. The prototype makes no API or database requests and does not modify the production `index.html` or `dashboard.mjs`.

The eight primary pages and their subpages are navigable. US Signals supports source filtering, search and card/table views; rows and report records open details. Performance horizon tabs change the selected detail state. Use Tab/Enter/Space for controls, arrow keys for subpage tabs, and Escape to close a detail panel. Mobile navigation scrolls horizontally at 375px and 320px; wide tables scroll within their own container.

To run the optional focused check, use a modern Node.js and Playwright with Microsoft Edge available:

```powershell
$env:NODE_PATH = '<directory containing playwright>'
node --test design/prototype/check.mjs
```

The check verifies all pages and subpages at 1280/375/320 px, viewport overflow, sample labeling, filtering, card/table view, detail panel, keyboard tab switching and no non-file requests. It refreshes the committed screenshots in `screenshots/`.

Capability and data contract explanations are in `docs/DASHBOARD-DESIGN-SPACE.md` and `docs/DASHBOARD-DATA-CONTRACTS.md`.
