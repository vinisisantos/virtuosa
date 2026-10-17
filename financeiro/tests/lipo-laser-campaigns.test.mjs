import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { LIPO_LASER_CAMPAIGN_NAME as standard, LIPO_LASER_2_CAMPAIGN_NAME as pack, LIPO_LASER_AD_ID as standardId, LIPO_LASER_2_AD_ID as packId, lipoLaserCampaignFromAdId, lipoLaserCampaignFromPrefilledMessage, lipoLaserCampaignFromOfferSignal } from '../src/lib/lipo-laser-campaigns.ts';
import { campaignFromPrefilledMetaLeadMessage, campaignNameFromExactMetaAdId, campaignNameFromMetaAdAndTrackSignals } from '../src/lib/campaign-track-mapping.ts';
import { inferCampaignByKeywords, matchManagedCampaignName } from '../src/lib/campaign-attribution.ts';
import { filterSavedRepliesByCampaign, buildSavedReplyCampaignOptions } from '../src/lib/whatsapp/saved-replies.ts';
import { LIPO_LASER_SAVED_REPLIES } from '../src/lib/whatsapp/lipo-laser-saved-replies.ts';

const openings = [
  ['Olá! Vim pela EMAGREÇA 2KG, posso ter mais informações sobre isso?', standard],
  ['Olá! Vim pelas 5 SESSÕES DE LIPO LASER, posso ter mais informações sobre isso?', pack],
];

test('classifica IDs confirmados de Lipo Laser apenas em SBC, sem herdar campanha pai', () => {
  for (const [id, name] of [[standardId, standard], [packId, pack]]) {
    assert.equal(lipoLaserCampaignFromAdId(id, ' sbc '), name);
    assert.equal(campaignNameFromExactMetaAdId(id, 'SBC'), name);
    assert.equal(campaignNameFromMetaAdAndTrackSignals(id, 'campanha-generica', null, 'SBC'), name);
    assert.equal(campaignNameFromMetaAdAndTrackSignals(null, id, null, 'SBC'), name);
    for (const unit of ['Osasco', 'SCS', 'Todas', null]) {
      assert.equal(lipoLaserCampaignFromAdId(id, unit), null);
      assert.equal(campaignNameFromMetaAdAndTrackSignals(id, null, null, unit), null);
    }
  }
});

test('recupera as duas aberturas exatas, incluindo pelas, sem inventar ID', () => {
  for (const [message, name] of openings) {
    assert.equal(lipoLaserCampaignFromPrefilledMessage(message, 'SBC'), name);
    assert.deepEqual(campaignFromPrefilledMetaLeadMessage(message, 'SBC'), { campaignName: name, campaignTrackId: null });
    for (const unit of ['SCS', 'Todas', null]) assert.equal(campaignFromPrefilledMetaLeadMessage(message, unit), null);
    assert.equal(campaignFromPrefilledMetaLeadMessage(message, 'Osasco'), null);
  }
  assert.equal(campaignFromPrefilledMetaLeadMessage('Oi! Eu vim pela Emagreça 2 KG, gostaria de saber mais', 'SBC')?.campaignName, standard);
});

test('não transforma menção casual, negação, outra quantidade ou texto truncado em abertura', () => {
  for (const message of ['Quero emagrecer 2kg', 'Não vim pela EMAGREÇA 2KG', 'Ela disse: vim pelas 5 SESSÕES DE LIPO LASER', 'Vim pelas 10 SESSÕES DE LIPO LASER', 'Vim pela EMAGREÇA 2KG não quero esse anúncio', 'Olá! Vim pelas 5 SESSÕES DE LIPO LASER 10']) {
    assert.equal(lipoLaserCampaignFromPrefilledMessage(message, 'SBC'), null, message);
  }
});

