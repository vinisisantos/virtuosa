import assert from "node:assert/strict";
import test from "node:test";

import {
  campaignAccountOriginFromTrackId,
  campaignNameFromAccountTrackId,
} from "../src/lib/campaign-account-origin.ts";

const NEW_OSASCO_BARRIGA_TRACK_ID = "120249500621590006";

test("identifica o novo anúncio de Barriga Trincada como conta secundária somente em Osasco", () => {
  assert.equal(campaignAccountOriginFromTrackId(NEW_OSASCO_BARRIGA_TRACK_ID, "Osasco"), "secondary");
  assert.equal(campaignAccountOriginFromTrackId(NEW_OSASCO_BARRIGA_TRACK_ID, "SBC"), null);
  assert.equal(campaignAccountOriginFromTrackId(NEW_OSASCO_BARRIGA_TRACK_ID, "SCS"), null);
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
