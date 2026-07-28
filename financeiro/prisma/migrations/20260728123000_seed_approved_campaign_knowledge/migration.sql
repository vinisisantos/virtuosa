DO $$
BEGIN
  IF to_regclass('public."AiTrainingCampaignCreative"') IS NULL THEN
    RAISE EXCEPTION 'AiTrainingCampaignCreative precisa existir antes da carga de campanhas';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "User"
    WHERE "email" = 'viniciusn11@hotmail.com'
      AND "isActive" = TRUE
  ) THEN
    RAISE EXCEPTION 'Administrador responsavel pela aprovacao nao encontrado';
  END IF;
END $$;

DROP TABLE IF EXISTS "_tmpApprovedCampaignKnowledge";

CREATE TEMP TABLE "_tmpApprovedCampaignKnowledge" (
  "campaignName" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "imageSizeBytes" INTEGER NOT NULL,
  "caption" TEXT,
  "snapshot" JSONB NOT NULL
);

INSERT INTO "_tmpApprovedCampaignKnowledge" (
  "campaignName",
  "fileName",
  "imageSizeBytes",
  "caption",
  "snapshot"
) VALUES
(
  'Botox',
  'botox.png',
  1270557,
  $caption$BOTOX - Quer um rosto mais jovem e descansado já nas primeiras aplicações?
O nosso Botox ajuda a suavizar linhas de expressão e melhorar a aparência da pele com naturalidade e segurança.
✨ Suaviza linhas de expressão
💆‍♀️ Melhora o aspecto do rosto rapidamente
💉 Procedimento com avaliação profissional personalizada
A partir de R$ 699,90
📲 Chame agora no WhatsApp e garanta essa condição especial!$caption$,
  $snapshot${
    "headline": "Botox Virtuosa",
    "visibleText": "BOTOX VIRTUOSA. A partir de R$ 699,90. Reduza os sinais do envelhecimento. Suavize as ruguinhas. Agende sua avaliação gratuita.",
    "visualDescription": "Peça rosa da Virtuosa com modelo em avaliação facial por profissional usando luvas.",
    "procedures": ["Toxina botulínica facial"],
    "offerSummary": "Aplicação de toxina botulínica facial com avaliação profissional personalizada.",
    "priceText": "A partir de R$ 699,90",
    "priceValue": 699.9,
    "paymentConditions": null,
    "validityText": "Sem prazo definido; condição vigente até atualização da Virtuosa.",
    "claims": [
      "Ajuda a suavizar linhas de expressão",
      "Rosto mais jovem e descansado",
      "Melhora rápida do aspecto do rosto",
      "Naturalidade e segurança"
    ],
    "restrictions": [
      "O valor é inicial e depende da avaliação; não representa preço fechado para qualquer região, produto ou quantidade.",
      "Não garantir rejuvenescimento, rapidez, naturalidade, segurança individual ou resultado.",
      "Não informar dose, pontos, região ou duração sem avaliação e produto confirmado."
    ],
    "callToAction": "Chamar no WhatsApp e agendar avaliação gratuita.",
    "divergenceWarnings": [
      "A legenda recebida mencionava R$ 699,00; o responsável confirmou como correto o valor da imagem: a partir de R$ 699,90."
    ],
    "confidence": 1
  }$snapshot$::jsonb
),
(
  'Barriga Trincada',
  'barriga-trincada.png',
  1210763,
  $caption$🔥 Projeto Barriga Trincada
Quer definir sua barriga sem cirurgia? A gente te ajuda!

💥 4 sessões com placas de criolipólise
💥 5 sessões de Corrente Russa
💥 5 sessões de Lipo sem Corte

Resultados visíveis, sem dor e sem tempo de recuperação!
🌟 Vagas limitadas — agende já sua avaliação gratuita!$caption$,
  $snapshot${
    "headline": "Projeto Barriga Trincada",
    "visibleText": "Barriga Trincada. 4 placas. 5 Corrente Russa. 5 Lipo sem Corte. 10x de R$ 79,90. Quebra e metaboliza gordura.",
    "visualDescription": "Peça rosa com modelo exibindo a região abdominal e a composição do protocolo.",
    "procedures": [
      "Criolipólise de placas — 4 sessões",
      "Corrente Russa — 5 sessões",
      "{{LIPO_TECHNOLOGY}} (Lipo sem Corte) — 5 sessões"
    ],
    "offerSummary": "Protocolo corporal com 4 sessões de criolipólise de placas, 5 de Corrente Russa e 5 de {{LIPO_TECHNOLOGY}}, divulgado como Lipo sem Corte.",
    "priceText": "10x de R$ 79,90",
    "priceValue": 799,
    "paymentConditions": "10 parcelas de R$ 79,90",
    "validityText": "Sem prazo definido; condição vigente até atualização da Virtuosa.",
    "claims": [
      "Definição da barriga sem cirurgia",
      "Resultados visíveis",
      "Sem dor",
      "Sem tempo de recuperação",
      "Quebra e metaboliza gordura",
      "Vagas limitadas"
    ],
    "restrictions": [
      "Não garantir resultado, ausência de dor, ausência de recuperação ou redução de gordura.",
      "Criolipólise, Corrente Russa e ultrassom/lipocavitação têm mecanismos, contraindicações e objetivos diferentes.",
      "O protocolo não é emagrecimento nem substitui exercício, alimentação ou avaliação."
    ],
    "callToAction": "Agendar avaliação gratuita pelo WhatsApp.",
    "divergenceWarnings": [
      "“Lipo sem Corte” foi identificada pelo responsável como {{LIPO_TECHNOLOGY}} nesta unidade.",
      "As promessas de ausência de dor e de resultado visível são texto publicitário e não devem ser afirmadas como garantia clínica."
    ],
    "confidence": 1
  }$snapshot$::jsonb
),
(
  'HyperSlim',
  'hyper-slim.png',
  1691200,
  $caption$🔥 Quer acelerar a definição do seu corpo com tecnologia HyperSlim?
Na Virtuosa, você pode iniciar um protocolo exclusivo que ajuda a tonificar, modelar e potencializar seus resultados corporais.

💪 Estímulo de tonificação muscular
✨ Auxilia na definição corporal
🔥 Resultados progressivos com acompanhamento

📲 Clique no WhatsApp agora e saiba mais detalhes!$caption$,
  $snapshot${
    "headline": "Tecnologia HyperSlim",
    "visibleText": "Quer acelerar a definição do seu corpo? Conheça o protocolo com tecnologia HyperSlim. Estímulo de tonificação e definição muscular. Melhora do contorno corporal. Resultados rápidos e duradouros. Protocolo exclusivo e personalizado.",
    "visualDescription": "Peça escura com região abdominal, equipamento Hyper Slim da Medical San e aplicadores.",
    "procedures": ["Hyper Slim / estimulação eletromagnética muscular"],
    "offerSummary": "Protocolo corporal com Hyper Slim para estímulo, fortalecimento e tonificação muscular, definido após avaliação.",
    "priceText": null,
    "priceValue": null,
    "paymentConditions": null,
    "validityText": "Sem prazo definido; condição vigente até atualização da Virtuosa.",
    "claims": [
      "Ajuda a tonificar e modelar",
      "Auxilia na definição e no contorno corporal",
      "Resultados progressivos",
      "Resultados rápidos e duradouros",
      "Protocolo exclusivo e personalizado"
    ],
    "restrictions": [
      "O Hyper Slim utiliza campo eletromagnético pulsado para estimulação muscular; não é procedimento de emagrecimento.",
      "Não garantir definição, modelagem, rapidez, duração ou quantidade de sessões.",
      "A avaliação deve considerar as contraindicações descritas no manual do equipamento."
    ],
    "callToAction": "Chamar no WhatsApp e agendar avaliação.",
    "divergenceWarnings": [
      "A imagem promete resultados rápidos e duradouros, enquanto a legenda fala em resultados progressivos; a IA não deve garantir nenhuma dessas alegações."
    ],
    "confidence": 1
  }$snapshot$::jsonb
),
(
  'Preenchimento Facial',
  'preenchimento-facial.png',
  847654,
  $caption$✨ Valorize sua beleza sem perder sua naturalidade!

O preenchimento facial ajuda a realçar seus traços, devolver volume e definir o contorno do rosto, proporcionando um resultado equilibrado e elegante.

💗 Procedimento personalizado
💗 Resultado natural
💗 Atendimento com especialistas

💰 A partir de R$ 399,00

📲 Agende sua avaliação agora mesmo e descubra o tratamento ideal para você.$caption$,
  $snapshot${
    "headline": "Preenchimento Facial",
    "visibleText": "Preenchimento Facial. Realce sua beleza de forma natural. Mais volume onde você deseja. Contornos mais definidos. Resultado natural e imediato. A partir de R$ 399,00.",
    "visualDescription": "Peça rosa com modelo e informações de volume, contorno facial e preço inicial.",
    "procedures": ["Preenchimento facial com ácido hialurônico"],
    "offerSummary": "Preenchimento facial personalizado, com região e plano definidos em avaliação.",
    "priceText": "A partir de R$ 399,00",
    "priceValue": 399,
    "paymentConditions": null,
    "validityText": "Sem prazo definido; condição vigente até atualização da Virtuosa.",
    "claims": [
      "Realça traços",
      "Devolve volume",
      "Define o contorno do rosto",
      "Resultado equilibrado, elegante, natural e imediato"
    ],
    "restrictions": [
      "O valor é inicial e varia conforme região, produto e quantidade definida na avaliação.",
      "Não garantir resultado natural, imediato, simetria ou duração.",
      "Regiões faciais têm objetivos e riscos diferentes; não indicar área ou volume pelo chat."
    ],
    "callToAction": "Agendar avaliação pelo WhatsApp.",
    "divergenceWarnings": [
      "“Resultado natural e imediato” é alegação publicitária e não deve ser apresentada como garantia clínica."
    ],
    "confidence": 1
  }$snapshot$::jsonb
),
(
  'Gordura Localizada',
  'gordura-localizada.png',
  852226,
  NULL,
  $snapshot${
    "headline": "Chega de lutar com a gordura localizada",
    "visibleText": "Protocolo completo que combina diferentes tecnologias para modelar seu corpo. 5 sessões de enzimas para gordura localizada. 4 placas de crio. 1 pós-crio. 12x de R$ 99,00. Tecnologias avançadas. Resultados reais e comprovados. Protocolo seguro e personalizado.",
    "visualDescription": "Peça rosa da Virtuosa com modelo medindo o abdômen e a composição do protocolo corporal.",
    "procedures": [
      "Enzimas para gordura localizada — 5 sessões",
      "Criolipólise de placas — 4 sessões",
      "Pós-crio — 1 sessão"
    ],
    "offerSummary": "Protocolo corporal com 5 sessões de enzimas para gordura localizada, 4 sessões de criolipólise de placas e 1 sessão de pós-crio.",
    "priceText": "12x de R$ 99,00",
    "priceValue": 1188,
    "paymentConditions": "12 parcelas de R$ 99,00",
    "validityText": "Sem prazo definido; condição vigente até atualização da Virtuosa.",
    "claims": [
      "Combina tecnologias para modelar o corpo",
      "Resultados reais e comprovados",
      "Protocolo seguro e personalizado"
    ],
    "restrictions": [
      "“Enzimas” não identifica a substância; composição, fabricante, registro, via e profissional precisam ser confirmados em avaliação.",
      "Não garantir modelagem corporal, resultado ou segurança individual.",
      "Criolipólise e procedimentos invasivos têm contraindicações próprias e não representam emagrecimento."
    ],
    "callToAction": "Agendar pelo WhatsApp.",
    "divergenceWarnings": [
      "As expressões “resultados reais e comprovados” e “protocolo seguro” são alegações publicitárias e não devem ser repetidas como garantia clínica."
    ],
    "confidence": 1
  }$snapshot$::jsonb
);

