// Model identity takes precedence over an OpenAI-compatible endpoint's name.
// Kept self-contained because the desktop injects this function into the page.
export function providerForModel(model = '', endpoint = '') {
  const identify = value => {
    const name = typeof value === 'string' ? value.toLowerCase() : '';
    if (/(?:^|[^a-z])deepseek/.test(name)) return 'deepseek';
    if (/(?:^|[^a-z])(?:glm|zhipu)/.test(name)) return 'zhipu';
    if (/(?:^|[^a-z])(?:kimi|moonshot)/.test(name)) return 'kimi';
    if (/(?:^|[^a-z])minimax/.test(name)) return 'minimax';
    if (/(?:^|[^a-z])(?:claude|anthropic)/.test(name)) return 'claude';
    if (/(?:^|[^a-z])(?:gemini|google)/.test(name)) return 'gemini';
    if (/(?:^|[^a-z])(?:qwen|qwq|qvq|alibaba)/.test(name)) return 'qwen';
    if (/(?:^|[^a-z])(?:grok|xai|x-ai)/.test(name)) return 'grok';
    if (/(?:^|[^a-z])(?:mistral|mixtral|codestral|ministral)/.test(name)) return 'mistral';
    if (/(?:^|[^a-z])(?:gpt|chatgpt|openai|codex|dall-e|o[134](?:\b|[-_]))/.test(name)) return 'openai';
    return '';
  };
  return identify(model) || identify(endpoint);
}
