import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

// APIs interceptadas: nenhuma consulta real, mudança de cadastro ou envio ao WhatsApp.
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3210';
const output=await mkdtemp(join(tmpdir(),'virtuosa-dashboard-parity-'));
const fixture={
  metrics:{activeConversations:{current:65,previous:3163},unreadConversations:1,openDealsValue:0,openDealsCount:74,wonDealsValue:0,wonDealsCount:0},
  leadsSeries:Array.from({length:21},(_,index)=>({date:`2026-10-${String(index+1).padStart(2,'0')}`,newLeads:index===19?234:index===20?62:0,manualAdjustments:0})),
  whatsapp:{connectedCount:1,connectingCount:0,disconnectedCount:0,disconnectedInstances:[]},
};
const browser=await puppeteer.launch({headless:true,args:['--disable-gpu'],protocolTimeout:15000});
console.log({output});
async function fit(page){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'page overflow');}
async function click(page,text){
  const handle=await page.waitForFunction(label=>[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===label),{polling:100},text);
  await handle.asElement().evaluate(e=>{e.scrollIntoView({block:'center'});e.click();});
}
try{
  for(const width of [390,430,1440]){
    const snapshots=[];
    for(const name of ['Claudenice','Aline Fernanda']){
      const page=await browser.newPage();await page.emulateTimezone('America/Sao_Paulo');
      await page.setViewport({width,height:932,isMobile:width<600,hasTouch:width<600});
      const user={id:name==='Claudenice'?'admin':'operator',name,role:name==='Claudenice'?'ADMINISTRADOR':'VENDEDOR',unit:name==='Claudenice'?'Todas':'Osasco',permissions:{crm:true,unitOsasco:true,crmDashboardUnit:name!=='Claudenice'}};
      const errors=[],requests=[];let fail=false;
      page.on('pageerror',e=>errors.push(e.message));
      await page.evaluateOnNewDocument(user=>{localStorage.setItem('virtuosa_user',JSON.stringify(user));localStorage.setItem('virtuosa_global_unit','Osasco');},user);
      await page.setRequestInterception(true);
      page.on('request',async req=>{
        const url=new URL(req.url());if(url.origin!==origin&&!['data:','blob:'].includes(url.protocol))return req.abort();
        if(!url.pathname.startsWith('/api/'))return req.continue();
        assert.equal(req.method(),'GET','UI must not mutate real data');let data={},status=200;
        if(url.pathname==='/api/auth/me')data={authenticated:true,user};
        else if(url.pathname==='/api/crm/dashboard'){
          requests.push(url.search);await new Promise(resolve=>setTimeout(resolve,300));
          status=fail?500:200;data=fail?{error:'Falha sintética'}:fixture;fail=false;
        }else if(url.pathname.includes('notifications'))data={notifications:[],unreadCount:0};
        else if(url.pathname.endsWith('/instances'))data={instances:[]};
        await req.respond({status,contentType:'application/json',body:JSON.stringify(data)});
      });
      await page.goto(`${origin}/crm`,{waitUntil:'domcontentloaded'});await fit(page);
      await page.waitForFunction(()=>[...document.querySelectorAll('span.text-lg')].some(e=>e.textContent.trim()==='296'),{timeout:10000,polling:100}).catch(async error=>{
        console.log({url:page.url(),requests,errors,body:await page.evaluate(()=>document.body.innerText.slice(0,2500))});
        throw error;
      });
      await fit(page);
      // Captura é opcional em hosts sem compositor gráfico; DOM/layout/controles são sempre verificados.
      if(process.env.CAPTURE_SCREENSHOTS==='1')await page.screenshot({path:join(output,`${width}-${user.id}.png`),captureBeyondViewport:false});
      snapshots.push(await page.evaluate(()=>{
        const label=[...document.querySelectorAll('div')].find(e=>e.textContent.trim()==='Entrada de Novos Leads');
        return label?.parentElement.parentElement.parentElement.innerText;
      }));
      assert.ok(snapshots.at(-1)?.includes('296')&&snapshots.at(-1)?.includes('62'),'chart values rendered');
      for(const mode of ['Semana','Mês','Dia']){await click(page,mode);await fit(page);}
      const point=await page.$('[aria-label="Carregar indicadores de 20/10/2026"]');assert.ok(point);
      await point.evaluate(e=>{e.scrollIntoView({block:'center'});e.dispatchEvent(new MouseEvent('click',{bubbles:true}));});
      await page.waitForFunction(()=>document.body.textContent.includes('Voltar para hoje'),{polling:100});
      await page.waitForNetworkIdle();
      assert.ok(requests.some(q=>q.includes('chartMode=month')));await fit(page);
      fail=true;await click(page,'7 dias');await page.waitForNetworkIdle();await fit(page);
      await click(page,'Hoje');await page.waitForFunction(()=>document.body.textContent.includes('296'),{polling:100});await fit(page);
      assert.deepEqual(errors,[]);await page.close();
    }
    assert.deepEqual(snapshots[0],snapshots[1],`chart parity ${width}px`);
    console.log(`PASS ${width}px: paridade dos dois perfis, carregamento, erro/recuperação e controles do gráfico.`);
  }
}finally{await browser.close();}
