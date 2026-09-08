import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_NO_RESPONSE_MESSAGE, EVALUATION_NO_RESPONSE_TRIGGER } from '../src/lib/whatsapp/evaluation-no-response-policy.ts';
import { getEvaluationScheduleUnitConfigByUnit } from '../src/lib/whatsapp/evaluation-schedule-confirmation-message.ts';

const origin='http://127.0.0.1:3210';
const output=await mkdtemp(join(tmpdir(),'virtuosa-no-response-'));
console.log(JSON.stringify({output}));
const browser=await puppeteer.launch({headless:true});
const cases=['SCS','SBC','Osasco'].flatMap(unit=>[390,430,1440].map(width=>({unit,width})));
cases.push({unit:'SCS',width:390,errorSend:true},{unit:'SBC',width:430,errorSave:true},{unit:'SCS',width:390,viewer:true},{unit:'SBC',width:430,agent:true},{unit:'Osasco',width:390,blocked:true},{unit:'Osasco',width:1440,light:true});
const chosen=cases.filter(c=>!process.env.TEST_WIDTH||c.width===Number(process.env.TEST_WIDTH));
const root='.no-response-dialog';
const trigger='[aria-label="Ferramentas da conversa"]';
const openMenu=async page=>{
  await page.waitForFunction(selector=>{const el=document.querySelector(selector);if(!el)return false;const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))&&!el.closest('[inert]');},{},trigger);
  await page.click(trigger);await page.waitForSelector('[role="menu"]',{visible:true});
};
const clickText=async(page,text,selector='button')=>{
  const handle=await page.waitForFunction((text,selector)=>[...document.querySelectorAll(selector)].find(el=>el.getClientRects().length&&el.textContent.trim()===text),{},text,selector);
  await handle.asElement().click();await handle.dispose();
};
const fit=async page=>{
  await page.waitForFunction(selector=>document.querySelector(selector)?.getAnimations().every(a=>a.playState!=='running'),{},root);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'sem overflow da página');
  assert.ok(await page.$eval(root,el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1&&el.scrollWidth<=el.clientWidth+1;}),'modal dentro da tela');
  assert.ok(await page.$$eval(`${root} button`,els=>els.every(el=>el.getBoundingClientRect().height>=43.99)),'alvo de toque 44px');
};
try{
  for(const config of chosen){
    const {unit,width,viewer,errorSend,errorSave,light,agent,blocked}=config;
    const page=await browser.newPage();const calls=[],writes=[],errors=[];
    let failSend=!!errorSend,failSave=!!errorSave;
    const user={id:'test-user',name:'Pessoa Teste',role:viewer||agent?'VENDEDOR':'ADMINISTRADOR',unit,permissions:{crm:true}};
    const instance={id:getEvaluationScheduleUnitConfigByUnit(unit).instanceId,unit,name:`Leads ${unit}`,instanceName:`Leads ${unit}`,userId:user.id,ownerId:user.id,canReply:!viewer,status:'connected'};
    const conv={id:'chat',instanceId:instance.id,instance,status:'open',blockedAt:blocked?new Date().toISOString():null,assignedTo:user.id,unreadCount:0,contact:{id:'contact',name:'Pessoa de teste',phone:'5511900000000',unit},lastMessage:'Tenho interesse',lastMessageAt:new Date().toISOString()};
    let automation={id:`auto-${unit}`,unit,name:`Lembrete sem resposta — ${unit}`,description:'Somente novas confirmações sem retorno',triggerType:EVALUATION_NO_RESPONSE_TRIGGER,isActive:true,triggerConfig:{delayHours:2,activatedAt:new Date().toISOString()},steps:[{type:'send_message',config:{message:DEFAULT_NO_RESPONSE_MESSAGE}}],executionCount:0,createdAt:new Date().toISOString()};
    await page.setViewport({width,height:width===430?932:844,isMobile:width<600,hasTouch:width<600});
    await page.evaluateOnNewDocument(u=>{localStorage.setItem('virtuosa_user',JSON.stringify(u));localStorage.setItem('virtuosa_global_unit',u.unit);},user);
    await page.setRequestInterception(true);
    page.on('pageerror',err=>errors.push(err.message));
    page.on('request',async req=>{
      const url=new URL(req.url());
      if(url.origin!==origin&&!['data:','blob:'].includes(url.protocol))return req.abort();
      if(!url.pathname.startsWith('/api/'))return req.continue();
      calls.push(url.pathname);let data={success:true},status=200;
      if(req.method()!=='GET')writes.push({url:url.pathname,query:Object.fromEntries(url.searchParams),body:JSON.parse(req.postData()||'{}')});
      if(url.pathname==='/api/auth/me')data={authenticated:true,user};
      else if(url.pathname.includes('/instances'))data={instances:[instance],users:[user]};
      else if(url.pathname==='/api/whatsapp/status')data={connected:true,instance,status:'connected'};
      else if(url.pathname==='/api/whatsapp/conversations')data={conversations:[conv],appointmentSnapshot:{},serverTime:new Date().toISOString(),hasMore:false,queueCounts:{open:1}};
      else if(url.pathname==='/api/whatsapp/messages')data={messages:[{id:'msg',messageId:'wa',body:conv.lastMessage,type:'text',fromMe:false,timestamp:conv.lastMessageAt}],hasMore:false};
      else if(url.pathname.endsWith('/internal-notes'))data={notes:[],mentionableUsers:[]};
      else if(url.pathname.endsWith('/evaluation-confirmation'))data={visible:true,alreadySent:true};
      else if(url.pathname.endsWith('/evaluation-no-response')){
        await new Promise(resolve=>setTimeout(resolve,1200));
        if(failSend){status=409;data={error:'Aguarde duas horas sem resposta.'};}else data={status:'sent'};
      }
      else if(url.pathname==='/api/whatsapp/saved-replies')data={replies:[]};
      else if(url.pathname.endsWith('/saved-replies/categories'))data={categories:[]};
      else if(url.pathname==='/api/users')data=[];
      else if(url.pathname==='/api/crm/automations'){
        if(req.method()==='GET'){
          // Permite conferir o estado de carregamento sem consultar produção.
          await new Promise(resolve=>setTimeout(resolve,350));
          data={automations:[automation]};
        }else{
          if(failSave){status=500;data={error:'Falha de teste ao salvar'};}
          else{automation={...automation,...JSON.parse(req.postData()),unit};data={automation};}
        }
      }
      await req.respond({status,contentType:'application/json',body:JSON.stringify(data)});
    });
    const label=`${unit}-${width}-${viewer?'viewer':errorSend?'error-send':errorSave?'error-save':light?'light':agent?'agent':blocked?'blocked':'main'}`;
    await page.goto(`${origin}/crm/inbox`,{waitUntil:'networkidle0'});
    await page.waitForSelector('[data-conversation-id="chat"]');await page.click('[data-conversation-id="chat"]');
    await page.waitForSelector(trigger);await openMenu(page);
    assert.equal(calls.filter(p=>p==='/api/crm/automations').length,0,'abrir chat e menu não consulta configurações');
    assert.equal(writes.length,0,'abrir chat/menu não envia');
    if(viewer||blocked){assert.doesNotMatch(await page.$eval('[role="menu"]',el=>el.innerText),/Enviar lembrete sem resposta/);console.log(`PASS ${label}`);await page.close();continue;}
    await page.screenshot({path:join(output,`${label}-menu.png`)});
    const sendPath='/api/whatsapp/conversations/chat/evaluation-no-response';
    await clickText(page,'Enviar lembrete sem resposta','[role="menuitem"]');
    await page.waitForSelector('[role="menu"]',{hidden:true});
    assert.equal(await page.$(root),null,'clicar envia, não abre configuração');
    await openMenu(page);
    assert.ok(await page.$$eval('[role="menuitem"]',els=>els.some(el=>el.textContent.includes('Enviando lembrete')&&el.hasAttribute('data-disabled'))),'duplo clique bloqueado durante envio');
    await page.keyboard.press('Escape');
    if(errorSend){
      await page.waitForFunction(()=>document.body.innerText.includes('Aguarde duas horas sem resposta.'));
      assert.ok(!(await page.evaluate(()=>document.body.innerText.includes('Lembrete enviado com sucesso!'))));
      failSend=false;await openMenu(page);await clickText(page,'Enviar lembrete sem resposta','[role="menuitem"]');
    }
    await page.waitForFunction(()=>document.body.innerText.includes('Lembrete enviado com sucesso!'));
    const sends=writes.filter(w=>w.url===sendPath);
    assert.equal(sends.length,errorSend?2:1);assert.ok(sends.every(w=>w.query.targetInstanceId===instance.id));
    assert.equal(calls.filter(p=>p==='/api/crm/automations').length,0,'envio não consulta configurações administrativas no navegador');
    await openMenu(page);
    assert.ok(await page.$$eval('[role="menuitem"]',els=>els.some(el=>el.textContent.includes('Lembrete já enviado')&&el.hasAttribute('data-disabled'))));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.screenshot({path:join(output,`${label}-sent.png`)});await page.keyboard.press('Escape');
    if(agent){assert.deepEqual(errors,[]);console.log(`PASS ${label}`);await page.close();continue;}
    // Edição fica somente em Automações e não dispara mensagens.
    await page.goto(`${origin}/crm/automations`,{waitUntil:'networkidle0'});
    await page.waitForFunction(()=>document.body.innerText.includes('Sem restrição de horário'));
    const card=await page.waitForFunction(text=>[...document.querySelectorAll('button')].find(el=>el.textContent.includes(text)),{},`Lembrete sem resposta — ${unit}`);
    const count=calls.filter(p=>p==='/api/crm/automations').length;await card.asElement().click();await card.dispose();
    await page.waitForSelector('#no-response-message');
    assert.equal(calls.filter(p=>p==='/api/crm/automations').length,count,'editor usa registro já carregado');
    assert.equal(await page.$eval('#no-response-delay',el=>el.value),'2');
    assert.match(await page.$eval(root,el=>el.innerText),new RegExp(`unidade ${unit}`));
    assert.match(await page.$eval(root,el=>el.innerText),/Envio manual pelo botão do chat/);
    assert.match(await page.$eval(root,el=>el.innerText),/sem restrição de horário/);
    assert.doesNotMatch(await page.$eval(root,el=>el.innerText),/8h às 21h/);
    if(light)await page.evaluate(()=>{document.documentElement.classList.remove('dark');document.documentElement.dataset.theme='light';document.documentElement.dataset.mode='light';});
    await fit(page);await page.screenshot({path:join(output,`${label}-settings.png`)});
    await page.click('#no-response-delay',{clickCount:3});await page.keyboard.press('Backspace');await page.type('#no-response-delay','0');
    await page.waitForFunction(()=>document.querySelector('[data-no-response-save]')?.disabled===true);
    await page.click('#no-response-delay',{clickCount:3});await page.keyboard.press('Backspace');await page.type('#no-response-delay','2');
    const longMessage=`${DEFAULT_NO_RESPONSE_MESSAGE}\n\n${'Texto longo de teste. '.repeat(100)}`;
    await page.$eval('#no-response-message',(el,text)=>{const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;set.call(el,text);el.dispatchEvent(new Event('input',{bubbles:true}));},longMessage);
    await fit(page);
    await clickText(page,'Salvar configuração',`${root} button`);
    if(errorSave){await page.waitForSelector(`${root} [role="alert"]`);assert.equal(await page.$eval('#no-response-message',el=>el.value),longMessage);await fit(page);failSave=false;await clickText(page,'Salvar configuração',`${root} button`);}
    await page.waitForSelector(root,{hidden:true});
    assert.equal(writes.at(-1).body.triggerConfig.delayHours,2);assert.equal(writes.at(-1).body.steps[0].config.message,longMessage.trim());
    assert.equal(writes.filter(w=>w.url===sendPath).length,sends.length,'salvar configuração não envia');
    const reopen=await page.waitForFunction(text=>[...document.querySelectorAll('button')].find(el=>el.textContent.includes(text)),{},`Lembrete sem resposta — ${unit}`);
    await reopen.asElement().click();await reopen.dispose();await page.waitForSelector('#no-response-message');await fit(page);
    await page.click('[role="switch"]');await clickText(page,'Salvar configuração',`${root} button`);await page.waitForSelector(root,{hidden:true});
    assert.equal(writes.at(-1).body.isActive,false);
    assert.deepEqual(errors,[]);console.log(`PASS ${label}`);await page.close();
  }
}finally{await browser.close();}
console.log(JSON.stringify({passed:chosen.length,output}));