WITH approver AS (
  SELECT "id", COALESCE("name", "email") AS "displayName"
  FROM "User"
  WHERE "email" = 'viniciusn11@hotmail.com'
    AND "isActive" = TRUE
  LIMIT 1
), prepared AS (
  SELECT
    campaign."id" AS "campaignId",
    campaign."unit",
    definition."fileName",
    definition."imageSizeBytes",
    definition."caption",
    replace(
      definition."snapshot"::text,
      '{{LIPO_TECHNOLOGY}}',
      CASE
        WHEN campaign."unit" = 'SCS' THEN 'Lipocavitação'
        ELSE 'Ultrassom focado corporal'
      END
    )::jsonb AS "snapshot",
    approver."id" AS "approverId",
    approver."displayName"
  FROM "Campaign" campaign
  JOIN "_tmpApprovedCampaignKnowledge" definition
    ON definition."campaignName" = campaign."name"
  CROSS JOIN approver
  WHERE campaign."unit" IN ('Osasco', 'SBC', 'SCS')
)
UPDATE "AiTrainingCampaignCreative" creative
SET
  "unit" = prepared."unit",
  "caption" = prepared."caption",
  "imageUrl" = 'https://clinicasgestao.com.br/ai-training/campaign-creatives/' || prepared."fileName",
  "imageFileName" = prepared."fileName",
  "imageMimeType" = 'image/png',
  "imageSizeBytes" = prepared."imageSizeBytes",
  "validUntil" = NULL,
  "status" = 'approved',
  "extractedData" = prepared."snapshot",
  "approvedSnapshot" = prepared."snapshot",
  "analysisModel" = 'manual:user-confirmed',
  "analysisPromptVersion" = 'campaign-creative-v1',
  "analysisError" = NULL,
  "analyzedAt" = CURRENT_TIMESTAMP,
  "approvedById" = prepared."approverId",
  "approvedByName" = prepared."displayName",
  "approvedAt" = CURRENT_TIMESTAMP,
  "updatedAt" = CURRENT_TIMESTAMP
