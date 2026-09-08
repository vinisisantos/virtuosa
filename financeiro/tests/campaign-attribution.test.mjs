import assert from 'node:assert/strict';
import test from 'node:test';
import { inferCampaignByKeywords, matchManagedCampaignName } from '../src/lib/campaign-attribution.ts';
import { campaignFromPrefilledMetaLeadMessage } from '../src/lib/campaign-track-mapping.ts';
import { DEFAULT_WELCOME_GREETING, WELCOME_LIBRARY_USER_ID, welcomePair } from '../src/lib/whatsapp/campaign-welcome-policy.ts';

const openings = [
  ['Olá! Eu vim pelo GLÚTEOS PERFEITOS, gostaria de saber mais sobre isso.', 'Glúteo Perfeito'],
  ['Olá! Vim pelo GLÚTEO PERFEITO 60ML, posso saber mais?', 'Glúteo Perfeito'],
  ['Vim pelo GLÚTEOS PERFEITOS 120ML', 'Glúteos Perfeitos 120ml'],
  ['Vim pela HARMONIZAÇÃO DE GLÚTEOS', 'Harmonização de Glúteos'],
  ['Vim pela HARMONIZAÇÃO DE MAMAS', 'Harmonização de Mamas'],
  ['Vim pelo BARRIGA TRINCADA', 'Barriga Trincada'],
  ['Oi! Vim pelo BOTOX', 'Botox'],
  ['Vim pelo PREENCHIMENTO FACIAL', 'Preenchimento Facial'],
  ['Vim pela GORDURA LOCALIZADA', 'Gordura Localizada'],
  ['Vim pelo HYPERSLIM', 'HyperSlim'],
  ['Vim pelo MONJIFAST', 'MonjiFast'],
];
for(const unit of ['SBC','SCS','Osasco']) {
  test(`recupera aberturas explícitas, acentos e variantes em ${unit}`,()=>{
    for(const [message,name] of openings) {
      assert.equal(campaignFromPrefilledMetaLeadMessage(message,unit)?.campaignName,name,message);
      assert.equal(inferCampaignByKeywords(message),name,message);
    }
    assert.equal(campaignFromPrefilledMetaLeadMessage(openings[0][0],unit).campaignTrackId,null);
  });
}
test('não inventa campanha, dosagem ou origem para frases vagas e citações',()=>{
  for(const text of ['Oi, tudo bem?', 'Qual o preço?', 'Quero harmonização', 'Vim pelo GLÚTEOS PERFEITOS 200ML', 'Ela disse: vim pelo GLÚTEOS PERFEITOS', 'Não vim pelo GLÚTEOS PERFEITOS']) {
    assert.equal(campaignFromPrefilledMetaLeadMessage(text,'SBC'),null,text);
  }
  assert.equal(campaignFromPrefilledMetaLeadMessage(openings[0][0],'Todas'),null);
  assert.equal(inferCampaignByKeywords('Botox ou Harmonização de Mamas?'),null);
  assert.equal(inferCampaignByKeywords('preenchimento do bumbum'),null);
  assert.equal(inferCampaignByKeywords('GLÚTEOS PERFEITOS 200ML'),null);
});
test('nome gerenciado exige termos completos e não escolhe entre campanhas distintas',()=>{
  const campaigns = ['Harmonização Mamas','Harmonização de Glúteos','Harmonização de Mamas','Botox'].map(name=>({name}));
  assert.equal(matchManagedCampaignName('harmonização',campaigns),null);
  assert.equal(matchManagedCampaignName('Harmonização de Glúteos',campaigns),'Harmonização de Glúteos');
  assert.ok(['Harmonização Mamas','Harmonização de Mamas'].includes(matchManagedCampaignName('harmonização de mamas',campaigns)));
  assert.equal(matchManagedCampaignName('Botox e harmonização de mamas',campaigns),null);
  assert.equal(matchManagedCampaignName('botoxina',campaigns),null);
});
test('abertura Glúteos Perfeitos passa a selecionar a segunda mensagem correta da recepção',()=>{
  const campaign = campaignFromPrefilledMetaLeadMessage(openings[0][0],'SBC');
  const config={libraryUserId:WELCOME_LIBRARY_USER_ID,greeting:DEFAULT_WELCOME_GREETING,replyIds:{'gluteos-perfeito':'gluteos','harmonizacao-mamas':'mamas'}};
  const replies=[['gluteos','Glúteos Perfeitos','Qual região dos glúteos?'],['mamas','Harmonização de Mamas','Qual região das mamas?']].map(([id,title,content])=>({id,title,content,userId:WELCOME_LIBRARY_USER_ID,category:{title,campaignName:null,userId:WELCOME_LIBRARY_USER_ID}}));
  const pair=welcomePair(config,campaign.campaignName,replies,'SBC');
  assert.equal(pair.replyId,'gluteos');assert.equal(pair.question,'Qual região dos glúteos?');
});
