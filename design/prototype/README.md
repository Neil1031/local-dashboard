# Local Dashboard static prototype

Open `index.html` directly in a browser. All entries and metrics are **SAMPLE / PROTOTYPE DATA**. The prototype makes no API or database requests and does not modify the production `index.html` or `dashboard.mjs`.

The nine primary pages and their subpages are navigable. Projects currently shows one Local Dashboard card and six detail views: Overview, Features, Architecture, Problems, Changes, Remaining. Feature cards expand with native keyboard controls. US Signals supports source filtering, search and card/table views; rows and report records open details. Performance horizon tabs change the selected detail state. Use Tab/Enter/Space for controls, arrow keys for subpage tabs, and Escape to close a detail panel. Mobile navigation scrolls horizontally at 375px and 320px; wide tables scroll within their own container.

The **only maintained source** for the Projects pilot is `docs/PROJECT-DESIGN.md` in this repository. `generate-project-design.mjs` reads its front matter and Feature Matrix, Design Changes, Issues, and Remaining Work tables, validates them, and emits `project-design-sample.js`. The browser uses the generated sample; counts are calculated from its feature rows. Do not edit the generated file. After editing the document, regenerate and check it:

```powershell
node design/prototype/generate-project-design.mjs
node design/prototype/generate-project-design.mjs --check
```

The pilot makes no runtime requests to another repository and is not a production Projects Viewer. A future Viewer should parse or export the same project-owned design contract, preserving source version and read errors. Other projects must create their own reviewed `docs/PROJECT-DESIGN.md` before onboarding.

To run the optional focused check, use a modern Node.js and Playwright with Microsoft Edge available:

```powershell
$env:NODE_PATH = '<directory containing playwright>'
node --test design/prototype/check.mjs
```

The check verifies all nine pages and subpages at 1280/375/320 px, Projects landing/detail and generated status counts, viewport overflow, sample labeling, filtering, card/table view, detail panel, keyboard tab switching and no non-file requests. It refreshes the committed screenshots in `screenshots/`.

Capability and data contract explanations are in `docs/DASHBOARD-DESIGN-SPACE.md` and `docs/DASHBOARD-DATA-CONTRACTS.md`.
