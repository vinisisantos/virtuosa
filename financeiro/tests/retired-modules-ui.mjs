import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const origin='http://127.0.0.1:3210';
const output=await mkdtemp(join(tmpdir(),'virtuosa-without-models-'));
const user={id:'test-user',name:'Operadora Teste',role:'ADMINISTRADOR',unit:'SCS',permissions:{crm:true,dashboard:true,financeiro:true,pedidos:true}};
const instance={id:'test-instance',name:'Comercial SCS',instanceName:'Comercial SCS',unit:'SCS',status:'connected',ownerId:user.id,userId:user.id,canReply:true};
const conv={id:'test-conversation',instanceId:instance.id,instance,status:'open',contactId:'test-contact',contact:{id:'test-contact',name:'Cliente com nome longo para validar o atendimento no celular',phone:'5511999999999',unit:'SCS',tags:[]},lastMessage:'Gostaria de confirmar os horários disponíveis para a minha avaliação.',lastMessageAt:new Date().toISOString(),unreadCount:1,assignedTo:user.id,assignedToName:user.name,canReply:true};
const browser=await puppeteer.launch({headless:true});
const results=[];
try {
 for(const width of [390,430,1440]) {
  const page=await browser.newPage();
  const errors=[], writes=[], calls=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.setViewport({width,height:900});
  await page.evaluateOnNewDocument(u=>{
    localStorage.setItem('virtuosa_user',JSON.stringify(u));
    localStorage.setItem('virtuosa_unit','SCS');
    localStorage.setItem('selectedUnit','SCS');
  },user);
  await page.setRequestInterception(true);
  page.on('request',async req=>{
    const url=new URL(req.url());
    if(url.origin!==origin && !['data:','blob:'].includes(url.protocol))return req.abort();
    if(!url.pathname.startsWith('/api/'))return req.continue();
    calls.push(url.pathname);
    if(req.method()!=='GET')writes.push(url.pathname);
    let data={success:true};
    if(url.pathname==='/api/auth/me') {await new Promise(r=>setTimeout(r,150));data={authenticated:true,user};}
    else if(url.pathname==='/api/backup')data={success:true,data:{logs:[],goals:[]}};
    else if(url.pathname.includes('/instances'))data={success:true,instances:[instance],users:[user]};
    else if(url.pathname==='/api/whatsapp/status')data={success:true,connected:true,instance,status:'connected'};
    else if(url.pathname==='/api/whatsapp/conversations')data={success:true,conversations:[conv],hasMore:false,instanceId:instance.id,canReply:true,total:1,totalUnread:1,counts:{all:1,open:1}};
    else if(url.pathname==='/api/whatsapp/messages')data={success:true,messages:[{id:'msg-test',messageId:'wa-test',body:conv.lastMessage,type:'text',fromMe:false,status:'read',timestamp:new Date().toISOString(),createdAt:new Date().toISOString()}],hasMore:false};
    else if(url.pathname.includes('internal-notes'))data={success:true,notes:[],mentionableUsers:[user]};
    else if(url.pathname==='/api/whatsapp/send')data={success:true,message:{id:'msg-sent',body:'Mensagem manual de teste',type:'text',fromMe:true,status:'sent',timestamp:new Date().toISOString()}};
    else if(url.pathname==='/api/whatsapp/saved-replies')data={success:true,replies:[]};
    else if(url.pathname==='/api/whatsapp/saved-replies/categories')data={success:true,categories:[]};
    else if(url.pathname==='/api/whatsapp/contact-summary')data={success:true,campaigns:[],summary:null};
    else if(url.pathname==='/api/payroll/dashboard-sync')data={entries:[]};
    else if(['/api/users','/api/clients','/api/packages','/api/pipelines','/api/pipeline'].includes(url.pathname))data=[];
    await req.respond({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  for(const tab of ['sales','forecast','analytics']) {
    await page.goto(`${origin}/dashboard?tab=${tab}`,{waitUntil:'networkidle0'});
    if(tab==='sales') {
      await page.waitForFunction(()=>document.body.innerText.includes('Registrar Venda'));
      await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim().endsWith('Importar'))?.click());
      await page.waitForSelector('input[type=file]');
      assert.equal(await page.$eval('input[type=file]',el=>el.accept),'.xlsx,.xls');
      await page.evaluate(()=>[...document.querySelectorAll('h2')].find(el=>el.textContent.includes('Importar Vendas Detalhadas'))?.scrollIntoView({block:'start'}));
    }
    assert.doesNotMatch(await page.$eval('body',el=>el.innerText),/Chat IA|Previsão de Faturamento \(IA\)|Treinamento IA/);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),`overflow dashboard ${tab} ${width}`);
    await page.screenshot({path:join(output,`dashboard-${tab}-${width}.png`),fullPage:true});
  }
  await page.goto(`${origin}/crm/inbox`,{waitUntil:'networkidle0'});
  await page.waitForFunction(()=>document.body.innerText.includes('Cliente com nome longo'));
  await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Cliente com nome longo'))?.click());
  await new Promise(r=>setTimeout(r,400));
  await page.type('[placeholder="Digite uma mensagem"]','Mensagem manual de teste');
  await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.body.innerText.includes('Mensagem manual de teste'));
  assert.ok(writes.includes('/api/whatsapp/send'),`envio manual ${width}`);
  assert.doesNotMatch(await page.$eval('body',el=>el.innerText),/Sugerir resposta|Aprendizados|Análise IA|Treinamento IA/);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),`overflow inbox ${width}`);
  await page.screenshot({path:join(output,`inbox-${width}.png`),fullPage:true});
  assert.equal(calls.some(p=>/ai-shadow|ai-inbox|reply-suggestions|\/api\/chat|\/api\/forecast/.test(p)),false);
  results.push({width,errors,writes});
  await page.close();
 }
 console.log(JSON.stringify({output,results}));
 assert.deepEqual(results.flatMap(r=>r.errors),[]);
} finally {await browser.close();}
