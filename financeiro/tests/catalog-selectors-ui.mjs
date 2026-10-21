import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { loadApprovedCatalog } from '../scripts/import-sbc-catalog.mjs';

// Todas as APIs são interceptadas. Não cria agendamentos, vendas ou mensagens reais.
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3210';
const plan=loadApprovedCatalog();
const services=[...plan.inserts,...plan.matched.map(r=>({id:r.id,name:r.currentName,price:r.currentPrice,duration:r.newDuration,category:'Original',unit:'SBC'}))];
const target=services.find(r=>r.code==='0597');
const user={id:'operator',name:'Operadora Sintética',role:'ADMINISTRADOR',unit:'SBC',permissions:{admin:true,crm:true,agenda:true,dashboard:true}};
const professional={id:'professional',name:'Responsável Sintética',unit:'SBC',isActive:true,color:'#8b5cf6'};
const instance={id:'a6871ee7-8352-4b66-bfb2-b8dba9e4f8e3',name:'Leads - Paloma',instanceName:'Paloma',unit:'SBC',status:'connected',userId:user.id,ownerId:user.id,canReply:true};
const now=new Date().toISOString();
const conv={id:'chat',instanceId:instance.id,instance,status:'open',contact:{id:'contact',name:'Pessoa Sintética',phone:'5511987654321',unit:'SBC'},lastMessage:'Olá',lastMessageAt:now,lastInboundAt:now,unreadCount:1,assignedTo:user.id};
const browser=await puppeteer.launch({headless:true,args:['--disable-gpu'],protocolTimeout:15000});
const wait=(page,fn,...args)=>page.waitForFunction(fn,{polling:100,timeout:15000},...args);
async function click(page,text,selector='button'){
  const handle=await wait(page,(label,selector)=>[...document.querySelectorAll(selector)].find(e=>e.textContent.trim().includes(label)&&!e.disabled),text,selector);
  await handle.asElement().evaluate(e=>{e.scrollIntoView({block:'center'});e.click();});
}
async function fit(page,width){
  const field=await page.$('[aria-label="Procedimento de interesse"]');
  if(field){
    await field.evaluate(e=>e.scrollIntoView({block:'center'}));
    await wait(page,()=>document.querySelector('[aria-label="Procedimento de interesse"]').getBoundingClientRect().height>=43.9);
  }
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`overflow ${width}`);
  const geometry=await page.$eval('[aria-label="Procedimento de interesse"]',e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,height:r.height};}).catch(()=>null);
  if(geometry)assert.ok(geometry.left>=0&&geometry.right<=width+1&&geometry.height>=44,'campo acessível');
}
async function setValue(page,selector,value){
  await page.$eval(selector,(e,value)=>{
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);
    e.dispatchEvent(new Event('input',{bubbles:true}));
    e.dispatchEvent(new Event('change',{bubbles:true}));
  },value);
}
try{
  for(const width of [390,430,1440])for(const kind of ['pipeline','agenda','pacotes','termos','inbox']){
    const page=await browser.newPage(),errors=[],catalogCalls=[],writes=[];
    let failCatalog=false;
    page.on('pageerror',e=>errors.push(e.message));
    await page.setViewport({width,height:932,isMobile:width<600,hasTouch:width<600});
    await page.evaluateOnNewDocument(u=>{
      localStorage.setItem('virtuosa_user',JSON.stringify(u));localStorage.setItem('virtuosa_global_unit','SBC');
      localStorage.setItem('virtuosa_tour_done',JSON.stringify({agenda:true,clientes:true}));
    },user);
    await page.setRequestInterception(true);
    page.on('request',async req=>{
      const url=new URL(req.url());if(url.origin!==origin&&!['data:','blob:'].includes(url.protocol))return req.abort();
      if(!url.pathname.startsWith('/api/'))return req.continue();
      if(req.method()!=='GET')writes.push(url.pathname);
      let data={},status=200;
      if(url.pathname==='/api/auth/me')data={authenticated:true,user};
      else if(url.pathname==='/api/catalog'){
        catalogCalls.push(url.searchParams.get('unit'));await new Promise(r=>setTimeout(r,250));
        if(failCatalog){status=503;data={error:'Falha sintética'};}else data={services};
      }else if(url.pathname==='/api/procedimentos'){
        catalogCalls.push(url.searchParams.get('unit'));
        await new Promise(r=>setTimeout(r,250));
        data=url.searchParams.get('unit')==='SBC'?services.map(r=>r.name):['Outro procedimento Osasco'];
      }else if(url.pathname==='/api/pipelines')data=[{id:'pipeline',name:'Funil SBC',unit:'SBC',stages:[{id:'lead',name:'Novo Lead',position:0},{id:'scheduled',name:'Agendado',position:1}]}];
      else if(url.pathname==='/api/pipeline')data=kind==='inbox'?[{id:'deal',clientId:'client',unit:'SBC',pipelineId:'pipeline',stageId:'lead'}]:[];
      else if(url.pathname==='/api/agenda'||url.pathname==='/api/packages')data=[];
      else if(url.pathname==='/api/profissionais')data=[professional];
      else if(url.pathname==='/api/crm/evaluations/assignees')data={assignees:[{id:'operator',name:professional.name,unit:'SBC'}]};
      else if(url.pathname==='/api/users')data=[user];
      else if(url.pathname==='/api/clients'||url.pathname==='/api/clients/search')data={clients:kind==='inbox'?[{id:'client',name:conv.contact.name,phone:conv.contact.phone,unit:'SBC'}]:[]};
      else if(url.pathname==='/api/contract-templates')data=[];
      else if(url.pathname==='/api/contracts')data={contracts:[{status:'assinado'}]};
      else if(url.pathname.includes('notifications'))data={notifications:[],unreadCount:0};
      else if(url.pathname.endsWith('/instances'))data={success:true,instances:[instance],users:[user]};
      else if(url.pathname==='/api/whatsapp/status')data={success:true,connected:true,instance,status:'connected'};
      else if(url.pathname==='/api/whatsapp/conversations')data={conversations:[conv],serverTime:now,hasMore:false,queueCounts:{open:1,unread:1}};
      else if(url.pathname==='/api/whatsapp/messages')data={messages:[{id:'m',messageId:'m',body:'Olá',type:'text',fromMe:false,status:'read',timestamp:now}],hasMore:false};
      else if(url.pathname.includes('/saved-replies'))data={replies:[],categories:[]};
      else if(url.pathname==='/api/whatsapp/contact-summary')data={summary:null,campaigns:[]};
      await req.respond({status,contentType:'application/json',body:JSON.stringify(data)});
    });
    const url=kind==='pipeline'?'/crm/pipeline?createEvaluation=1':kind==='termos'?'/termos?generate=1&unidade=SBC':kind==='inbox'?'/crm/inbox':`/${kind}`;
    try{
      await page.goto(origin+url,{waitUntil:'domcontentloaded'});
      if(kind==='agenda'){
        await click(page,'Novo Agendamento');
        await page.waitForSelector('[placeholder="Ex: Laser, Botox..."]');
        const short=services.find(r=>r.duration===5);
        await setValue(page,'[placeholder="Ex: Laser, Botox..."]',short.name);
        await click(page,short.name);
        const selected=await page.$$eval('[role="dialog"] select',els=>els.map(e=>e.value));
        assert.ok(selected.includes('05'),'tempo exato de cinco minutos disponível no fim');
        await setValue(page,'[placeholder="Ex: Laser, Botox..."]','Avaliação');
      }else if(kind==='pacotes'){
        await click(page,'Novo Pacote');
        const input=await page.waitForSelector('input[placeholder="Buscar procedimento..."]');await input.focus();
        await setValue(page,'input[placeholder="Buscar procedimento..."]','CO2 Braços');
        await wait(page,()=>document.querySelectorAll('[data-procedure-item]').length>0);
        const item=await page.$('[data-procedure-item]');assert.ok((await item.evaluate(e=>e.innerText)).includes('45 min'));
        await item.evaluate(e=>e.click());await fit(page,width);
        assert.equal(await page.$eval('input[placeholder="Buscar procedimento..."]',e=>e.value),target.name);
      }else if(kind==='termos'){
        await wait(page,()=>document.querySelector('.gen-stepper'));
        await click(page,'Pagamento','.gen-step-item');
        await wait(page,name=>[...document.querySelectorAll('#proc-suggestions option')].some(e=>e.value===name),target.name);
        await fit(page,width);
        await click(page,'Modelo','.gen-step-item');await page.select('.gen-unidade-wrap select','Osasco');
        await click(page,'Pagamento','.gen-step-item');
        await wait(page,()=>[...document.querySelectorAll('#proc-suggestions option')].some(e=>e.value==='Outro procedimento Osasco'));
        assert.ok(!(await page.$$eval('#proc-suggestions option',els=>els.map(e=>e.value))).includes(target.name));
      }else if(kind==='inbox'){
        await page.waitForSelector('[data-conversation-id="chat"]');
        await page.$eval('[data-conversation-id="chat"]',e=>e.click());
        await page.waitForSelector('[placeholder="Digite uma mensagem"]');
        assert.equal(catalogCalls.length,0,'Inbox não busca catálogo por conversa');
        await click(page,'Agendar');
      }
      if(['pipeline','agenda','inbox'].includes(kind)){
        await page.waitForSelector('[aria-label="Procedimento de interesse"]');
        await wait(page,name=>[...document.querySelectorAll('datalist option')].some(e=>e.value===name),target.name);
        await setValue(page,'[aria-label="Procedimento de interesse"]',target.name);
        assert.equal(await page.$eval('[aria-label="Procedimento de interesse"]',e=>e.value),target.name);
        await fit(page,width);
        assert.ok(catalogCalls.every(unit=>unit==='SBC'),'catálogo isolado em SBC');
        if(kind==='inbox'){
          assert.equal(catalogCalls.length,1,'uma consulta ao abrir o modal');
          await click(page,'Cancelar');failCatalog=true;await click(page,'Agendar');
          await wait(page,()=>document.body.textContent.includes('Não foi possível carregar o catálogo'));
          await setValue(page,'[aria-label="Procedimento de interesse"]','Tratamento manual com texto longo sem catálogo');
          await fit(page,width);
          assert.equal(catalogCalls.length,2,'sem retentativa em loop após falha');
        }
      }
      assert.deepEqual(errors,[]);assert.ok(!writes.some(p=>['/api/pipeline','/api/agenda','/api/packages'].includes(p)));
      console.log(`PASS ${kind} ${width}px: catálogo, interação, unidade e layout.`);
    }catch(error){console.log({kind,width,url:page.url(),errors,catalogCalls,body:await page.evaluate(()=>document.body.innerText.slice(-2200))});throw error;}
    finally{await page.close();}
  }
}finally{await browser.close();}
