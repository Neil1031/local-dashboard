// Deliberately small Markdown subset: all source text is text nodes, never HTML.
export function renderMarkdown(document, container, text) {
  container.replaceChildren();
  const element = (tag, value) => { const node = document.createElement(tag); if (value != null) node.textContent = value; return node; };
  const lines = text.split(/\r?\n/);
  if (lines.length > 4000) {
    container.append(element('p', '大型本文以完整純文字顯示；未截斷。'), element('pre', text)); return;
  }
  function inline(node, value) {
    const parts = value.split(/(`[^`\n]+`)/g);
    if (parts.length > 1024) { node.textContent = value; return; }
    for (const part of parts) node.append(part.startsWith('`') && part.endsWith('`') && part.length > 2
      ? element('code', part.slice(1, -1)) : document.createTextNode(part));
  }
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index++; continue; }
    if (/^\s*(```|~~~)/.test(line)) {
      const fence = line.trim().slice(0, 3), body = []; index++;
      while (index < lines.length && !lines[index].trim().startsWith(fence)) body.push(lines[index++]);
      if (index < lines.length) index++;
      const pre = element('pre'); pre.append(element('code', body.join('\n'))); container.append(pre); continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) { const node = element(`h${heading[1].length}`); inline(node, heading[2]); container.append(node); index++; continue; }
    const list = line.match(/^\s*(?:([-*+])\s+|(\d+)\.\s+)(.*)$/);
    if (list) {
      const node = element(list[1] ? 'ul' : 'ol');
      if (list[2]) node.start = Number(list[2]);
      while (index < lines.length) {
        const next = lines[index].match(/^\s*(?:([-*+])\s+|(\d+)\.\s+)(.*)$/);
        if (!next || Boolean(next[1]) !== Boolean(list[1])) break;
        const item = element('li'); inline(item, next[3]); node.append(item); index++;
      }
      container.append(node); continue;
    }
    const paragraph = [line]; index++;
    while (index < lines.length && lines[index].trim() && !/^(?:#{1,6}\s|\s*(?:```|~~~|[-*+]\s|\d+\.\s))/.test(lines[index])) paragraph.push(lines[index++]);
    const node = element('p'); inline(node, paragraph.join('\n')); container.append(node);
  }
}
