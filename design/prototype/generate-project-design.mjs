// Derive the static sample with the same v1 parser as the production viewer.
// Usage: node design/prototype/generate-project-design.mjs [--check]
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseProjectDesign } from '../../ui/project-design.mjs';
const source = new URL('../../docs/PROJECT-DESIGN.md', import.meta.url);
const output = new URL('./project-design-sample.js', import.meta.url);
const markdown = (await readFile(source, 'utf8')).replace(/\r\n/g, '\n');
const digest = createHash('sha256').update(markdown).digest('hex');
const model = parseProjectDesign(markdown);
const generated = `// Generated from docs/PROJECT-DESIGN.md; do not edit. SHA-256: ${digest}\n` +
  `window.PROJECT_DESIGN_SAMPLE = Object.freeze(${JSON.stringify(model, null, 2)});\n`;
if (process.argv.includes('--check')) {
  const existing = (await readFile(output, 'utf8')).replace(/\r\n/g, '\n');
  if (existing !== generated) throw new Error('PROJECT-DESIGN: sample is stale; run the generator');
  console.log(`Project design sample matches docs/PROJECT-DESIGN.md (${model.features.length} features).`);
} else {
  await writeFile(output, generated, 'utf8');
  console.log(`Generated ${fileURLToPath(output)} from ${fileURLToPath(source)} (${model.features.length} features).`);
}
