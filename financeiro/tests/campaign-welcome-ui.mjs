import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DEFAULT_WELCOME_GREETING,WELCOME_LIBRARY_USER_ID} from '../src/lib/whatsapp/campaign-welcome-policy.ts';
const origin='http://127.0.0.1:3210';
const output=await mkdtemp(join(tmpdir(),'virtuosa-welcome-ui-'));
const browser=await puppeteer.launch({headless:true});
const clickText=async(page,text)=>{
  const el=await page.waitForFunction(text=>[...document.querySelectorAll('button')].find(el=>el.getClientRects().length&&el.textContent.includes(text)),{},text);
  await el.asElement().click();await el.dispose();
};
try{
  for(const unit of ['SCS','SBC','Osasco'])for(const width of [390,430,1440]){
    const page=await browser.newPage();let reads=0,writes=0,failSave=true;const errors=[];
    await page.setViewport({width,height:width===430?932:900,isMobile:width<600,hasTouch:width<600});
    const user={id:'synthetic',name:'Teste',role:'ADMINISTRADOR',unit,permissions:{crm:true}};
    const automation={id:`campaign_welcome:${unit}`,unit,name:`Recepção por campanha — ${unit}`,description:'Novos leads em 1 minuto',triggerType:'campaign_welcome',isActive:true,executionCount:0,createdAt:new Date().toISOString(),steps:[],triggerConfig:{libraryUserId:WELCOME_LIBRARY_USER_ID,greeting:DEFAULT_WELCOME_GREETING,replyIds:{'barriga-trincada':'reply'}}};
    const data={automation,library:[{id:'reply',title:'ENTENDENDO A REGIÃO COM UMA DESCRIÇÃO MUITO LONGA PARA VALIDAR MOBILE',content:('Me conta o que mais te incomoda no abdômen?\n').repeat(12),campaignKey:'barriga-trincada'}],campaigns:[{key:'barriga-trincada',name:'Barriga Trincada — protocolo com nome longo para validar quebra de linha',covered:true},{key:'botox',name:'Botox',covered:false}],scheduler:{installed:true,readyAt:new Date().toISOString()},recent:[{id:'job',status:'uncertain',campaignKey:'barriga-trincada',createdAt:new Date().toISOString()}]};
    await page.evaluateOnNewDocument(u=>{localStorage.setItem('virtuosa_user',JSON.stringify(u));localStorage.setItem('virtuosa_global_unit',u.unit);},user);
    await page.setRequestInterception(true);page.on('pageerror',e=>errors.push(e.message));
    page.on('request',async req=>{
      const url=new URL(req.url());if(url.origin!==origin&&!['data:','blob:'].includes(url.protocol))return req.abort();
      if(!url.pathname.startsWith('/api/'))return req.continue();
      let body={success:true},status=200;
      if(url.pathname==='/api/auth/me')body={authenticated:true,user};
      if(url.pathname==='/api/crm/automations'){
        if(req.method()==='GET'){
          if(url.searchParams.has('welcomeUnit')){reads++;await new Promise(resolve=>setTimeout(resolve,700));body=data;}
          else body={automations:[automation]};
        }else{writes++;await new Promise(resolve=>setTimeout(resolve,350));if(failSave){status=400;body={error:'Falha simulada. Nenhuma alteração salva.'};}else{const changes=JSON.parse(req.postData());assert.equal(changes.triggerConfig.libraryUserId,WELCOME_LIBRARY_USER_ID);assert.equal(changes.id,automation.id);body={automation:{...automation,...changes}};}}
      }
      await req.respond({status,contentType:'application/json',body:JSON.stringify(body)});
    });
    await page.goto(`${origin}/crm/automations`,{waitUntil:'networkidle0'});
    await clickText(page,`Recepção por campanha — ${unit}`);
    await page.waitForSelector('[role="dialog"]',{visible:true});
    await page.waitForFunction(()=>document.body.innerText.includes('Carregando configuração'));
    await page.waitForSelector('[aria-label="Saudação automática"]');
    await page.waitForFunction(()=>document.querySelector('[role="dialog"]')?.getAnimations().every(a=>a.playState!=='running'));
    const fit=await page.$eval('[role="dialog"]',el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,bottom:r.bottom,innerWidth,innerHeight,scroll:el.scrollWidth,width:el.clientWidth};});
    assert.ok(fit.left>=0&&fit.right<=width+1&&fit.bottom<=fit.innerHeight+1&&fit.scroll<=fit.width+1,JSON.stringify(fit));
    assert.ok(await page.$$eval('[role="dialog"] select,[role="dialog"] button',els=>els.every(el=>el.getBoundingClientRect().height>=43.99)),'alvos de toque 44px');
    assert.equal(await page.$eval('#welcome-botox',el=>el.options.length),1,'nenhuma pergunta de outra campanha');
    await page.$eval('[role="dialog"] details summary',el=>el.click());
    assert.match(await page.$eval('[role="dialog"]',el=>el.innerText),/Me conta o que/);
    await page.screenshot({path:join(output,`${unit}-${width}.png`)});
    await clickText(page,'Salvar recepção');
    await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(el=>el.textContent.includes('Salvando')&&el.disabled));
    await page.waitForSelector('[role="alert"]');assert.equal(writes,1);assert.equal(reads,1);
    failSave=false;await clickText(page,'Salvar recepção');
    await page.waitForSelector('[role="dialog"]',{hidden:true});assert.equal(writes,2);assert.equal(errors.length,0,errors.join('\n'));
    console.log(`PASS ${unit} ${width}px · loading, texto longo, prévia, falha e salvar`);
    await page.close();
  }
}finally{await browser.close();}
console.log(JSON.stringify({output}));
