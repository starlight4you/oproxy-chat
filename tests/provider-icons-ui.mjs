import { app, BrowserWindow } from 'electron';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { providerForModel } from '../src/provider-icons.js';

app.whenReady().then(async () => {
  let win;
  try {
    const directory = new URL('../src/assets/providers/', import.meta.url);
    const assets = Object.fromEntries(await Promise.all((await fs.readdir(directory)).filter(file => file.endsWith('.svg')).map(async file => [file.slice(0, -4), await fs.readFile(new URL(file, directory), 'utf8')])));
    const source = await fs.readFile(new URL('../src/provider-icons-ui.js', import.meta.url), 'utf8');
    const bot = '<svg class="lucide lucide-bot" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"><path d="M12 8V4H8"/><rect x="4" y="8" width="16" height="12"/></svg>';
    win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    await win.loadURL('data:text/html,' + encodeURIComponent(`<style>body{color:#171717}body.dark{color:#fff}</style><button data-testid="model-selector-button">${bot}<span>gpt-6.1-sol</span></button><main><div id="hero">${bot}</div><div id="history">${bot}</div><div id="message">${bot}</div><div id="unknown">${bot}</div><div id="endpoint" role="option">${bot}Oproxy Anthropic</div><img id="custom" src="data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"/>')}"></main>`));
    const run = script => win.webContents.executeJavaScript(script);
    await run(`
      window.props = {hero:{conversation:{model:'gpt-6.1-sol',endpoint:'Oproxy OpenAI'}},history:{conversation:{model:'deepseek-r1',endpoint:'Oproxy OpenAI'}},message:{message:{model:'claude-sonnet-4',endpoint:'Oproxy'}},unknown:{endpoint:'Other'},endpoint:{endpoint:'Oproxy Anthropic'}};
      for(const [id,p] of Object.entries(props)) document.querySelector('#'+id+' svg').__reactFiber$fixture={memoizedProps:{},return:{memoizedProps:p,return:null}};
      window.__oproxyProviderForModel=${providerForModel.toString()};window.__oproxyProviderIconAssets=${JSON.stringify(assets)};void 0;`);
    await run(source);
    const providers = () => run(`Object.fromEntries([...document.querySelectorAll('main>div')].map(e=>[e.id,e.querySelector('svg').dataset.oproxyProvider||'']))`);
    assert.deepEqual(await providers(), { hero: 'openai', history: 'deepseek', message: 'claude', unknown: '', endpoint: 'claude' });
    assert.equal(await run(`document.querySelector('[data-testid=model-selector-button]').textContent`), 'gpt-6.1-sol', 'Icon titles must not contaminate model identity');
    assert.equal(await run(`getComputedStyle(document.querySelector('#hero svg>path')).display`), 'none');
    assert.equal(await run(`document.querySelector('#hero svg>rect').isConnected`), true, 'Preserve React-owned artwork');
    assert.equal(await run(`document.querySelector('#custom').hasAttribute('data-oproxy-provider')`), false);
    await run(`props.hero.conversation.model='claude-opus-4';document.querySelector('[data-testid=model-selector-button] span').textContent='claude-opus-4';void 0;`);
    await new Promise(r => setTimeout(r, 150));
    assert.equal((await providers()).hero, 'claude');
    assert.equal((await providers()).history, 'deepseek', 'Historical chats must retain their own provider');
    assert.equal(await run(`document.querySelector('[data-testid=model-selector-button] svg').dataset.oproxyProvider`), 'claude');
    assert.equal(await run(`getComputedStyle(document.querySelector('#hero [data-oproxy-provider-art] path')).fill`), 'rgb(217, 119, 87)');
    // React may leave a DOM node pointing at the old half of a fiber pair.
    await run(`{
      const element=document.querySelector('#hero svg'), current={memoizedProps:props.hero,return:null}, old={memoizedProps:{conversation:{model:'gpt-4',endpoint:'Oproxy OpenAI'}},return:null};
      current.stateNode={current};old.stateNode=current.stateNode;
      const leaf={memoizedProps:{},return:old,alternate:{memoizedProps:{},return:current}};
      element.__reactFiber$fixture=leaf;
      props.hero.conversation.model='deepseek-v3';window.__oproxyProviderIcons.refresh();
    }`);
    assert.equal((await providers()).hero, 'deepseek');
    await run(`props.hero.conversation.model='gpt-6.1-sol';document.body.className='dark';window.__oproxyProviderIcons.refresh();void 0;`);
    assert.equal(await run(`getComputedStyle(document.querySelector('#hero [data-oproxy-provider-art] path')).fill`), 'rgb(255, 255, 255)', 'OpenAI mark follows dark theme');
    await run(`{
      const root={stateNode:{}},rootAlt={stateNode:null};root.stateNode.current=root;rootAlt.stateNode=root.stateNode;
      root.alternate=rootAlt;rootAlt.alternate=root;
      const oldParent={memoizedProps:{conversation:{model:'gpt-4',endpoint:'Oproxy OpenAI'}},return:root};
      const newParent={memoizedProps:{conversation:{model:'claude-sonnet-4',endpoint:'Oproxy Anthropic'}},return:root};
      oldParent.alternate=newParent;newParent.alternate=oldParent;root.child=newParent;rootAlt.child=oldParent;
      const oldLeaf={memoizedProps:{},return:oldParent},newLeaf={memoizedProps:{},return:newParent};
      oldLeaf.alternate=newLeaf;newLeaf.alternate=oldLeaf;oldParent.child=oldLeaf;newParent.child=newLeaf;
      document.querySelector('#message svg').__reactFiber$fixture=oldLeaf;window.__oproxyProviderIcons.refresh();
    }`);
    assert.equal((await providers()).message, 'claude', 'Shared React return links must not revert to a stale model');
    await run(`props.hero.conversation={model:'custom-model',endpoint:'Other'};window.__oproxyProviderIcons.refresh();void 0;`);
    assert.equal((await providers()).hero, '');
    assert.notEqual(await run(`getComputedStyle(document.querySelector('#hero svg>path')).display`), 'none', 'Unknown models recover the fallback');
    for (let i=0;i<3;i++) await run(source);
    assert.equal(await run(`document.querySelectorAll('#history [data-oproxy-provider-art]').length`), 1);
    await run(`window.__oproxyProviderIcons.dispose();void 0;`);
    assert.equal(await run(`document.querySelectorAll('[data-oproxy-provider], [data-oproxy-provider-art]').length`), 0);
    console.log('PASS: provider icons, dynamic switching, historical models, scoped identities, themes and cleanup');
    win.destroy(); app.exit(0);
  } catch (error) { console.error(error); win?.destroy(); app.exit(1); }
});
