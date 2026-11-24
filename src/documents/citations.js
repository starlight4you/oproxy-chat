// Search citations are UI transport tokens, not document text. Remove only
// their known envelopes; never globally decode user Unicode/backslash escapes.
const marker = code => `(?:\\u${code}|\\\\+u${code})`;
const open = marker('e200'), separator = marker('e202'), close = marker('e201');
const reference = 'turn\\d+(?:search|view|news|fetch|image)\\d+';
const envelope = new RegExp(`${open}cite(?:${separator}${reference})+(?:${close})?`, 'gi');
const fragment = new RegExp(`${separator}${reference}(?:${close})?`, 'gi');

export function cleanCitationText(input, { markdown = false } = {}) {
  let removed = 0;
  const clean = text => text.replace(envelope, () => { removed++; return ''; }).replace(fragment, () => { removed++; return ''; });
  // Code examples may deliberately describe these markers. Leave fenced and
  // inline code untouched while cleaning ordinary prose around them.
  let text = markdown ? input.split(/(`{3,}[^\n]*\n[\s\S]*?\n`{3,}[^\n]*|~{3,}[^\n]*\n[\s\S]*?\n~{3,}[^\n]*|`+[^`\n]+`+)/g)
    .map((part, index) => index % 2 ? part : clean(part)).join('') : clean(input);
  if (removed) text = text.replace(/^[ \t]+$/gm, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trimEnd();
  return { text, removed };
}

export function cleanDocumentCitations(input) {
  let removed = 0;
  const untouched = new Set(['type', 'filename', 'formula', 'formats', 'layout']);
  function visit(value, key = '') {
    if (untouched.has(key)) return value;
    if (typeof value === 'string') {
      const result = cleanCitationText(value, { markdown: key === 'content' || key === 'notes' || key === 'summary' });
      removed += result.removed; return result.text;
    }
    if (Array.isArray(value)) return value.map(item => visit(item, key));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, visit(item, name)]));
    return value;
  }
  return { spec: visit(input), removed };
}