FROM prepared
WHERE creative."campaignId" = prepared."campaignId"
  AND creative."label" = 'Campanha oficial — julho/2026'
  AND (
    creative."unit" IS DISTINCT FROM prepared."unit"
    OR creative."caption" IS DISTINCT FROM prepared."caption"
    OR creative."imageUrl" IS DISTINCT FROM ('https://clinicasgestao.com.br/ai-training/campaign-creatives/' || prepared."fileName")
    OR creative."imageFileName" IS DISTINCT FROM prepared."fileName"
    OR creative."imageMimeType" IS DISTINCT FROM 'image/png'
    OR creative."imageSizeBytes" IS DISTINCT FROM prepared."imageSizeBytes"
    OR creative."validUntil" IS NOT NULL
    OR creative."status" IS DISTINCT FROM 'approved'
    OR creative."approvedSnapshot" IS DISTINCT FROM prepared."snapshot"
    OR creative."extractedData" IS DISTINCT FROM prepared."snapshot"
    OR creative."analysisModel" IS DISTINCT FROM 'manual:user-confirmed'
  );

WITH approver AS (
  SELECT "id", COALESCE("name", "email") AS "displayName"
  FROM "User"
  WHERE "email" = 'viniciusn11@hotmail.com'
    AND "isActive" = TRUE
  LIMIT 1
), prepared AS (
  SELECT
    campaign."id" AS "campaignId",
    campaign."unit",
    definition."fileName",
    definition."imageSizeBytes",
    definition."caption",
    replace(
      definition."snapshot"::text,
      '{{LIPO_TECHNOLOGY}}',
      CASE
        WHEN campaign."unit" = 'SCS' THEN 'Lipocavitação'
        ELSE 'Ultrassom focado corporal'
      END
    )::jsonb AS "snapshot",
    approver."id" AS "approverId",
    approver."displayName"
  FROM "Campaign" campaign
  JOIN "_tmpApprovedCampaignKnowledge" definition
    ON definition."campaignName" = campaign."name"
  CROSS JOIN approver
  WHERE campaign."unit" IN ('Osasco', 'SBC', 'SCS')
)
INSERT INTO "AiTrainingCampaignCreative" (
  "id",
  "campaignId",
  "unit",
  "label",
  "caption",
  "imageUrl",
  "imageFileName",
  "imageMimeType",
  "imageSizeBytes",
  "validUntil",
  "status",
  "extractedData",
  "approvedSnapshot",
  "analysisModel",
  "analysisPromptVersion",
  "analysisError",
  "analyzedAt",
  "createdById",
  "createdByName",
  "approvedById",
  "approvedByName",
  "approvedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  md5('campaign-knowledge:' || prepared."campaignId" || ':2026-07'),
  prepared."campaignId",
  prepared."unit",
  'Campanha oficial — julho/2026',
  prepared."caption",
  'https://clinicasgestao.com.br/ai-training/campaign-creatives/' || prepared."fileName",
  prepared."fileName",
  'image/png',
  prepared."imageSizeBytes",
  NULL,
  'approved',
  prepared."snapshot",
  prepared."snapshot",
  'manual:user-confirmed',
  'campaign-creative-v1',
  NULL,
  CURRENT_TIMESTAMP,
  prepared."approverId",
  prepared."displayName",
  prepared."approverId",
  prepared."displayName",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM prepared
WHERE NOT EXISTS (
  SELECT 1
  FROM "AiTrainingCampaignCreative" existing
  WHERE existing."campaignId" = prepared."campaignId"
    AND existing."label" = 'Campanha oficial — julho/2026'
);

DROP TABLE "_tmpApprovedCampaignKnowledge";

UPDATE "AiPublicTestLink"
SET
  "knowledgeVersion" = 'caderno-virtuosa-draft-2026-07-28',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "includeExperimentalCaderno" = TRUE
  AND "status" = 'active'
  AND "knowledgeVersion" IS DISTINCT FROM 'caderno-virtuosa-draft-2026-07-28';