test('distingue os preços com a tecnologia explícita, antes de gordura localizada', () => {
  for (const [signal, expected] of [['LIPO LASER | Gordura localizada | R$ 699,00', standard], ['LIPO LASER 5 sessões + 5 drenagens R$ 2.999,00', pack], ['Lipo Laser por 2999', pack]]) {
    assert.equal(lipoLaserCampaignFromOfferSignal(signal, 'SBC'), expected);
    assert.equal(inferCampaignByKeywords(signal, 'SBC'), expected);
    assert.equal(lipoLaserCampaignFromOfferSignal(signal, 'Osasco'), expected === standard ? standard : null);
    assert.equal(lipoLaserCampaignFromOfferSignal(signal, 'SCS'), null);
  }
  for (const signal of ['Lipo Laser', 'Lipo Laser R$ 699,00 ou R$ 2.999,00', 'Botox R$ 699,00', 'Lipo Laser R$ 1699,00', 'Lipo Laser R$ 2.699,00', 'Lipo Laser R$ 12.999,00', 'Lipo Laser R$ 699,90']) assert.equal(lipoLaserCampaignFromOfferSignal(signal, 'SBC'), null, signal);
});

test('não aproxima os nomes das duas ofertas ignorando o número 2', () => {
  const campaigns = [{ name: standard }, { name: pack }];
  for (const signal of ['LIPO LASER', 'LIPO LASER 2', 'LIPO LASER GORDURA LOCALIZADA']) assert.equal(matchManagedCampaignName(signal, campaigns), null);
});

test('filtra respostas de cada oferta, preservando globais e sem misturar Emagreça de Osasco', () => {
  const categories = [{ id: 'standard', title: standard, campaignName: standard }, { id: 'pack', title: pack, campaignName: pack }, { id: 'old', title: 'Emagreça 2 KG', campaignName: 'Emagreça 2 KG' }];
  const replies = [{ id: 'global', categoryId: null }, ...categories.map(category => ({ id: category.id, categoryId: category.id }))];
  assert.deepEqual(filterSavedRepliesByCampaign(replies, standard, categories).map(row => row.id), ['global', 'standard']);
  assert.deepEqual(filterSavedRepliesByCampaign(replies, pack, categories).map(row => row.id), ['global', 'pack']);
  assert.equal(buildSavedReplyCampaignOptions(categories.map(category => ({ name: category.campaignName, unit: 'SBC' }))).length, 3);
});

test('webhook dá prioridade ao ID confirmado somente no caso Lipo Laser', async () => {
  const route = await readFile(new URL('../src/app/api/whatsapp/webhook/route.ts', import.meta.url), 'utf8');
  assert.match(route, /const confirmedLipoLaserCampaign = lipoLaserCampaignFromAdId\(adId, leadUnit\)/);
  assert.match(route, /const explicitCampaignName = confirmedLipoLaserCampaign \|\| prefilledMetaCampaign/);
  assert.match(route, /const canonicalAdCampaignName = confirmedLipoLaserCampaign \|\| exactSourceCampaignName/);
});

test('prepara somente seis respostas específicas e usa o parcelamento confirmado', () => {
  assert.equal(LIPO_LASER_SAVED_REPLIES.length, 6);
  assert.equal(LIPO_LASER_SAVED_REPLIES.filter(reply => reply.campaignName === standard).length, 3);
  assert.equal(LIPO_LASER_SAVED_REPLIES.filter(reply => reply.campaignName === pack).length, 3);
  for (const reply of LIPO_LASER_SAVED_REPLIES) {
    assert.doesNotMatch(reply.title, /sauda[çc][ãa]o|localiza[çc][ãa]o|hor[aá]rio|p[oó]s.avalia[çc][ãa]o/i);
    assert.doesNotMatch(reply.content, /174[,.]91|sem juros|perca 2kg/i);
  }
  const price = LIPO_LASER_SAVED_REPLIES.find(reply => reply.campaignName === pack && /VALOR/.test(reply.title));
  assert.match(price.content, /R\$ 2\.999,00 ou 12x de R\$ 249,92/);
  assert.match(LIPO_LASER_SAVED_REPLIES.find(reply => reply.campaignName === standard && /VALOR/.test(reply.title)).content, /R\$ 699,00/);
});

test('mantém o mapa importável por scripts Node sem hook de aliases', () => {
  const url = new URL('../src/lib/campaign-track-mapping.ts', import.meta.url).href;
  const output = execFileSync(process.execPath, ['--no-warnings', '--experimental-strip-types', '--input-type=module', '-e', `const mapping = await import(${JSON.stringify(url)}); process.stdout.write(mapping.campaignNameFromExactMetaAdId('120250557635720006', 'SBC'));`], { encoding: 'utf8' });
  assert.equal(output, pack);
});
