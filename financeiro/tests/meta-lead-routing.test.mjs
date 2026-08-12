import assert from "node:assert/strict";
import test from "node:test";

import { osascoMetaLeadCampaignFromAdId } from "../src/lib/meta-lead-routing.ts";

const cases = [
  ["120249502709450006", "Preenchimento Facial"],
  ["120249502628370006", "Glúteo Perfeito"],
  ["120249502294110006", "Harmonização de Glúteos"],
  ["120249500621590006", "Barriga Trincada"],
];

test("roteia formulários de Osasco pelos anúncios oficiais", () => {
  for (const [adId, expectedCampaignName] of cases) {
    const route = osascoMetaLeadCampaignFromAdId(adId);
    assert.equal(route?.campaignName, expectedCampaignName);
    assert.equal(route?.messageCampaignName, expectedCampaignName);
    assert.match(route?.eventTypeBase || "", /^meta_lead_[a-z0-9_]+$/);
  }
});

test("não inventa rota para ID pai ou anúncio desconhecido", () => {
  assert.equal(osascoMetaLeadCampaignFromAdId("120249500621580006"), null);
  assert.equal(osascoMetaLeadCampaignFromAdId("desconhecido"), null);
});
