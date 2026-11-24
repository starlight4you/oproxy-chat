// Parse only the app's explicit document envelope. Never treat arbitrary JSON
// examples or text/code fences as executable document requests.
export function parseDocumentEnvelope(input, bare = false) {
  if (typeof input !== 'string' || input.length > 2100000) return null;
  let text = input.trim();
  if (!bare) {
    const marker = /```oproxy(?:_document|-document)\s*/i.exec(text);
    if (!marker) return null;
    text = text.slice(marker.index + marker[0].length).trimStart();
  }
  if (!text.startsWith('{')) return null;
  let depth = 0, quoted = false, escaped = false, end = -1;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) { end = i + 1; break; }
  }
  if (end < 0) return null;
  try {
    const spec = JSON.parse(text.slice(0, end));
    if (!spec || !['docx','pdf','xlsx','pptx'].includes(spec.type) || typeof spec.title !== 'string') return null;
    // Repair only clearly double-escaped prose blocks, not paths, formulas,
    // worksheets, inline code examples or otherwise valid JSON escape data.
    for (const key of ['content','summary']) {
      const value = spec[key];
      if (typeof value !== 'string' || value.includes('\n') || (value.match(/\\n/g) || []).length < 2) continue;
      if (key === 'content' && !/(?:^|\\n)#{1,6}\s|\\n\\n|\\n[-*]\s/.test(value)) continue;
      spec[key] = value.split(/(```[\s\S]*?```|`[^`\n]+`)/g).map((part,i) => i % 2 ? part : part.replace(/\\r\\n|\\n/g, '\n')).join('');
    }
    return spec;
  } catch { return null; }
}

export function parseSkillEnvelope(input, bare = false) {
  if(typeof input!=='string'||input.length>2100000)return null;
  let text=input.trim();
  if(!bare){const marker=/```oproxy_skill\s*/i.exec(text);if(!marker)return null;text=text.slice(marker.index+marker[0].length).trimStart();}
  const match=/^\{\s*"type"\s*:\s*"(docx|pdf|xlsx|pptx)"\s*\}/.exec(text);
  return match?.[1]||null;
}
