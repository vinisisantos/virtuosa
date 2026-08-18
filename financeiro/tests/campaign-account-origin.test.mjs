import assert from "node:assert/strict";
import test from "node:test";

import {
  campaignAccountOriginFromTrackId,
  campaignNameFromAccountTrackId,
} from "../src/lib/campaign-account-origin.ts";

const NEW_OSASCO_BARRIGA_TRACK_ID = "120249500621590006";
const OSASCO_GLUTEO_PERFEITO_SECONDARY_TRACK_ID = "120252124600900494";
const OSASCO_SECONDARY_ACCOUNT_TRACK_IDS = [
  "120249500621580006",
  "120249502709450006",
  "120249502628370006",
  "120249502294110006",
  NEW_OSASCO_BARRIGA_TRACK_ID,
];

test("identifica a campanha e os quatro anúncios como conta secundária somente em Osasco", () => {
  for (const trackId of OSASCO_SECONDARY_ACCOUNT_TRACK_IDS) {
    assert.equal(campaignAccountOriginFromTrackId(trackId, "Osasco"), "secondary");
    assert.equal(campaignAccountOriginFromTrackId(trackId, "SBC"), null);
    assert.equal(campaignAccountOriginFromTrackId(trackId, "SCS"), null);
  }
});

test("não usa o ID pai compartilhado pelos anúncios como nome de procedimento", () => {
  assert.equal(campaignNameFromAccountTrackId("120249500621580006", "Osasco"), null);
});

test("identifica o novo anúncio de Barriga Trincada como conta secundária somente em Osasco", () => {
  assert.equal(campaignAccountOriginFromTrackId(NEW_OSASCO_BARRIGA_TRACK_ID, "Osasco"), "secondary");
  assert.equal(campaignAccountOriginFromTrackId(NEW_OSASCO_BARRIGA_TRACK_ID, "SBC"), null);
  assert.equal(campaignAccountOriginFromTrackId(NEW_OSASCO_BARRIGA_TRACK_ID, "SCS"), null);
});

test("identifica o conjunto confirmado de Glúteo Perfeito como conta secundária somente em Osasco", () => {
  assert.equal(
    campaignAccountOriginFromTrackId(OSASCO_GLUTEO_PERFEITO_SECONDARY_TRACK_ID, "Osasco"),
    "secondary",
  );
  assert.equal(
    campaignAccountOriginFromTrackId(OSASCO_GLUTEO_PERFEITO_SECONDARY_TRACK_ID, "SBC"),
    null,
  );
  assert.equal(
    campaignAccountOriginFromTrackId(OSASCO_GLUTEO_PERFEITO_SECONDARY_TRACK_ID, "SCS"),
    null,
  );
});

test("aplica o fallback de Barriga Trincada somente na unidade confirmada", () => {
  assert.equal(campaignNameFromAccountTrackId(NEW_OSASCO_BARRIGA_TRACK_ID, "Osasco"), "Barriga Trincada");
  assert.equal(campaignNameFromAccountTrackId(NEW_OSASCO_BARRIGA_TRACK_ID, "SBC"), null);
  assert.equal(campaignNameFromAccountTrackId(NEW_OSASCO_BARRIGA_TRACK_ID), null);
});

test("preserva o marcador histórico de Barriga Trincada de Osasco", () => {
  assert.equal(campaignAccountOriginFromTrackId("120248887107550006", "Osasco"), "secondary");
  assert.equal(campaignNameFromAccountTrackId("120248887107550006", "Osasco"), "Barriga Trincada");
});
