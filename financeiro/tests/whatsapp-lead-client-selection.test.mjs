import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { campaignClientKey, campaignPhoneKey, pickLeadClientForUnit, pickCampaignClientForUnit } from '../src/lib/whatsapp/lead-client-selection.ts';

const phone='5511999991234';
const sbc={id:'sbc',phone,unit:'SBC',originUnit:'SBC',campaignName:'Glúteo Perfeito',source:'whatsapp',updatedAt:new Date('2026-09-08T10:00:00Z')};
const scs={id:'scs',phone,unit:'SCS',originUnit:'SCS',campaignName:'Harmonização de Mamas',campaignId:'meta-id',source:'facebook_ad',fbclid:'https://example.invalid/ad',updatedAt:new Date('2026-09-08T11:00:00Z')};
test('evento SCS não seleciona cadastro SBC mesmo sem candidato local',()=>{
  assert.equal(pickLeadClientForUnit([sbc],{contactPhone:phone,leadUnit:'SCS',hasCampaignSignal:true}),null);
});
for(const unit of ['SBC','SCS','Osasco'])test(`seleção na escrita e leitura exige telefone e ${unit}`,()=>{
  const local={...sbc,id:unit,unit,campaignName:'Botox',fbclid:null,campaignId:null};
  const candidates=[scs,sbc,local].filter(c=>c===local||c.unit!==unit);
  assert.equal(pickLeadClientForUnit(candidates,{contactPhone:phone,leadUnit:unit,hasCampaignSignal:true}).id,unit);
  assert.equal(pickCampaignClientForUnit(candidates,phone,unit).id,unit);
});
test('mantém DDD e reconhece formatação, país e nono dígito sem misturar telefone',()=>{
  assert.equal(campaignPhoneKey(phone),campaignPhoneKey('(11) 99999-1234'));
  assert.equal(campaignPhoneKey(phone),campaignPhoneKey('551199991234'));
  assert.notEqual(campaignPhoneKey(phone),campaignPhoneKey('5513999991234'));
  assert.equal(pickLeadClientForUnit([{...sbc,phone:'5513999991234'}],{contactPhone:phone,leadUnit:'SBC',hasCampaignSignal:true}),null);
  assert.equal(campaignPhoneKey('123456789012345@lid'),'');
  assert.equal(campaignClientKey(phone,'Todas'),'');
  assert.notEqual(campaignClientKey(phone,'SBC'),campaignClientKey(phone,'SCS'));
});
test('origem histórica não dá permissão para sobrescrever cadastro transferido',()=>{
  assert.equal(pickLeadClientForUnit([{...sbc,unit:'SCS'}],{contactPhone:phone,leadUnit:'SBC',hasCampaignSignal:true}),null);
});
test('consulta de entrada filtra unidade antes do limite e protege negócio existente',()=>{
  const code=readFileSync(new URL('../src/app/api/whatsapp/webhook/route.ts',import.meta.url),'utf8');
  assert.match(code,/where: \{ isActive: true, unit: leadUnit, OR: phoneConditions \}/);
  assert.match(code,/clientId: client.id,\s+unit: leadUnit,\s+lostReason: null/);
  assert.ok(code.includes('pickLeadClientForUnit(clientCandidates'));
});
