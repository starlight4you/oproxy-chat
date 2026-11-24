// Presentation-only acceptance: switch models without sending any messages.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const port = process.env.CDP_PORT || '9224';
const target = (await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json())).find(t => t.type === 'page' && t.url.startsWith('https://chat.oproxy.world'));
assert.ok(target, 'Open Oproxy Chat with remote debugging first');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message.result); pending.delete(message.id);
  }
});
const run = async expression => {
  const n = ++id, result = new Promise(r => pending.set(n, r));
  ws.send(JSON.stringify({ id: n, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }));
  const response = await result;
  if (response.exceptionDetails) throw Error(response.exceptionDetails.exception?.description);
  return response.result.value;
};
const pause = ms => new Promise(r => setTimeout(r, ms));
async function until(expression) {
  for (let i = 0; i < 40; i++) { if (await run(expression)) return; await pause(100); }
  throw Error(`UI did not settle: ${expression}`);
}
const state = () => run(`({
  path:location.pathname,
  model:document.querySelector('[data-testid=model-selector-button]')?.textContent,
  header:document.querySelector('[data-testid=model-selector-button] svg')?.dataset.oproxyProvider,
  hero:[...document.querySelectorAll('svg.lucide-bot')].find(e=>e.classList.contains('h-2/3'))?.dataset.oproxyProvider,
  history:[...document.querySelectorAll('[data-testid=convo-icon] svg[data-oproxy-provider]')].map(e=>e.dataset.oproxyProvider),
  draft:document.querySelector('#prompt-textarea')?.value,
  streaming:!!document.querySelector('[data-testid=stop-generation-button]')
})`);
const act = expression => run(`(()=>{
  if(location.pathname!=='/c/new'||document.querySelector('#prompt-textarea')?.value||document.querySelector('[data-testid=stop-generation-button]'))throw Error('User is using the chat; stop presentation checks');
  ${expression}
})();void 0;`);
const evidence = [];
try {
  const initial = await state();
  assert.equal(initial.path, '/c/new', 'Only test an empty new chat; preserve user conversations');
  assert.equal(initial.draft, ''); assert.equal(initial.streaming, false);
  for (const [endpoint, model, provider] of [
    ['Oproxy Anthropic', 'claude-sonnet-4.6', 'claude'],
    ['Oproxy', 'deepseek-v4-pro', 'deepseek'],
    ['Oproxy OpenAI', 'gpt-6.1-sol', 'openai'],
  ]) {
    await act(`const b=document.querySelector('[data-testid=model-selector-button]');if(b.getAttribute('aria-expanded')!=='true')b.click();`);
    const endpointMatch = `[...document.querySelectorAll('[role=option]')].find(e=>e.textContent.startsWith(${JSON.stringify(endpoint + '设置')}))`;
    await until(`!!(${endpointMatch})`);
    await act(`${endpointMatch}.click();`);
    const modelMatch = `[...document.querySelectorAll('[role=option]')].find(e=>e.textContent.replace(/已选中/g,'')===${JSON.stringify(model)})`;
    await until(`!!(${modelMatch})`);
    await act(`${modelMatch}.click();`);
    await until(`document.querySelector('[data-testid=model-selector-button]').textContent===${JSON.stringify(model)}`);
    await act(`const b=document.querySelector('[data-testid=model-selector-button]');if(b.getAttribute('aria-expanded')==='true')b.click();`);
    await pause(1200);
    const current = await state();
    assert.equal(current.path, '/c/new', 'Stop if the user starts a conversation');
    assert.equal(current.model, model); assert.equal(current.header, provider); assert.equal(current.hero, provider);
    assert.deepEqual(current.history, initial.history, 'Switching models must not alter historical icons');
    assert.equal(current.draft, ''); assert.equal(current.streaming, false);
    evidence.push({ provider, ...current });
  }
  await fs.writeFile('docs/validation/0.8.13/installed-switching.json', JSON.stringify({ ok: true, version: '0.8.13', cases: evidence, modelMessagesSent: 0 }, null, 2));
  console.log(JSON.stringify({ ok: true, providers: evidence.map(e => e.provider), current: evidence.at(-1).model, modelMessagesSent: 0 }));
} finally { ws.close(); }
