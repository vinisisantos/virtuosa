import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Todas as APIs são simuladas; este teste não envia mensagens nem acessa dados reais.
const origin='http://127.0.0.1:3210';
const output=await mkdtemp(join(tmpdir(),'virtuosa-evaluation-confirmation-'));
console.log({output});
const browser=await puppeteer.launch({headless:true});
const clickText=async(page,text)=>{
  const h=await page.waitForFunction(text=>[...document.querySelectorAll('button')].find(el=>el.getClientRects().length&&el.textContent.trim()===text),{},text);
  await h.asElement().click();await h.dispose();
};
try {
  for(const width of [390,430,834,1440]) {
    const page=await browser.newPage();const errors=[],calls=[],writes=[];
    let state='ready',sent=false;
    const user={id:'operator',name:'Operador Teste',role:'ADMINISTRADOR',unit:'SCS',permissions:{crm:true}};
    const start=new Date();start.setHours(23,0,0,0);
    const appointment={id:'synthetic-appointment',clientName:'Cliente Instagram com nome completo muito longo para validar a confirmação',clientPhone:'5511900000001',unit:'SCS',startTime:start.toISOString(),endTime:new Date(+start+3600000).toISOString(),status:'pendente',procedimento:'Avaliação',assignedUserId:user.id,profissional:{id:'professional',name:user.name},pipelineDealId:'deal',pipelineStage:'agendado',isInstagramSource:true};
    await page.setViewport({width,height:932,isMobile:width<600,hasTouch:width<900});
    await page.evaluateOnNewDocument(u=>{localStorage.setItem('virtuosa_user',JSON.stringify(u));localStorage.setItem('virtuosa_global_unit',u.unit);},user);
    page.on('pageerror',e=>errors.push(e.message));
    await page.setRequestInterception(true);
    page.on('request',async req=>{
      const url=new URL(req.url());
      if(url.origin!==origin&&!['data:','blob:'].includes(url.protocol))return req.abort();
      if(!url.pathname.startsWith('/api/'))return req.continue();
      calls.push(url.pathname);if(req.method()!=='GET')writes.push(url.pathname);
      let data={success:true},status=200;
      if(url.pathname==='/api/auth/me')data={authenticated:true,user};
      else if(url.pathname==='/api/crm/evaluations')data={unit:'SCS',evaluations:[appointment],professionals:[appointment.profissional],canViewAll:true,newEvaluationsToday:1};
      else if(url.pathname.endsWith('/assignees'))data={assignees:[{id:user.id,name:user.name,unit:'SCS'}]};
      else if(url.pathname==='/api/pipeline/chat-link')data={available:false,canCreate:false,reason:'Sem conversa anterior'};
      else if(url.pathname.endsWith('/confirmation')){
        await new Promise(r=>setTimeout(r,500));
        if(req.method()==='POST'){sent=true;data={status:'sent',conversationId:'new-chat',targetInstanceId:'leads-scs'};}
        else if(state==='invalid'){status=409;data={error:'Cadastre um telefone válido com DDD no cadastro do cliente para confirmar pelo WhatsApp.'};}
        else data={visible:true,alreadySent:sent,startsConversation:true,instanceName:'Thais Amorim Leads',phone:appointment.clientPhone,connected:state!=='disconnected'};
      }
      else if(url.pathname.endsWith('/evaluation-day-reminder'))data={visible:false,alreadySent:false};
      else if(url.pathname==='/api/users')data=[];
      else if(url.pathname==='/api/catalog')data={services:[]};
      await req.respond({status,contentType:'application/json',body:JSON.stringify(data)});
    });
    const open=async()=>{
      const h=await page.waitForFunction(name=>[...document.querySelectorAll('button')].find(el=>el.getClientRects().length&&el.textContent.includes(name)),{},appointment.clientName);
      await h.asElement().click();await h.dispose();await page.waitForSelector('[role="dialog"]',{visible:true});
    };
    await page.goto(`${origin}/crm/ouvidoria`,{waitUntil:'networkidle0'});
    console.log(`Loaded ${width}px`);
    assert.equal(calls.filter(p=>p.endsWith('/confirmation')).length,0,'não consulta por cartão');
    await open();console.log(`Opened ${width}px`);
    await page.waitForFunction(()=>document.body.innerText.includes('Será iniciada uma conversa'));
    assert.equal(writes.length,0,'consulta não envia');
    const button=await page.waitForFunction(()=>[...document.querySelectorAll('[role="dialog"] button')].find(b=>b.textContent.includes('Confirmar pelo WhatsApp')));
    await button.asElement().scrollIntoView();
    const fit=await page.$eval('[role="dialog"]',el=>{const r=el.getBoundingClientRect();return {width:el.clientWidth,scroll:el.scrollWidth,left:r.left,right:r.right};});
    assert.ok(fit.left>=0&&fit.right<=width+1&&fit.scroll<=fit.width+1,JSON.stringify(fit));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    assert.equal(await button.evaluate(el=>el.disabled),false);
    assert.ok(await button.evaluate(el=>el.getBoundingClientRect().height>=44),'alvo de toque da confirmação');
    await page.screenshot({path:join(output,`${width}-ready.png`)});
    await button.asElement().click();
    await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Confirmar pelo WhatsApp')&&b.disabled));
    await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Confirmação enviada')&&b.disabled));
    assert.equal(writes.length,1);assert.match(writes[0],/evaluations\/synthetic-appointment\/confirmation$/);
    await clickText(page,'Fechar');
    await page.waitForSelector('[role="dialog"]',{hidden:true});
    for(const next of ['disconnected','invalid']){
      state=next;sent=false;await open();
      await page.waitForFunction(text=>document.body.innerText.includes(text),{},next==='invalid'?'Cadastre um telefone válido':'Conecte a caixa');
      if(next==='disconnected')assert.ok(await page.$$eval('[role="dialog"] button',els=>els.some(b=>b.textContent.includes('Confirmar pelo WhatsApp')&&b.disabled)));
      await page.screenshot({path:join(output,`${width}-${next}.png`)});
      await clickText(page,'Fechar');
      await page.waitForSelector('[role="dialog"]',{hidden:true});
    }
    assert.equal(writes.length,1);assert.deepEqual(errors,[]);console.log(`PASS ${width}px`);await page.close();
  }
} catch(error) {
  console.error(error);
  for(const [index,page] of (await browser.pages().catch(()=>[])).entries()) {
    console.log('Failure page',page.url(),await page.evaluate(()=>document.body.innerText).catch(()=>''));
    await page.screenshot({path:join(output,`failure-${index}.png`)}).catch(()=>{});
  }
  throw error;
} finally { await browser.close(); }
