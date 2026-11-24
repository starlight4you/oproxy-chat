import { app, BrowserWindow } from 'electron';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

app.whenReady().then(async () => {
  let win;
  try {
    const source = await fs.readFile(new URL('../src/endpoint-selector-ui.js', import.meta.url), 'utf8');
    win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    await win.loadURL('data:text/html,' + encodeURIComponent(`
      <div role="listbox">
        <div id="endpoint-Oproxy OpenAI-menu" role="option"><span class="truncate text-left">Oproxy OpenAI</span><button id="endpoint-Oproxy OpenAI-settings" aria-label="设置 API 密钥 Oproxy OpenAI">设置 API 密钥</button><span>›</span></div>
        <div id="endpoint-Oproxy Anthropic-menu" role="option"><span class="truncate text-left">Oproxy Anthropic</span><button id="endpoint-Oproxy Anthropic-settings" aria-label="设置 API 密钥 Oproxy Anthropic">设置 API 密钥</button><span>›</span></div>
        <div id="endpoint-Oproxy-menu" role="option"><span class="truncate text-left">Oproxy</span><button id="endpoint-Oproxy-settings" aria-label="设置 API 密钥 Oproxy">设置 API 密钥</button><span>›</span></div>
        <div id="endpoint-Oproxy Images-menu" role="option"><span class="truncate text-left">Oproxy Images</span><button id="endpoint-Oproxy Images-settings" aria-label="设置 API 密钥 Oproxy Images">设置 API 密钥</button><span>›</span></div>
      </div>
      <button data-testid="model-selector-button"><span class="flex-grow truncate text-left">gpt-6-luna-thinking</span></button>
      <div id="model-dialog" role="dialog"><input placeholder="Search Oproxy OpenAI models..."><div role="listbox">
        <div role="option"><span class="truncate">gpt-6-luna</span></div>
        <div role="option"><span class="truncate">gpt-6-luna-thinking</span></div>
        <div role="option"><span class="truncate">gpt-6.1-sol</span></div>
        <div role="option"><span class="truncate">gpt-6-astra</span></div>
        <div role="option"><span class="truncate">gpt-5.6-sol</span></div>
      </div></div>`));
    win.webContents.on('console-message', event => console.error('renderer:', event.message));
    const run = script => win.webContents.executeJavaScript(script);
    await run(source);
    const rows = await run(`Object.fromEntries([...document.querySelectorAll('[role=listbox] > [role=option]')].filter(e=>e.id.startsWith('endpoint-')&&!e.id.includes('DeepSeek')).map(e=>{const label=e.querySelector('span.truncate.text-left');return [e.id,{text:e.innerText,hidden:getComputedStyle(e.querySelector('button')).display==='none',label:e.dataset.oproxyEndpointLabel,after:getComputedStyle(label,'::after').content}]}))`);
    assert.deepEqual(rows, {
      'endpoint-Oproxy OpenAI-menu': { text: 'Oproxy OpenAIâ€º', hidden: true, label: 'ChatGPT', after: '"ChatGPT"' },
      'endpoint-Oproxy Anthropic-menu': { text: 'Oproxy Anthropicâ€º', hidden: true, label: 'Claude', after: '"Claude"' },
      'endpoint-Oproxy-menu': { text: 'Oproxyâ€º', hidden: true, label: '其他模型', after: '"其他模型"' },
      'endpoint-Oproxy Images-menu': { text: 'Oproxy Imagesâ€º', hidden: true, label: '图像生成', after: '"图像生成"' },
    });
    await run(`window.__oproxyEndpointSelectorUI.refresh();void 0;`);
    assert.equal(await run(`document.querySelector('#endpoint-Oproxy-DeepSeek-menu')?.dataset.oproxyEndpointLabel`), 'DeepSeek');
    await run(`document.getElementById('endpoint-Oproxy OpenAI-menu').setAttribute('aria-expanded','true');window.__oproxyEndpointSelectorUI.refresh();void 0;`);
    assert.deepEqual(await run(`Object.fromEntries([...document.querySelectorAll('#model-dialog [role=option]')].map(e=>[e.innerText,{hidden:getComputedStyle(e).display==='none',display:e.querySelector('span').dataset.oproxyModelDisplay||''}]))`), {
      'gpt-6-luna': { hidden: false, display: '6 Luna' },
      'gpt-6-luna-thinking': { hidden: true, display: '' },
      'gpt-6.1-sol': { hidden: false, display: '6.1 Sol' },
      'gpt-6-astra': { hidden: false, display: '6 Astra' },
      'gpt-5.6-sol': { hidden: true, display: '' },
    });
    assert.equal(await run(`document.querySelector('[data-testid=model-selector-button] span').getAttribute('data-oproxy-model-display')`), '6 Luna');
    await run(`document.querySelector('#model-dialog [role=listbox]').insertAdjacentHTML('beforeend',
      '<div role="option"><span class="truncate">deepseek-v4-flash</span></div><div role="option"><span class="truncate">deepseek-v4-pro</span></div><div role="option"><span class="truncate">deepseek-v4-flash-thinking</span></div><div role="option"><span class="truncate">gemini-4-argon-high</span></div><div role="option"><span class="truncate">gemini-4-argon</span></div><div role="option"><span class="truncate">qwen3.8-max</span></div>');
      window.__oproxySelectedVirtualEndpoint='Oproxy DeepSeek';window.__oproxyEndpointSelectorUI.refresh();void 0;`);
    assert.deepEqual(await run(`Object.fromEntries([...document.querySelectorAll('#model-dialog [role=option]')].filter(e=>getComputedStyle(e).display!=='none').map(e=>[e.innerText,e.dataset.oproxyModelDisplay||'']))`), {
      'deepseek-v4-flash': 'V4 Flash', 'deepseek-v4-pro': 'V4 Pro',
    });
    await run(`window.__oproxySelectedVirtualEndpoint='Oproxy';window.__oproxyEndpointSelectorUI.refresh();void 0;`);
    assert.deepEqual(await run(`Object.fromEntries([...document.querySelectorAll('#model-dialog [role=option]')].filter(e=>getComputedStyle(e).display!=='none').map(e=>[e.innerText,e.dataset.oproxyModelDisplay||'']))`), {
      'gemini-4-argon': 'Gemini 4 Argon', 'qwen3.8-max': 'Qwen3.8 Max',
    });
    await run(`document.querySelector('#model-dialog [role=listbox]').insertAdjacentHTML('beforeend', '<div role="option"><span class="truncate">claude-sonnet-5-5</span></div><div role="option"><span class="truncate">claude-opus-5-5</span></div><div role="option"><span class="truncate">claude-opus-5.5</span></div><div role="option"><span class="truncate">claude-sonnet-4.6</span></div>');window.__oproxySelectedVirtualEndpoint='Oproxy Anthropic';window.__oproxyEndpointSelectorUI.refresh();void 0;`);
    assert.deepEqual(await run(`Object.fromEntries([...document.querySelectorAll('#model-dialog [role=option]')].filter(e=>getComputedStyle(e).display!=='none').map(e=>[e.innerText,e.dataset.oproxyModelDisplay||'']))`), {
      'claude-sonnet-5-5': 'Sonnet 5.5', 'claude-opus-5-5': 'Opus 5.5',
    });
    await run(`window.__oproxyEndpointSelectorUI.dispose();void 0;`);
    await run(source);
    await run(`document.querySelector('#endpoint-Oproxy-DeepSeek-menu').click();void 0;`);
    assert.equal(await run(`window.__oproxyEndpointSelectorUI.state().activeVirtualEndpoint`), 'Oproxy DeepSeek');
    await run(`document.querySelector('[role=option]').remove();document.querySelector('[role=listbox]').insertAdjacentHTML('afterbegin','<div id="endpoint-Oproxy OpenAI-menu" role="option"><span class="truncate text-left">Oproxy OpenAI</span><button aria-label="设置 API 密钥 Oproxy OpenAI">设置 API 密钥</button></div>');void 0;`);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(await run(`document.querySelector('[role=option]').dataset.oproxyEndpointLabel`), 'ChatGPT');
    await run(`window.__oproxyEndpointSelectorUI.dispose();void 0;`);
    assert.equal(await run(`document.querySelector('[role=option]').dataset.oproxyEndpointLabel`), 'ChatGPT', 'Dispose does not change rendered content');
    assert.equal(await run(`document.querySelector('style#oproxy-endpoint-selector-style')`), null);
    console.log('PASS: endpoint labels and hidden API key settings');
    win.destroy(); app.exit(0);
  } catch (error) {
    console.error(error); win?.destroy(); app.exit(1);
  }
});
