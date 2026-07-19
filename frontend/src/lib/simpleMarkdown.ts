/** Minimal safe markdown → React nodes (escape HTML, then light formatting). */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inlineFormat(escaped: string): string {
  return escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

export function renderSimpleMarkdownToHtml(source: string): string {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      html.push('</ul>');
      inList = false;
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      closeList();
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (heading?.[1] && heading[2]) {
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${inlineFormat(escapeHtml(heading[2]))}</h${level}>`);
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      if (!inList) {
        html.push('<ul>');
        inList = true;
      }
      html.push(`<li>${inlineFormat(escapeHtml(trimmed.replace(/^[-*]\s+/, '')))}</li>`);
      continue;
    }

    closeList();
    html.push(`<p>${inlineFormat(escapeHtml(trimmed))}</p>`);
  }

  closeList();
  return html.join('');
}
