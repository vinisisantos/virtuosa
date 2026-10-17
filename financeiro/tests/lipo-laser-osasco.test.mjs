import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { OSASCO_LIPO_LASER_SOURCE_URLS, OSASCO_LIPO_LASER_AD_ID, LIPO_LASER_CAMPAIGN_NAME as standard, lipoLaserCampaignFromSourceUrl, lipoLaserCampaignFromAdId } from '../src/lib/lipo-laser-campaigns.ts';
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

test('não aceita links parecidos, host falso ou token isolado', () => {
  for (const url of ['Dei6oHkAR7n', 'https://evil.test/p/Dei6oHkAR7n/', 'https://instagram.com.evil.test/p/Dei6oHkAR7n/', 'https://www.instagram.com/p/Dei6oHkAR7n-extra/', 'https://www.instagram.com/p/outro/?ref=Dei6oHkAR7n', 'ftp://www.instagram.com/p/Dei6oHkAR7n/', 'https://fb.me/4oiTvM2bA-extra', 'https://www.facebook.com/story.php?story_fbid=1415454654978651']) {
    assert.equal(lipoLaserCampaignFromSourceUrl(url, 'Osasco'), null, url);
  }
});

test('preserva Emagreça 2 KG de Osasco e os IDs de SBC isolados', () => {
  assert.equal(campaignNameFromExactMetaAdId('120253025931420494', 'Osasco'), 'Emagreça 2 KG');
  assert.equal(campaignFromPrefilledMetaLeadMessage('Olá! Vim pela EMAGREÇA 2KG, posso ter mais informações sobre isso?', 'Osasco'), null);
  for (const id of ['120250557434650006', '120250557635720006']) assert.equal(campaignNameFromExactMetaAdId(id, 'Osasco'), null);
});

test('reconhece somente a oferta ativa de Osasco e preserva o pacote de SBC', () => {
  assert.equal(campaignFromPrefilledMetaLeadMessage('Olá! Vim pelas 5 SESSÕES DE LIPO LASER, posso ter mais informações sobre isso?', 'Osasco'), null);
  assert.equal(inferCampaignByKeywords('Lipo Laser R$ 699,00 gordura localizada', 'Osasco'), standard);
  assert.equal(inferCampaignByKeywords('Lipo Laser 5 sessões R$ 2.999,00', 'Osasco'), null);
  assert.deepEqual(campaignFromPrefilledMetaLeadMessage('Quero saber mais sobre o Lipo Laser!', 'Osasco'), { campaignName: standard, campaignTrackId: null });
  assert.equal(campaignFromPrefilledMetaLeadMessage('Ela disse: Quero saber mais sobre o Lipo Laser!', 'Osasco'), null);
  assert.equal(campaignFromPrefilledMetaLeadMessage('Quero saber mais sobre o Lipo Laser 2!', 'Osasco'), null);
});

test('ID informado e criativos comprovados identificam Lipo Laser 699 somente em Osasco', () => {
  assert.equal(lipoLaserCampaignFromAdId(OSASCO_LIPO_LASER_AD_ID, 'Osasco'), standard);
  assert.equal(campaignNameFromMetaAdAndTrackSignals(OSASCO_LIPO_LASER_AD_ID, null, null, 'Osasco'), standard);
  assert.equal(campaignNameFromMetaAdAndTrackSignals(null, OSASCO_LIPO_LASER_AD_ID, null, 'Osasco'), standard);
  for (const unit of ['SBC', 'SCS', 'Todas', null]) assert.equal(lipoLaserCampaignFromAdId(OSASCO_LIPO_LASER_AD_ID, unit), null);
});

test('webhook prioriza o criativo Lipo Laser sobre texto genérico predefinido', async () => {
  const source = await readFile(new URL('../src/app/api/whatsapp/webhook/route.ts', import.meta.url), 'utf8');
  assert.match(source, /const confirmedLipoLaserCampaign = lipoLaserCampaignFromAdId\(adId, leadUnit\)\s*\|\| lipoLaserCampaignFromSourceUrl\(adSourceUrl, leadUnit\)/);
  assert.match(source, /const explicitCampaignName = confirmedLipoLaserCampaign \|\| prefilledMetaCampaign/);
});
