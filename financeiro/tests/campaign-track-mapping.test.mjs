import assert from "node:assert/strict";
import test from "node:test";

import {
  ADEUS_ROSTO_CANSADO_CAMPAIGN_NAME,
  ADEUS_ROSTO_CANSADO_PARENT_CAMPAIGN_ID,
  COMBO_HARMONIZACAO_CAMPAIGN_NAME,
  COMBO_HARMONIZACAO_OSASCO_PARENT_CAMPAIGN_ID,
  COMBO_HARMONIZACAO_PARENT_CAMPAIGN_ID,
  campaignFromPrefilledMetaLeadMessage,
  campaignNameFromMetaAdAndTrackSignals,
  campaignNameFromMetaSignals,
  GLUTEOS_PERFEITOS_120ML_CAMPAIGN_NAME,
  GLUTEOS_PERFEITOS_120ML_PARENT_CAMPAIGN_ID,
  GLUTEOS_PERFEITOS_120ML_SBC_PARENT_CAMPAIGN_ID,
  HARMONIZACAO_DE_MAMAS_CAMPAIGN_NAME,
  HARMONIZACAO_DE_MAMAS_OSASCO_PARENT_CAMPAIGN_ID,
  HARMONIZACAO_DE_MAMAS_SCS_PARENT_CAMPAIGN_ID,
} from "../src/lib/campaign-track-mapping.ts";

const exactAdCases = [
  ["Osasco", HARMONIZACAO_DE_MAMAS_OSASCO_PARENT_CAMPAIGN_ID, HARMONIZACAO_DE_MAMAS_CAMPAIGN_NAME],
  ["SCS", HARMONIZACAO_DE_MAMAS_SCS_PARENT_CAMPAIGN_ID, HARMONIZACAO_DE_MAMAS_CAMPAIGN_NAME],
  ["Osasco", "120249502709450006", "Preenchimento Facial"],
  ["Osasco", "120249502628370006", "Glúteo Perfeito"],
  ["Osasco", "120249502294110006", "Harmonização de Glúteos"],
  ["Osasco", "120249500621590006", "Barriga Trincada"],
  ["Osasco", "120251954844540494", "Glúteo Perfeito"],
  ["Osasco", "120249321672810006", "Glúteo Perfeito"],
  ["Osasco", "120251954010740494", "Harmonização de Glúteos"],
  ["Osasco", "120249321848920006", "Harmonização de Glúteos"],
  ["Osasco", "120252124600900494", "Glúteo Perfeito"],
  ["SBC", "120249304650490006", "Glúteo Perfeito"],
  ["SBC", "120247237450560077", "Glúteo Perfeito"],
  ["SBC", "120247237187760077", "Harmonização de Glúteos"],
  ["SCS", "120249007495800109", "Glúteo Perfeito"],
  ["SCS", "120249310857190006", "Glúteo Perfeito"],
  ["SCS", "120249007079190109", "Harmonização de Glúteos"],
  ["SCS", "120249321328780006", "Harmonização de Glúteos"],
];

test("classifica anúncios canônicos pelo ID oficial e unidade", () => {
  for (const [unit, adId, expectedCampaign] of exactAdCases) {
    assert.equal(
      campaignNameFromMetaSignals(adId, null, unit),
      expectedCampaign,
      `${unit}: ${adId}`,
    );
  }
});

