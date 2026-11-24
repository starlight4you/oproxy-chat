import { app, BrowserWindow } from 'electron';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

app.whenReady().then(async () => {
  let win;
  try {
    const source = await fs.readFile(new URL('../src/document-ui.js', import.meta.url), 'utf8');
    win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`
      <form><textarea id="prompt-textarea"></textarea><button data-testid="send-button">send</button>
        <button id="mcp" aria-haspopup="menu"><span>Oproxy Local MCP</span></button>
        <button id="picker" aria-haspopup="menu"><span>MCP 服务器</span></button>
        <button id="english" aria-haspopup="menu"><span>MCP Servers</span></button>
        <button id="tools" aria-haspopup="menu"><span>工具</span></button>
        <button id="attachment">附件</button>
      </form>
      <div role="menu"><div id="server" role="menuitemcheckbox" name="mcp-servers" aria-label="Oproxy Local MCP, Disconnected"><span>Oproxy Local MCP</span><p>Local Streamable HTTP MCP server</p></div></div>`));
    await win.webContents.executeJavaScript(`window.__oproxyWorkflowModes={};window.__oproxyWorkflowModeOrder=[];${source}`);
    const state = await win.webContents.executeJavaScript(`({mcp:document.querySelector('#mcp').hasAttribute('data-oproxy-hidden-local-mcp-chip'),tools:document.querySelector('#tools').hasAttribute('data-oproxy-hidden-local-mcp-chip'),display:getComputedStyle(document.querySelector('#mcp')).display,toolsDisplay:getComputedStyle(document.querySelector('#tools')).display})`);
    assert.deepEqual(state, { mcp: true, tools: false, display: 'none', toolsDisplay: 'inline-block' });
    assert.deepEqual(await win.webContents.executeJavaScript(`['picker','english','server'].map(id=>getComputedStyle(document.getElementById(id)).display)`), ['none','none','none']);
    assert.notEqual(await win.webContents.executeJavaScript(`getComputedStyle(document.getElementById('attachment')).display`), 'none');
    // React mounts the picker after navigation and can reuse it for other tools.
    await win.webContents.executeJavaScript(`document.querySelector('#picker').remove();const button=document.createElement('button');button.id='dynamic';button.setAttribute('aria-haspopup','menu');button.innerHTML='<span>MCP 服务器</span>';document.querySelector('form').append(button)`);
    await new Promise(resolve => setTimeout(resolve, 180));
    assert.equal(await win.webContents.executeJavaScript(`getComputedStyle(document.querySelector('#dynamic')).display`), 'none');
    await win.webContents.executeJavaScript(`document.querySelector('#dynamic span').textContent='工具'`);
    await new Promise(resolve => setTimeout(resolve, 180));
    assert.notEqual(await win.webContents.executeJavaScript(`getComputedStyle(document.querySelector('#dynamic')).display`), 'none');
    console.log('PASS: MCP chip, picker and local server menu item hidden, including dynamic mounts; tools and attachments remain visible');
    win.destroy(); app.exit(0);
  } catch (error) {
    console.error(error); win?.destroy(); app.exit(1);
  }
});
