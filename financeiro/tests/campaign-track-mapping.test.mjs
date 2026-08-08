import assert from "node:assert/strict";
import test from "node:test";

import { campaignNameFromMetaSignals } from "../src/lib/campaign-track-mapping.ts";

const exactAdCases = [
  ["Osasco", "120251954844540494", "Glúteo Perfeito"],
  ["Osasco", "120249321672810006", "Glúteo Perfeito"],
  ["Osasco", "120251954010740494", "Harmonização de Glúteos"],
  ["Osasco", "120249321848920006", "Harmonização de Glúteos"],
  ["SBC", "120249304650490006", "Glúteo Perfeito"],
  ["SBC", "120247237450560077", "Glúteo Perfeito"],
  ["SBC", "120247237187760077", "Harmonização de Glúteos"],
  ["SCS", "120249007495800109", "Glúteo Perfeito"],
  ["SCS", "120249310857190006", "Glúteo Perfeito"],
  ["SCS", "120249007079190109", "Harmonização de Glúteos"],
  ["SCS", "120249321328780006", "Harmonização de Glúteos"],
];

test("classifica anúncios de glúteos pelo ID oficial e unidade", () => {
  for (const [unit, adId, expectedCampaign] of exactAdCases) {
    assert.equal(
      campaignNameFromMetaSignals(adId, null, unit),
      expectedCampaign,
      `${unit}: ${adId}`,
    );
  }
});

test("não aplica o ID de anúncio canônico em outra unidade", () => {
  assert.equal(
    campaignNameFromMetaSignals("120251954844540494", null, "SBC"),
    null,
  );
});

test("preserva o reconhecimento legado por marcador do link", () => {
  assert.equal(
    campaignNameFromMetaSignals(
      "120246990006510077",
      "https://www.facebook.com/reel/DbEO4smg8Bp",
      "Osasco",
    ),
    "Preenchimento Facial",
  );
});
