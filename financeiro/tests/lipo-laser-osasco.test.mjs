import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { OSASCO_LIPO_LASER_SOURCE_URLS, LIPO_LASER_CAMPAIGN_NAME as standard, LIPO_LASER_2_CAMPAIGN_NAME as pack, lipoLaserCampaignFromSourceUrl, lipoLaserCampaignFromAdId } from '../src/lib/lipo-laser-campaigns.ts';
import { campaignFromPrefilledMetaLeadMessage, campaignNameFromExactMetaSourceUrl, campaignNameFromMetaAdAndTrackSignals, campaignNameFromExactMetaAdId } from '../src/lib/campaign-track-mapping.ts';
import { inferCampaignByKeywords } from '../src/lib/campaign-attribution.ts';

test('reconhece criativos públicos de 699 somente em Osasco, incluindo links curtos', () => {
  for (const url of OSASCO_LIPO_LASER_SOURCE_URLS) {
    assert.equal(lipoLaserCampaignFromSourceUrl(url, ' Osasco '), standard, url);
    assert.equal(campaignNameFromExactMetaSourceUrl(url, 'Osasco'), standard);
    assert.equal(campaignNameFromMetaAdAndTrackSignals('120253281469150494', null, url, 'Osasco'), standard);
    for (const unit of ['SBC', 'SCS', 'Todas', null]) assert.equal(lipoLaserCampaignFromSourceUrl(url, unit), null);
  }
  assert.equal(lipoLaserCampaignFromSourceUrl('https://instagram.com/virtuosaosasco/p/Dei6oHkAR7n/?igsh=teste', 'Osasco'), standard);
  assert.equal(lipoLaserCampaignFromSourceUrl('https://m.facebook.com/story.php?id=100095423860776&story_fbid=1415454654978650', 'Osasco'), standard);
});

test('não usa ID compartilhado, links parecidos, host falso ou token isolado', () => {
  assert.equal(lipoLaserCampaignFromAdId('120253281469150494', 'Osasco'), null);
  assert.equal(campaignNameFromMetaAdAndTrackSignals('120253281469150494', null, null, 'Osasco'), null);
  for (const url of ['Dei6oHkAR7n', 'https://evil.test/p/Dei6oHkAR7n/', 'https://instagram.com.evil.test/p/Dei6oHkAR7n/', 'https://www.instagram.com/p/Dei6oHkAR7n-extra/', 'https://www.instagram.com/p/outro/?ref=Dei6oHkAR7n', 'ftp://www.instagram.com/p/Dei6oHkAR7n/', 'https://fb.me/4oiTvM2bA-extra', 'https://www.facebook.com/story.php?story_fbid=1415454654978651']) {
    assert.equal(lipoLaserCampaignFromSourceUrl(url, 'Osasco'), null, url);
  }
});

test('preserva Emagreça 2 KG de Osasco e os IDs de SBC isolados', () => {
  assert.equal(campaignNameFromExactMetaAdId('120253025931420494', 'Osasco'), 'Emagreça 2 KG');
  assert.equal(campaignFromPrefilledMetaLeadMessage('Olá! Vim pela EMAGREÇA 2KG, posso ter mais informações sobre isso?', 'Osasco'), null);
  for (const id of ['120250557434650006', '120250557635720006']) assert.equal(campaignNameFromExactMetaAdId(id, 'Osasco'), null);
});

test('habilita pacote pela abertura específica e preço explícito sem inventar ID', () => {
  assert.deepEqual(campaignFromPrefilledMetaLeadMessage('Olá! Vim pelas 5 SESSÕES DE LIPO LASER, posso ter mais informações sobre isso?', 'Osasco'), { campaignName: pack, campaignTrackId: null });
  assert.equal(inferCampaignByKeywords('Lipo Laser R$ 699,00 gordura localizada', 'Osasco'), standard);
  assert.equal(inferCampaignByKeywords('Lipo Laser 5 sessões R$ 2.999,00', 'Osasco'), pack);
  assert.equal(campaignFromPrefilledMetaLeadMessage('Quero saber mais sobre o Lipo Laser!', 'Osasco'), null);
});

test('webhook prioriza o criativo Lipo Laser sobre texto genérico predefinido', async () => {
  const source = await readFile(new URL('../src/app/api/whatsapp/webhook/route.ts', import.meta.url), 'utf8');
  assert.match(source, /const confirmedLipoLaserCampaign = lipoLaserCampaignFromAdId\(adId, leadUnit\)\s*\|\| lipoLaserCampaignFromSourceUrl\(adSourceUrl, leadUnit\)/);
  assert.match(source, /const explicitCampaignName = confirmedLipoLaserCampaign \|\| prefilledMetaCampaign/);
});
