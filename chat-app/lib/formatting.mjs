import { createElement } from 'react';

// Render a small formatting subset as React nodes; never interpret HTML.
export function formatMessage(text = '') {
  const parts = text.split(/(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, key) => {
    if (part.startsWith('***') && part.endsWith('***') && part.length > 6)
      return createElement('strong', { key }, createElement('em', null, part.slice(3, -3)));
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4)
      return createElement('strong', { key }, part.slice(2, -2));
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2)
      return createElement('em', { key }, part.slice(1, -1));
    return part;
  });
}

export function applyFormat(text, start, end, marker) {
  const selected = text.slice(start, end) || 'text';
  const wrapped = start >= marker.length && text.slice(start - marker.length, start) === marker && text.slice(end, end + marker.length) === marker;
  if (wrapped) return { text: text.slice(0, start - marker.length) + selected + text.slice(end + marker.length), start: start - marker.length, end: end - marker.length };
  return { text: text.slice(0, start) + marker + selected + marker + text.slice(end), start: start + marker.length, end: start + marker.length + selected.length };
}
