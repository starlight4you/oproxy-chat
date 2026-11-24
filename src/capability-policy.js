(() => {
  if(window.__oproxyCapabilityPolicy)return;
  const definitions={search:{labels:['Search','搜索','网络搜索','网页搜索'],menu:/^(Web Search|网络搜索|网页搜索)$/},code:{labels:['Run Code','运行代码'],menu:/^(Run Code|运行代码)$/}};
  let configuring=null,replaying=false,submissionPending=false;
  const pause=ms=>new Promise(r=>setTimeout(r,ms));
  function chip(kind){return [...document.querySelectorAll('button[role="checkbox"]')].find(b=>definitions[kind].labels.includes(b.getAttribute('aria-label')))}
  function status(){return Object.fromEntries(Object.keys(definitions).map(k=>[k,chip(k)?.getAttribute('aria-checked')==='true']))}
  async function ensure(){
    if(configuring)return configuring;
    if(!document.querySelector('#tools-dropdown-button'))return status();
    configuring=(async()=>{
      document.documentElement.setAttribute('data-oproxy-configuring-tools','');
      try{
        for(const kind of ['search','code']){
          let button=chip(kind);if(button?.getAttribute('aria-checked')==='true')continue;
          if(button){button.click();await pause(400);continue;}
          const menu=document.querySelector('#tools-dropdown-menu');
          if(!menu || getComputedStyle(menu).display==='none')document.querySelector('#tools-dropdown-button')?.click();
          let item;const end=Date.now()+1200;
          while(Date.now()<end){item=[...document.querySelectorAll('#tools-dropdown-menu [role="menuitem"]')].find(e=>definitions[kind].menu.test(e.textContent.trim()));if(item)break;await pause(50)}
          if(item){item.click();await pause(400);}
        }
      }finally{document.querySelector('#tools-dropdown-menu > button')?.click();document.documentElement.removeAttribute('data-oproxy-configuring-tools');configuring=null;}
      return status();
    })();return configuring;
  }
  function intercept(event){
    if(replaying)return;
    const target=event.target instanceof Element?event.target:null;
    const sending=event.type==='click'?target?.closest('[data-testid="send-button"]'):event.key==='Enter'&&!event.shiftKey&&!event.isComposing&&target?.matches('#prompt-textarea');
    if(!sending)return;
    const textarea=document.querySelector('#prompt-textarea'),draft=textarea?.value;
    if(!draft?.trim()||!document.querySelector('#tools-dropdown-button')||Object.values(status()).every(Boolean))return;
    event.preventDefault();event.stopImmediatePropagation();
    if(submissionPending)return;submissionPending=true;
    const path=location.pathname,model=document.querySelector('[data-testid="model-selector-button"]')?.textContent;
    ensure().then(()=>{
      if(location.pathname!==path||textarea.value!==draft||document.querySelector('[data-testid="model-selector-button"]')?.textContent!==model)return;
      const send=document.querySelector('[data-testid="send-button"]');
      if(send&&!send.disabled){replaying=true;try{send.click()}finally{replaying=false}}
    }).catch(()=>{}).finally(()=>{submissionPending=false});
  }
  document.addEventListener('click',intercept,true);document.addEventListener('keydown',intercept,true);
  // A real enabled control is the source of truth. Never spoof aria-checked.
  window.__oproxyCapabilityPolicy={ensure,status};void 0;
})();