test("não aplica o ID de anúncio canônico em outra unidade", () => {
  for (const adId of [
    "120249502709450006",
    "120249502628370006",
    "120249502294110006",
    "120249500621590006",
  ]) {
    assert.equal(campaignNameFromMetaSignals(adId, null, "SBC"), null);
    assert.equal(campaignNameFromMetaSignals(adId, null, "SCS"), null);
  }
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

test("classifica todos os criativos do novo ID Glúteo Perfeito de Osasco", () => {
  assert.equal(
    campaignNameFromMetaSignals(
      "120252124600900494",
      "https://www.instagram.com/p/Db3lRdWgW46/",
      "Osasco",
    ),
    "Glúteo Perfeito",
  );
  assert.equal(
    campaignNameFromMetaSignals(
      "120252124600900494",
      "https://www.instagram.com/p/Db3lYMIA3s4/",
      "Osasco",
    ),
    "Glúteo Perfeito",
  );
});

test("não propaga o novo ID de Osasco para outra unidade", () => {
  assert.equal(
    campaignNameFromMetaSignals(
      "120252124600900494",
      "https://www.instagram.com/p/Db3lRdWgW46/",
      "SBC",
    ),
    null,
  );
});

test("prioriza o anúncio específico quando a Graph devolve apenas a campanha pai", () => {
  assert.equal(
    campaignNameFromMetaAdAndTrackSignals(
      "120249502628370006",
      "120249500621580006",
      null,
      "Osasco",
    ),
    "Glúteo Perfeito",
  );
});

test("prioriza o link abdominal quando a Meta reutiliza o ID de Glúteo Perfeito", () => {
  for (const sourceUrl of [
    "https://www.instagram.com/p/Db313GhAjB3/",
    "https://www.instagram.com/p/DcT5vIkgtgJ/",
  ]) {
    assert.equal(
      campaignNameFromMetaAdAndTrackSignals(
        "120249502628370006",
        "120249500621580006",
        sourceUrl,
        "Osasco",
      ),
      "Barriga Trincada",
      sourceUrl,
    );
  }
  assert.equal(
    campaignNameFromMetaSignals(
      "120249502628370006",
      "https://www.instagram.com/p/Db31upQgTld/",
      "Osasco",
    ),
    "Glúteo Perfeito",
  );
});

test("não propaga o link abdominal confirmado de Osasco para outra unidade", () => {
  for (const sourceUrl of [
    "https://www.instagram.com/p/Db313GhAjB3/",
    "https://www.instagram.com/p/DcT5vIkgtgJ/",
  ]) {
    assert.equal(
      campaignNameFromMetaSignals(
        "120249502628370006",
        sourceUrl,
        "SBC",
      ),
      null,
      sourceUrl,
    );
  }
});

test("prioriza os criativos Glúteos Perfeitos 120ml sobre a campanha pai de Osasco", () => {
  for (const sourceUrl of [
    "https://www.instagram.com/p/DcT5vGtAFVs/",
    "https://www.instagram.com/p/DcT5t79AF2R/",
    "https://fb.me/6hDnjnq1V",
    "https://fb.me/blVsIofjH",
    "https://web.facebook.com/story.php?story_fbid=1309185502272233&id=100095423860776",
    "https://fb.me/4U5nMuofc",
    "https://www.facebook.com/story.php?story_fbid=1310594035464713&id=100095423860776",
  ]) {
    assert.equal(
      campaignNameFromMetaAdAndTrackSignals(
        null,
        "120249766005370006",
        sourceUrl,
        "Osasco",
      ),
      GLUTEOS_PERFEITOS_120ML_CAMPAIGN_NAME,
      sourceUrl,
    );
  }
});

test("reconhece os criativos 120ml compartilhados nas três unidades", () => {
  for (const sourceUrl of [
    "https://www.instagram.com/p/DcT5vGtAFVs/",
    "https://fb.me/blVsIofjH",
    "https://web.facebook.com/story.php?story_fbid=1309185502272233&id=100095423860776",
    "https://fb.me/4U5nMuofc",
    "https://www.facebook.com/story.php?story_fbid=1310594035464713&id=100095423860776",
  ]) {
    for (const unit of ["Osasco", "SBC", "SCS"]) {
      assert.equal(
        campaignNameFromMetaSignals(null, sourceUrl, unit),
        GLUTEOS_PERFEITOS_120ML_CAMPAIGN_NAME,
        `${unit}: ${sourceUrl}`,
      );
    }
  }
});

test("prioriza o criativo Glúteos Perfeitos 120ml confirmado de SBC", () => {
  for (const sourceUrl of [
    "https://fb.me/8SMTimx6y",
    "https://www.facebook.com/story.php?story_fbid=1105442545165051&id=100070979479157",
  ]) {
    assert.equal(
      campaignNameFromMetaAdAndTrackSignals(
        null,
        GLUTEOS_PERFEITOS_120ML_SBC_PARENT_CAMPAIGN_ID,
        sourceUrl,
        "SBC",
      ),
      GLUTEOS_PERFEITOS_120ML_CAMPAIGN_NAME,
      sourceUrl,
    );
  }
});

test("reconhece o criativo 120ml de SBC nas três unidades", () => {
  for (const unit of ["Osasco", "SBC", "SCS"]) {
    assert.equal(
      campaignNameFromMetaSignals(
        null,
        "https://fb.me/8SMTimx6y",
        unit,
      ),
      GLUTEOS_PERFEITOS_120ML_CAMPAIGN_NAME,
      unit,
    );
  }
});

test("prioriza o criativo facial confirmado de SBC sobre a campanha pai", () => {
  assert.equal(
    campaignNameFromMetaAdAndTrackSignals(
      null,
      "120249699105390006",
      "https://www.instagram.com/p/DcL-MELAE2a/",
      "SBC",
    ),
    "Preenchimento Facial",
  );
});

test("não propaga o criativo facial confirmado de SBC para outra unidade", () => {
  assert.equal(
    campaignNameFromMetaSignals(
      "120249699105390006",
      "https://www.instagram.com/p/DcL-MELAE2a/",
      "Osasco",
    ),
    null,
  );
});

test("prioriza o criativo Combo Harmonização de SBC sobre a campanha pai", () => {
  assert.equal(
    campaignNameFromMetaAdAndTrackSignals(
      null,
      COMBO_HARMONIZACAO_PARENT_CAMPAIGN_ID,
      "https://www.instagram.com/p/DcWM0DjgNHg/",
      "SBC",
    ),
    COMBO_HARMONIZACAO_CAMPAIGN_NAME,
  );
});

test("reconhece o criativo Combo Harmonização nas três unidades", () => {
  for (const unit of ["Osasco", "SBC", "SCS"]) {
    assert.equal(
      campaignNameFromMetaSignals(
        null,
        "https://www.instagram.com/p/DcWM0DjgNHg/",
        unit,
      ),
      COMBO_HARMONIZACAO_CAMPAIGN_NAME,
      unit,
    );
  }
});

test("reconhece o criativo Combo Harmonização específico de SCS", () => {
  assert.equal(
    campaignNameFromMetaSignals(
      null,
      "https://www.instagram.com/p/DcWL3aTAEzs/",
      "SCS",
    ),
    COMBO_HARMONIZACAO_CAMPAIGN_NAME,
  );
});

test("prioriza o criativo Adeus Rosto Cansado de SBC sobre a campanha pai", () => {
  assert.equal(
    campaignNameFromMetaAdAndTrackSignals(
      null,
      ADEUS_ROSTO_CANSADO_PARENT_CAMPAIGN_ID,
      "https://www.instagram.com/p/DcWNr8zgApx/",
      "SBC",
    ),
    ADEUS_ROSTO_CANSADO_CAMPAIGN_NAME,
  );
});

test("reconhece o criativo Adeus Rosto Cansado nas três unidades", () => {
  for (const unit of ["Osasco", "SBC", "SCS"]) {
    assert.equal(
      campaignNameFromMetaSignals(
        null,
        "https://www.instagram.com/p/DcWNr8zgApx/",
        unit,
      ),
      ADEUS_ROSTO_CANSADO_CAMPAIGN_NAME,
      unit,
    );
  }
});

test("não transforma a campanha pai de Osasco em um procedimento", () => {
  assert.equal(
    campaignNameFromMetaSignals("120249500621580006", null, "Osasco"),
    null,
  );
});

test("reconhece o post Harmonização de Mamas nas três unidades", () => {
  for (const unit of ["Osasco", "SBC", "SCS"]) {
    assert.equal(
      campaignNameFromMetaSignals(
        null,
        "https://www.instagram.com/p/Dc2YOMms4wI/",
        unit,
      ),
      HARMONIZACAO_DE_MAMAS_CAMPAIGN_NAME,
      unit,
    );
  }
});

test("não aplica o post Harmonização de Mamas fora das unidades ativas", () => {
  assert.equal(
    campaignNameFromMetaSignals(
      null,
      "https://www.instagram.com/p/Dc2YOMms4wI/",
      "Barueri",
    ),
    null,
  );
});

test("prioriza Harmonização de Mamas sobre o nome genérico devolvido pela Meta em SCS", () => {
  assert.equal(
    campaignNameFromMetaAdAndTrackSignals(
      null,
      HARMONIZACAO_DE_MAMAS_SCS_PARENT_CAMPAIGN_ID,
      "https://www.instagram.com/p/Dc2YOMms4wI/",
      "SCS",
    ),
    HARMONIZACAO_DE_MAMAS_CAMPAIGN_NAME,
  );
});

test("recupera a campanha 120ml pela mensagem CTWA predefinida quando a Meta omite o anúncio", () => {
  assert.deepEqual(
    campaignFromPrefilledMetaLeadMessage(
      "Olá! Vim pelo GLÚTEOS PERFEITOS 120ML, posso ter mais informações sobre isso?",
      "Osasco",
    ),
    {
      campaignName: GLUTEOS_PERFEITOS_120ML_CAMPAIGN_NAME,
      campaignTrackId: GLUTEOS_PERFEITOS_120ML_PARENT_CAMPAIGN_ID,
    },
  );
});

test("recupera a campanha 120ml de SBC pela mensagem CTWA predefinida", () => {
  const message = "Vim pelo Glúteos Perfeitos 120 ml";
  assert.deepEqual(
    campaignFromPrefilledMetaLeadMessage(message, "SBC"),
    {
      campaignName: GLUTEOS_PERFEITOS_120ML_CAMPAIGN_NAME,
      campaignTrackId: GLUTEOS_PERFEITOS_120ML_SBC_PARENT_CAMPAIGN_ID,
    },
  );
});

test("classifica 120ml em SCS sem inventar um ID de campanha", () => {
  const message = "Vim pelo Glúteos Perfeitos 120 ml";
  assert.deepEqual(campaignFromPrefilledMetaLeadMessage(message, "SCS"), {
    campaignName: GLUTEOS_PERFEITOS_120ML_CAMPAIGN_NAME,
    campaignTrackId: null,
  });
});

test("não classifica uma conversa comum que apenas menciona glúteos 120ml", () => {
  assert.equal(
    campaignFromPrefilledMetaLeadMessage(
      "Você consegue me explicar como funcionam os 120ml nos glúteos?",
      "Osasco",
    ),
    null,
  );
});

test("recupera Combo Harmonização pela mensagem predefinida quando a Meta omite o anúncio", () => {
  assert.deepEqual(
    campaignFromPrefilledMetaLeadMessage(
      "Olá! Vim pelo COMBO HARMONIZAÇÃO, posso ter mais informações sobre isso?",
      "SBC",
    ),
    {
      campaignName: COMBO_HARMONIZACAO_CAMPAIGN_NAME,
      campaignTrackId: COMBO_HARMONIZACAO_PARENT_CAMPAIGN_ID,
    },
  );
});

test("aplica o fallback textual Combo Harmonização nas três unidades", () => {
  const message = "Olá! Vim pelo COMBO HARMONIZAÇÃO, posso ter mais informações sobre isso?";
  assert.deepEqual(campaignFromPrefilledMetaLeadMessage(message, "Osasco"), {
    campaignName: COMBO_HARMONIZACAO_CAMPAIGN_NAME,
    campaignTrackId: COMBO_HARMONIZACAO_OSASCO_PARENT_CAMPAIGN_ID,
  });
  assert.deepEqual(campaignFromPrefilledMetaLeadMessage(message, "SCS"), {
    campaignName: COMBO_HARMONIZACAO_CAMPAIGN_NAME,
    campaignTrackId: null,
  });
});

test("não classifica uma conversa comum que apenas menciona combo harmonização", () => {
  assert.equal(
    campaignFromPrefilledMetaLeadMessage(
      "Você pode me explicar se existe um combo de harmonização?",
      "SBC",
    ),
    null,
  );
});

test("recupera Adeus Rosto Cansado pela mensagem predefinida quando a Meta omite o anúncio", () => {
  assert.deepEqual(
    campaignFromPrefilledMetaLeadMessage(
      "Olá! Vim pelo ADEUS ROSTO CANSADO, posso ter mais informações sobre isso?",
      "SBC",
    ),
    {
      campaignName: ADEUS_ROSTO_CANSADO_CAMPAIGN_NAME,
      campaignTrackId: ADEUS_ROSTO_CANSADO_PARENT_CAMPAIGN_ID,
    },
  );
});

test("aplica o fallback textual Adeus Rosto Cansado nas três unidades", () => {
  const message = "Olá! Vim pelo ADEUS ROSTO CANSADO, posso ter mais informações sobre isso?";
  assert.deepEqual(campaignFromPrefilledMetaLeadMessage(message, "Osasco"), {
    campaignName: ADEUS_ROSTO_CANSADO_CAMPAIGN_NAME,
    campaignTrackId: null,
  });
  assert.deepEqual(campaignFromPrefilledMetaLeadMessage(message, "SCS"), {
    campaignName: ADEUS_ROSTO_CANSADO_CAMPAIGN_NAME,
    campaignTrackId: null,
  });
});

test("não classifica conversa comum que apenas menciona rosto cansado", () => {
  assert.equal(
    campaignFromPrefilledMetaLeadMessage(
      "Meu rosto parece cansado; qual tratamento vocês indicam?",
      "SBC",
    ),
    null,
  );
});

test("recupera Harmonização de Mamas pela mensagem CTWA nas três unidades", () => {
  const message = "Olá! Vim pela HARMONIZAÇÃO DE MAMAS, posso ter mais informações sobre isso?";

  assert.deepEqual(campaignFromPrefilledMetaLeadMessage(message, "Osasco"), {
    campaignName: HARMONIZACAO_DE_MAMAS_CAMPAIGN_NAME,
    campaignTrackId: HARMONIZACAO_DE_MAMAS_OSASCO_PARENT_CAMPAIGN_ID,
  });
  assert.deepEqual(campaignFromPrefilledMetaLeadMessage(message, "SCS"), {
    campaignName: HARMONIZACAO_DE_MAMAS_CAMPAIGN_NAME,
    campaignTrackId: HARMONIZACAO_DE_MAMAS_SCS_PARENT_CAMPAIGN_ID,
  });
  assert.deepEqual(campaignFromPrefilledMetaLeadMessage(message, "SBC"), {
    campaignName: HARMONIZACAO_DE_MAMAS_CAMPAIGN_NAME,
    campaignTrackId: null,
  });
});

test("não classifica conversa comum que apenas menciona harmonização de mamas", () => {
  assert.equal(
    campaignFromPrefilledMetaLeadMessage(
      "Como funciona a harmonização de mamas?",
      "SCS",
    ),
    null,
  );
});
