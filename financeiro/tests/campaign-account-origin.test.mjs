import assert from "node:assert/strict";
import test from "node:test";

import {
  campaignAccountOriginFromInstance,
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
const SBC_LEADS_INSTANCE_ID = "a6871ee7-8352-4b66-bfb2-b8dba9e4f8e3";
const SBC_COMMERCIAL_INSTANCE_ID = "b1977b09-5ce5-445c-8da8-11c805126a0c";
const SBC_FACIAL_SECONDARY_TRACK_ID = "120249699105390006";

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

test("identifica toda conversa da instância Leads SBC como conta secundária", () => {
  assert.equal(campaignAccountOriginFromInstance(SBC_LEADS_INSTANCE_ID, "SBC"), "secondary");
  assert.equal(campaignAccountOriginFromInstance(SBC_LEADS_INSTANCE_ID, "Osasco"), null);
  assert.equal(campaignAccountOriginFromInstance(SBC_LEADS_INSTANCE_ID, "SCS"), null);
});

test("identifica a nova campanha facial de SBC como conta secundária", () => {
  assert.equal(campaignAccountOriginFromTrackId(SBC_FACIAL_SECONDARY_TRACK_ID, "SBC"), "secondary");
  assert.equal(campaignAccountOriginFromTrackId(SBC_FACIAL_SECONDARY_TRACK_ID, "Osasco"), null);
  assert.equal(campaignAccountOriginFromTrackId(SBC_FACIAL_SECONDARY_TRACK_ID, "SCS"), null);
});

test("não altera a origem das conversas da instância Comercial SBC", () => {
  assert.equal(campaignAccountOriginFromInstance(SBC_COMMERCIAL_INSTANCE_ID, "SBC"), null);
  assert.equal(campaignAccountOriginFromInstance(null, "SBC"), null);
});
