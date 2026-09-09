import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const origin='http://127.0.0.1:3210';
const output=await mkdtemp(join(tmpdir(),'virtuosa-dispatch-ui-'));
console.log(JSON.stringify({output}));
const browser=await puppeteer.launch({headless:true});
const results=[];
const configs=['Osasco','SBC','SCS'].flatMap(unit=>[390,430,1440].map(width=>({unit,width,status:'delivered'})));
configs.push({unit:'Osasco',width:390,status:'sent',light:true},{unit:'Osasco',width:430,status:'failed'},{unit:'Osasco',width:1440,status:'read',viewer:true});
const badge='[aria-label="Ver detalhes do disparo"]';
const clickText=async(page,text)=>{
  const handle=await page.waitForFunction(text=>[...document.querySelectorAll('button')].find(el=>el.getClientRects().length&&el.textContent.trim()===text),{},text);
  await handle.asElement().click();await handle.dispose();
};
const fit=async page=>{
  await page.waitForFunction(()=>[...document.querySelectorAll('[role="dialog"]')].filter(el=>el.getClientRects().length).every(el=>getComputedStyle(el).opacity==='1'));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'sem overflow horizontal');
  assert.ok(await page.evaluate(()=>[...document.querySelectorAll('[role="dialog"]')].filter(el=>el.getClientRects().length).every(el=>{
    const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1;
  })),'detalhes dentro da tela');
};
try{
  for(const config of configs){
    if(process.env.BULK_ONLY==='1'&&!(config.unit==='Osasco'&&config.width===1440&&config.status==='delivered'))continue;
    const {unit,width,status,light=false,viewer=false}=config;
    const page=await browser.newPage(),errors=[],calls=[],sendPayloads=[];
    const user={id:'operator',name:'Operadora Teste',role:viewer?'VENDEDOR':'ADMINISTRADOR',unit,permissions:{crm:true}};
    const instance={id:'instance',unit,name:'Comercial',instanceName:'Comercial',userId:user.id,ownerId:user.id,canReply:!viewer,status:'connected'};
    const now=new Date().toISOString();
    const dispatch={id:'outbound',conversationId:'chat',metadata:{version:1,unit:'Osasco',batchId:'12345678-1234-1234-1234-123456789abc',source:'inbox_bulk',campaignName:'Campanha com nome bastante longo para conferir a organização e a quebra de linhas no celular'},sentAt:now,sentByName:'Operadora com nome longo para validar os detalhes',status:'sent'};
    const conv={id:'chat',instanceId:'instance',instance,status:'open',assignedTo:user.id,unreadCount:1,contact:{id:'contact',name:'Mariana com nome muito longo para testar o cabeçalho',phone:'5511900000000',unit},campaignName:'Glúteo Perfeito',campaignAccountOrigin:'secondary',lastMessage:'Olá! Temos horários disponíveis.',lastMessageAt:now,...(unit==='Osasco'?{lastDispatch:dispatch}:{})};
    const conversations=[conv,{...conv,id:'manual',contact:{...conv.contact,id:'individual',name:'Contato sem disparo'},lastDispatch:null}];
    await page.setViewport({width,height:850});
    await page.evaluateOnNewDocument(u=>localStorage.setItem('virtuosa_user',JSON.stringify(u)),user);
    await page.setRequestInterception(true);
    page.on('pageerror',error=>errors.push(error.message));
    page.on('request',async req=>{
      const url=new URL(req.url());
      if(url.origin!==origin&&!['data:','blob:'].includes(url.protocol))return req.abort();
      if(!url.pathname.startsWith('/api/'))return req.continue();
      calls.push({path:url.pathname,method:req.method()});
      let data={success:true};
      if(url.pathname==='/api/auth/me')data={authenticated:true,user};
      else if(url.pathname.includes('/instances'))data={instances:[instance],users:[user]};
      else if(url.pathname==='/api/whatsapp/status')data={connected:true,instance,status:'connected'};
      else if(url.pathname==='/api/whatsapp/conversations'){
        await new Promise(resolve=>setTimeout(resolve,100));
        data={conversations,appointmentSnapshot:{},serverTime:new Date().toISOString(),hasMore:false,queueCounts:{open:2,unread:1}};
      }
      else if(url.pathname==='/api/whatsapp/messages'){
        await new Promise(resolve=>setTimeout(resolve,180));
        data={messages:[{id:'inbound',conversationId:'chat',messageId:'inbound-wa',body:'Bom dia!',type:'text',fromMe:false,status:'received',timestamp:now},{id:'outbound',conversationId:'chat',messageId:'outbound-wa',body:'Olá! Temos horários disponíveis.',type:'text',fromMe:true,status,timestamp:now,respondedBy:'operator',respondedByName:dispatch.sentByName,...(unit==='Osasco'?{dispatchMetadata:dispatch.metadata}:{})}],hasMore:false};
      }
      else if(url.pathname.endsWith('/internal-notes'))data={notes:[],mentionableUsers:[]};
      else if(url.pathname.endsWith('/evaluation-confirmation'))data={visible:false};
      else if(url.pathname==='/api/whatsapp/saved-replies')data={replies:[]};
      else if(url.pathname==='/api/whatsapp/saved-replies/categories')data={categories:[]};
      else if(url.pathname==='/api/whatsapp/send'){
        const payload=JSON.parse(req.postData());sendPayloads.push(payload);
        if(payload.conversationId==='chat')return req.respond({status:502,contentType:'application/json',body:JSON.stringify({error:'Falha simulada'})});
        conversations[1].lastDispatch={...dispatch,id:'new-bulk',conversationId:'manual',metadata:{...dispatch.metadata,...payload.dispatch},status:'sent'};
        data={message:{id:'new-bulk',timestamp:now},lastDispatch:conversations[1].lastDispatch};
      }
      else if(url.pathname==='/api/users')data=[];
      await req.respond({status:200,contentType:'application/json',body:JSON.stringify(data)});
    });
    await page.goto(origin+'/crm/inbox',{waitUntil:'networkidle0'});
    await page.waitForSelector('[data-conversation-id="chat"]');
    if(light)await page.evaluate(()=>{document.documentElement.classList.remove('dark');document.documentElement.dataset.theme='light';document.documentElement.dataset.mode='light';});
    const label=`${unit}-${width}-${status}-${viewer?'viewer':light?'light':'default'}`;
    await fit(page);
    assert.equal((await page.$$(badge)).length,unit==='Osasco'?1:0,'apenas Osasco e contato com disparo');
    if(unit==='Osasco'){
      const before=calls.length;
      assert.ok(await page.$eval(badge,el=>el.getBoundingClientRect().height>=44));
      await page.click(badge);await page.waitForSelector('[role="dialog"]',{visible:true});
      await fit(page);
      assert.ok((await page.$eval('[role="dialog"]',el=>el.innerText)).includes('Enviada'),'lista não presume entrega');
      assert.equal(calls.length,before,'abrir detalhes não faz chamada HTTP');
      assert.equal(await page.$('.inbox-thread-header'),null,'detalhes não abrem nem assumem conversa');
      await page.screenshot({path:join(output,label+'-lista.png')});
      await page.keyboard.press('Escape');await page.waitForSelector('[role="dialog"]',{hidden:true});
    }
    await page.click('[data-conversation-id="chat"]');
    await page.waitForSelector('.inbox-thread-header');
    await fit(page);
    await page.screenshot({path:join(output,label+'-header.png')});
    assert.equal(!!(await page.$('.inbox-thread-header '+badge)),unit==='Osasco');
    if(unit==='Osasco'){
      await page.waitForSelector('[aria-label="Ver detalhes desta mensagem de disparo"]');
      await page.click('.inbox-thread-header '+badge);
      await page.waitForSelector('[role="dialog"]',{visible:true});
      const text=await page.$eval('[role="dialog"]',el=>el.innerText);
      assert.ok(text.includes({sent:'Enviada',delivered:'Entregue',failed:'Falha',read:'Lida'}[status]),'status atual do histórico');
      await fit(page);await page.screenshot({path:join(output,label+'-chat.png')});
      await page.keyboard.press('Escape');await page.waitForSelector('[role="dialog"]',{hidden:true});
      assert.ok(await page.$('.inbox-thread-header'),'Escape dos detalhes não sai do chat');
      await page.click('[aria-label="Ver detalhes desta mensagem de disparo"]');
      await page.waitForSelector('[role="dialog"]',{visible:true});
      await page.click('[aria-label="Fechar detalhes do disparo"]');
      await page.waitForSelector('[role="dialog"]',{hidden:true});
      await page.reload({waitUntil:'networkidle0'});
      await page.waitForSelector(badge);
    }
    assert.equal(calls.some(c=>c.path==='/api/whatsapp/send'),false,'nenhum WhatsApp enviado ao ver detalhes');
    if(unit==='Osasco'&&width===1440&&status==='delivered'){
      await clickText(page,'Selecionar');
      await page.click('[data-conversation-id="manual"]');await page.click('[data-conversation-id="chat"]');
      await page.type('[placeholder="Digite a mensagem que será enviada para os chats selecionados..."]','Mensagem de teste do disparo');
      await clickText(page,'Revisar envio para 2');await clickText(page,'Enviar follow-up');
      await page.waitForFunction(()=>document.querySelector('[aria-label="Cancelar follow-up em lote"]')?.disabled===false);
      assert.equal(sendPayloads.length,2);assert.equal(sendPayloads[0].dispatch.batchId,sendPayloads[1].dispatch.batchId);
      for(const payload of sendPayloads){assert.equal(payload.dispatch.source,'inbox_bulk');assert.equal(payload.dispatch.size,2);}
      await clickText(page,'Cancelar seleção');
      await page.waitForFunction(()=>!document.querySelector('[data-conversation-id="manual"]').hasAttribute('aria-pressed'));
      await page.waitForFunction(()=>document.querySelector('[data-conversation-id="manual"]').parentElement.querySelector('[aria-label="Ver detalhes do disparo"]'));
      await page.click('[data-conversation-id="manual"] + * [aria-label="Ver detalhes do disparo"]');
      await page.waitForSelector('[role="dialog"]',{visible:true});
      assert.match(await page.$eval('[role="dialog"]',el=>el.innerText),/Disparo em lote/);
      await page.keyboard.press('Escape');
      assert.equal(conversations[0].lastDispatch.id,'outbound','falha preserva somente o disparo anterior');
    }
    assert.deepEqual(errors,[]);results.push({label,passed:true});await page.close();
  }
}finally{await browser.close();}
console.log(JSON.stringify({output,results},null,2));
