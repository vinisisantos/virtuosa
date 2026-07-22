export type CadernoAutonomy = "automatico" | "ressalva" | "humano";

export type AiTrainingCadernoEntry = {
  id: string;
  title: string;
  aliases: string[];
  category: string;
  autonomy: CadernoAutonomy;
  answer: string;
  limits: string;
  redFlags?: string;
};

export type RetrievedCadernoEntry = AiTrainingCadernoEntry & { score: number };

export const AI_TRAINING_CADERNO_VERSION = "caderno-virtuosa-draft-2026-07-21";
export const AI_TRAINING_CADERNO_MAX_RESULTS = 8;

const STOP_WORDS = new Set([
  "a", "ao", "aos", "as", "com", "como", "confirmar", "da", "das", "de", "do", "dos", "e", "ela", "ele",
  "em", "endereco", "essa", "esse", "esta", "este", "eu", "fazer", "faz", "funciona", "gostaria", "horario", "me", "meu", "minha", "na",
  "nas", "no", "nos", "o", "os", "ou", "para", "por", "posso", "pra", "procedimento", "que", "qual",
  "se", "ser", "sobre", "tem", "tratamento", "um", "uma", "unidade", "voce",
]);

export const AI_TRAINING_CADERNO_ENTRIES: AiTrainingCadernoEntry[] = [
  {
    id: "safety-red-flags",
    title: "Sinais de alerta após procedimento",
    aliases: ["dor forte", "falta de ar", "febre", "pus", "secreção", "necrose", "pele escura", "visão alterada", "inchaço súbito", "trombose"],
    category: "seguranca",
    autonomy: "humano",
    answer: "Sintomas importantes depois de um procedimento precisam de avaliação rápida. Dor forte ou crescente, falta de ar, febre, secreção, pele mudando de cor, alteração visual ou neurológica e inchaço súbito não devem receber orientação caseira pela IA.",
    limits: "Não diagnosticar, tranquilizar, recomendar espera, medicamento ou cuidado domiciliar.",
    redFlags: "Priorizar transferência imediata à equipe; falta de ar, dor torácica, alteração visual/neurológica ou suspeita de trombose podem exigir urgência.",
  },
  {
    id: "toxina-facial",
    title: "Toxina botulínica facial",
    aliases: ["botox", "toxina botulínica", "toxina facial", "linhas de expressão"],
    category: "injetaveis",
    autonomy: "ressalva",
    answer: "A toxina botulínica reduz temporariamente a contração de músculos responsáveis por algumas linhas de expressão. Região, quantidade, início e duração variam conforme o produto e a avaliação. Ela não preenche volume nem deve receber promessa de resultado.",
    limits: "Não informar dose, pontos, intervalo universal ou indicação individual. Botox é marca e produtos não são automaticamente intercambiáveis.",
  },
  {
    id: "toxina-hiperidrose",
    title: "Toxina para hiperidrose axilar",
    aliases: ["hiperidrose", "suor excessivo", "sudorese", "suor nas axilas"],
    category: "injetaveis",
    autonomy: "ressalva",
    answer: "A toxina botulínica pode reduzir temporariamente o suor excessivo nas axilas em pessoas selecionadas. Antes é importante diferenciar hiperidrose de suor recente, noturno ou generalizado. Produto, candidatura e duração dependem de avaliação.",
    limits: "Sudorese nova, noturna, generalizada ou acompanhada de outros sintomas deve ser encaminhada.",
  },
  {
    id: "preenchimento-ah",
    title: "Preenchimento com ácido hialurônico",
    aliases: ["preenchimento", "ácido hialurônico", "preenchimento labial", "olheiras", "malar", "mento", "sulco nasolabial", "bigode chinês"],
    category: "injetaveis",
    autonomy: "ressalva",
    answer: "O ácido hialurônico pode repor ou ajustar volume e contorno em regiões autorizadas para o produto utilizado. Lábios, olheiras, malar, mento e sulcos têm objetivos e riscos diferentes. O plano depende da anatomia e da avaliação profissional.",
    limits: "Não generalizar indicação entre regiões, informar volume ou prometer simetria e duração.",
    redFlags: "Dor intensa, pele pálida, cinza, azulada ou fria, padrão arroxeado e alteração visual após preenchimento exigem atendimento urgente.",
  },
  {
    id: "rinomodelacao",
    title: "Rinomodelação com preenchedor",
    aliases: ["rinomodelação", "rinoplastia sem cirurgia", "preenchimento no nariz", "nariz com ácido hialurônico"],
    category: "injetaveis",
    autonomy: "humano",
    answer: "A rinomodelação usa preenchedor para camuflar alguns contornos acrescentando volume. Ela não reduz o nariz, não corrige respiração e não substitui rinoplastia. Por ser uma região de alto risco vascular e ocular, candidatura e técnica exigem avaliação direta.",
    limits: "Não sugerir candidatura, produto, volume, ponto ou resultado pelo chat.",
  },
  {
    id: "bioestimuladores",
    title: "Bioestimuladores de colágeno",
    aliases: ["bioestimulador", "sculptra", "ellansé", "radiesse", "plla", "hidroxiapatita", "caha", "pcl"],
    category: "injetaveis",
    autonomy: "ressalva",
    answer: "Bioestimulador é um grupo de produtos, não uma técnica única. PLLA, hidroxiapatita de cálcio e PCL têm composições, indicações e regiões autorizadas diferentes. A melhora é gradual e variável; produto, área e plano precisam ser confirmados.",
    limits: "Não prometer colágeno, lifting, quantidade de sessões ou duração sem o produto e a IFU específicos.",
  },
  {
    id: "skinbooster",
    title: "Skinbooster",
    aliases: ["skinbooster", "hidratação injetável", "ácido hialurônico intradérmico"],
    category: "injetaveis",
    autonomy: "ressalva",
    answer: "Skinbooster costuma designar produtos injetáveis voltados à qualidade e hidratação da pele, mas não é sinônimo de qualquer ácido hialurônico. Composição, via, região autorizada e resultado dependem do produto exato e da avaliação.",
    limits: "Não tratar cosmético tópico como injetável nem prometer hidratação profunda permanente.",
  },
  {
    id: "fios-absorviveis",
    title: "Fios absorvíveis",
    aliases: ["fios de pdo", "fio pdo", "fios lisos", "fios de sustentação", "fios espiculados", "fio parafuso"],
    category: "injetaveis",
    autonomy: "humano",
    answer: "Fios lisos, espiculados e em parafuso têm estruturas e objetivos diferentes. Alguns buscam suporte ou estímulo tecidual, mas não equivalem a lifting cirúrgico. Como são implantáveis e podem causar assimetria, infecção ou lesão, precisam de avaliação direta.",
    limits: "Não indicar tipo, quantidade, região ou duração pelo chat.",
  },
  {
    id: "mesoterapia-enzimas",
    title: "Mesoterapia, intradermoterapia e enzimas",
    aliases: ["enzimas", "mesoterapia", "intradermoterapia", "enzima para gordura", "enzima capilar"],
    category: "injetaveis",
    autonomy: "humano",
    answer: "Mesoterapia e intradermoterapia descrevem formas de aplicação, enquanto “enzimas” não identifica a substância. Antes de explicar benefícios ou sessões é obrigatório confirmar composição, fabricante, registro, via, indicação e profissional responsável.",
    limits: "Não presumir substância, finalidade, segurança ou efeito em gordura, pele ou cabelo.",
  },
  {
    id: "laser-co2",
    title: "Laser de CO2 fracionado",
    aliases: ["laser co2", "co2 fracionado", "laser ablativo", "hegon", "hergon"],
    category: "tecnologias",
    autonomy: "ressalva",
    answer: "O CO2 fracionado é um laser ablativo usado principalmente para textura, fotoenvelhecimento e algumas cicatrizes. Recuperação e risco de manchas variam com região, fototipo e intensidade. Pálpebras e região íntima exigem avaliação específica.",
    limits: "Não informar parâmetros, recuperação universal ou benefício de aparelho sem etiqueta e IFU.",
  },
  {
    id: "lavieen",
    title: "Laser de túlio 1927 nm / Lavieen",
    aliases: ["lavieen", "laser de túlio", "thulium", "laser 1927"],
    category: "tecnologias",
    autonomy: "ressalva",
    answer: "O laser de túlio 1927 nm atua principalmente em alterações superficiais de textura e pigmentação. Não é igual ao CO2. Indicação, recuperação e sessões dependem do aparelho e da pele; melasma pode recidivar e exige avaliação.",
    limits: "Confirmar Lavieen, registro, aplicadores e IFU da unidade antes de falar de protocolo.",
  },
  {
    id: "hifu-mpt",
    title: "Ultrassom microfocado / HIFU / MPT",
    aliases: ["hifu", "ultrassom microfocado", "ultraformer", "mpt", "ultrassom facial"],
    category: "tecnologias",
    autonomy: "ressalva",
    answer: "O ultrassom microfocado concentra energia em pontos abaixo da pele e pode melhorar determinadas flacidezes de forma gradual. Não é laser, não trata manchas e não substitui lifting cirúrgico. MPT é um modo presente em aparelhos específicos, não garantia de superioridade.",
    limits: "Candidatura, regiões, cartuchos, sessões e resultado dependem do equipamento confirmado e da avaliação.",
  },
  {
    id: "radiofrequencia",
    title: "Radiofrequência e criofrequência",
    aliases: ["radiofrequência", "criofrequência", "rf monopolar", "rf bipolar", "rf multipolar", "radiofrequência microagulhada"],
    category: "tecnologias",
    autonomy: "ressalva",
    answer: "Radiofrequência aquece tecidos de forma controlada; criofrequência acrescenta resfriamento superficial e não é criolipólise. Pode melhorar algumas flacidezes em aparelhos específicos, mas configuração, profundidade, regiões e sessões dependem do modelo e da IFU.",
    limits: "Implantes, alteração de sensibilidade, doença vascular e procedimento recente exigem avaliação.",
  },
  {
    id: "endolift",
    title: "Endolift / endolaser",
    aliases: ["endolift", "endolaser", "laser subdérmico", "fibra de laser"],
    category: "tecnologias",
    autonomy: "humano",
    answer: "Endolift ou endolaser pode se referir a lasers diferentes com fibra introduzida sob a pele. Sem equipamento, comprimento de onda, fibra, registro e indicação não é possível explicar resultado. Por ser subdérmico, requer atendimento humano direto.",
    limits: "Não sugerir candidatura, protocolo ou segurança sem documentação do dispositivo.",
  },
  {
    id: "jato-plasma",
    title: "Jato de plasma",
    aliases: ["jato de plasma", "plasma exerese", "plasma frio", "j plasma"],
    category: "tecnologias",
    autonomy: "ressalva",
    answer: "Jato de plasma pode representar tecnologias muito diferentes. Alguns aparelhos criam lesão térmica controlada e não equivalem a laser ou J-Plasma. É necessário confirmar aparelho e finalidade; pálpebras e remoção de lesões exigem avaliação direta.",
    limits: "Não tratar tecnologias de plasma como equivalentes nem orientar lesões por fotografia.",
  },
  {
    id: "limpeza-pele",
    title: "Limpeza de pele",
    aliases: ["limpeza de pele", "extração de cravos", "pele oleosa", "pele acneica", "comedões"],
    category: "facial",
    autonomy: "ressalva",
    answer: "A limpeza de pele remove resíduos, oleosidade superficial e alguns cravos. Em pele acneica é complementar, não tratamento da acne. Espinhas muito inflamadas, nódulos, feridas ou pele sensibilizada precisam ser avaliados antes da extração.",
    limits: "Não prometer controle permanente de oleosidade, cura da acne ou fechamento de poros.",
  },
  {
    id: "microagulhamento",
    title: "Microagulhamento facial mecânico",
    aliases: ["microagulhamento", "dermaroller", "caneta de microagulhamento", "indução de colágeno", "cicatriz de acne"],
    category: "facial",
    autonomy: "ressalva",
    answer: "O microagulhamento cria microlesões controladas e pode melhorar parcialmente algumas cicatrizes atróficas, textura e linhas finas. Cicatrizes não desaparecem. Acne inflamada, herpes, infecção ou pele sensibilizada precisam ser avaliadas.",
    limits: "Não informar profundidade, passadas, anestésico ou associar qualquer cosmético aos microcanais.",
  },
  {
    id: "dermaplaning",
    title: "Dermaplaning",
    aliases: ["dermaplaning", "raspagem facial", "lâmina no rosto", "remoção de pelos finos"],
    category: "facial",
    autonomy: "ressalva",
    answer: "O dermaplaning é uma esfoliação superficial com lâmina que remove células da camada externa e pelos finos, deixando a pele temporariamente mais lisa. A evidência para manchas, cicatrizes ou rugas é limitada.",
    limits: "Não prometer colágeno, clareamento, tratamento de cicatriz ou mudança permanente do pelo.",
  },
  {
    id: "peelings",
    title: "Peelings químicos e físicos",
    aliases: ["peeling", "peeling químico", "ácido glicólico", "ácido salicílico", "ácido mandélico", "ácido retinoico", "jessner", "tca", "peeling de diamante", "rose de mer", "peeling coreano", "perfect peeling"],
    category: "facial",
    autonomy: "ressalva",
    answer: "Peeling é um nome amplo: agentes químicos e esfoliação física têm efeitos e riscos diferentes. A escolha depende da composição, objetivo, fototipo e sensibilidade. Não fecha poros, não cura melasma e pode causar irritação ou alteração de pigmento.",
    limits: "Retinoico, Jessner, TCA e nomes comerciais sem composição confirmada exigem atendimento humano.",
  },
  {
    id: "suporte-cosmetico",
    title: "Hidratação, máscaras, vitamina C, alta frequência e massagem facial",
    aliases: ["hidratação facial", "máscara facial", "vitamina c", "alta frequência", "massagem facial"],
    category: "facial",
    autonomy: "automatico",
    answer: "Hidratação, máscaras, vitamina C e massagem são cuidados cosméticos de suporte. Podem melhorar temporariamente hidratação, maciez e aparência, mas não curam acne ou melasma, não fecham poros e não fazem lifting. Alta frequência depende do aparelho e tem evidência clínica limitada.",
    limits: "Não atribuir ação terapêutica, esterilização da pele, drenagem de toxinas ou remodelação permanente.",
  },
  {
    id: "regenerativos",
    title: "Microinfusão, PDRN, exossomos e GHK-Cu",
    aliases: ["microinfusão", "mmp", "pdrn", "polinucleotídeos", "exossomos", "ghk-cu", "peptídeo de cobre", "regenerativo"],
    category: "facial",
    autonomy: "humano",
    answer: "Microinfusão descreve a técnica, não o produto. PDRN, polinucleotídeos, exossomos e GHK-Cu têm composições, vias e evidências diferentes. Antes de informar benefício é preciso confirmar registro, composição, esterilidade e via autorizada.",
    limits: "Cosmético tópico não pode ser transformado automaticamente em produto para microagulhamento ou injeção.",
  },
  {
    id: "criolipolise",
    title: "Criolipólise",
    aliases: ["criolipólise", "criolipólise de placas", "crioplacas", "congelar gordura"],
    category: "corporal",
    autonomy: "ressalva",
    answer: "A criolipólise resfria gordura localizada para produzir redução parcial do volume da área. Não emagrece, não trata obesidade nem garante centímetros. Aparelhos de sucção e placas têm indicações diferentes e precisam ser identificados.",
    limits: "Doenças relacionadas ao frio, hérnia, alteração de sensibilidade, gestação e cirurgia recente exigem avaliação.",
    redFlags: "Dor forte, queimadura, perda persistente de sensibilidade ou aumento progressivo da área precisam de atendimento.",
  },
  {
    id: "ultrassom-corporal",
    title: "Ultrassom corporal, cavitação, Heccus e Sonofocus",
    aliases: ["ultrassom corporal", "cavitação", "lipocavitação", "heccus", "sonofocus", "hifu corporal"],
    category: "corporal",
    autonomy: "ressalva",
    answer: "Ultrassom corporal pode ter finalidades diferentes conforme o aparelho. Gordura localizada, celulite, edema e flacidez não são a mesma indicação. Heccus e Sonofocus têm versões e aplicadores diferentes e não são tratamentos para emagrecimento.",
    limits: "Confirmar fabricante, modelo, registro, aplicador e IFU antes de falar de resultado ou sessões.",
  },
  {
    id: "endermoterapia-correntes",
    title: "Endermoterapia e eletroestimulação",
    aliases: ["endermoterapia", "corrente russa", "eletroestimulação", "estimulação muscular", "pump up"],
    category: "corporal",
    autonomy: "ressalva",
    answer: "Endermoterapia usa pressão, sucção, roletes ou vibração; correntes elétricas estimulam nervos ou músculos conforme o aparelho. Podem produzir efeitos temporários em aparência ou tônus, mas não queimam gordura, não emagrecem e não substituem exercício.",
    limits: "Implantes eletrônicos, doença vascular, alteração de sensibilidade, gestação e cirurgia recente exigem avaliação e IFU.",
  },
  {
    id: "drenagem-pos-operatorio",
    title: "Drenagem, massagem modeladora, pós-operatório e fibrose",
    aliases: ["drenagem linfática", "massagem modeladora", "pós-operatório", "pos operatorio", "fibrose", "seroma", "edema"],
    category: "corporal",
    autonomy: "humano",
    answer: "A drenagem pode auxiliar alguns edemas e a massagem modeladora produz efeitos principalmente temporários. No pós-operatório, qualquer técnica depende da liberação do cirurgião. Endurecimento pode ser edema, seroma, hematoma, infecção ou fibrose e não deve ser diagnosticado pelo chat.",
    limits: "Drenagem fora do pós-operatório e sem doença vascular pode receber explicação com ressalva.",
    redFlags: "Dor forte, falta de ar, febre, secreção ou inchaço súbito exigem avaliação imediata.",
  },
  {
    id: "carboxiterapia",
    title: "Carboxiterapia",
    aliases: ["carboxiterapia", "gás carbônico", "co2 medicinal"],
    category: "corporal",
    autonomy: "humano",
    answer: "A carboxiterapia é invasiva e introduz dióxido de carbono medicinal no tecido. Há estudos para diferentes alterações, mas evidência e protocolos variam. Não emagrece nem garante redução de medidas; equipamento, indicação e condições de saúde precisam de avaliação direta.",
    limits: "Não informar fluxo, volume, via, sessões ou indicação individual.",
  },
  {
    id: "subcisao",
    title: "Subcisão para celulite",
    aliases: ["subcisão", "liberação de septos", "cellulite release", "traves de celulite"],
    category: "corporal",
    autonomy: "humano",
    answer: "A subcisão é invasiva e libera algumas traves fibrosas responsáveis por depressões específicas de celulite. Não trata automaticamente gordura ou flacidez e não serve para todo tipo de celulite. Candidatura e técnica precisam ser avaliadas diretamente.",
    limits: "Não informar instrumento, profundidade, anestesia, sessões ou combinações.",
  },
  {
    id: "depilacao",
    title: "Depilação a laser e luz pulsada",
    aliases: ["depilação a laser", "luz pulsada", "ipl", "remoção definitiva de pelos", "laser para pelos"],
    category: "outros",
    autonomy: "ressalva",
    answer: "Laser e luz pulsada buscam redução prolongada dos pelos, mas não garantem eliminação definitiva. Resultado e segurança dependem do aparelho, cor do pelo, fototipo e bronzeamento. Podem ocorrer queimadura, manchas ou crescimento paradoxal.",
    limits: "Confirmar tecnologia e avaliar pele, bronzeamento e região antes de informar sessões.",
  },
  {
    id: "capilar",
    title: "Tratamentos capilares",
    aliases: ["tratamento capilar", "queda de cabelo", "calvície", "alopecia", "laser capilar", "led capilar", "microagulhamento capilar"],
    category: "outros",
    autonomy: "ressalva",
    answer: "Queda de cabelo é um sintoma com várias causas, então o diagnóstico vem antes do tratamento. LED ou laser de baixa intensidade pode ajudar alguns casos com aparelhos específicos, mas alta frequência, microagulhamento e intradermoterapia não servem para toda queda.",
    limits: "Drug delivery e intradermoterapia capilar exigem atendimento humano e produto identificado.",
    redFlags: "Falhas súbitas, dor, pus, feridas, febre ou couro cabeludo cicatricial exigem avaliação.",
  },
  {
    id: "peim",
    title: "PEIM, escleroterapia e vasinhos",
    aliases: ["peim", "escleroterapia", "vasinhos", "microvasos", "glicose nos vasinhos"],
    category: "vascular",
    autonomy: "humano",
    answer: "PEIM e escleroterapia são procedimentos vasculares invasivos. Vasinhos podem estar ligados a veias maiores ou doença venosa, então é necessário avaliar a circulação e confirmar o produto. Existem riscos como manchas, ferida, necrose, alergia e trombose.",
    limits: "Não informar agente, concentração, volume, sessões ou afirmar que glicose é natural e sem risco.",
    redFlags: "Perna subitamente inchada, quente e dolorosa, falta de ar ou dor no peito é urgência.",
  },
  {
    id: "intimos",
    title: "Tratamentos íntimos",
    aliases: ["rejuvenescimento íntimo", "laser íntimo", "radiofrequência íntima", "clareamento íntimo", "preenchimento íntimo", "flacidez vaginal"],
    category: "intimo",
    autonomy: "humano",
    answer: "Tratamento íntimo pode envolver pele externa, vulva ou vagina, e cada área possui riscos e indicações diferentes. Laser, radiofrequência, clareadores e injetáveis não são equivalentes. Não é possível prometer estreitamento, melhora sexual ou clareamento sem avaliação e IFU.",
    limits: "Não orientar sintomas ginecológicos nem presumir que cosmético externo possa ser usado em mucosa.",
    redFlags: "Dor, corrimento, sangramento, ferida, infecção ou alteração urinária exigem avaliação médica.",
  },
  {
    id: "auriculoterapia",
    title: "Auriculoterapia",
    aliases: ["auriculoterapia", "sementes na orelha", "pontos na orelha"],
    category: "outros",
    autonomy: "ressalva",
    answer: "Auriculoterapia estimula pontos da orelha com sementes, esferas ou agulhas e pode ser apresentada somente como prática complementar. Não deve prometer emagrecimento, controle de compulsão, ansiedade clínica ou tratamento de doenças.",
    limits: "Não substituir avaliação ou tratamento médico/psicológico.",
  },
  {
    id: "bronzeamento-uv",
    title: "Bronzeamento artificial com radiação UV",
    aliases: ["câmara de bronzeamento", "bronzeamento artificial", "bronzeamento uv", "cama de bronzeamento"],
    category: "regulatorio",
    autonomy: "humano",
    answer: "Câmaras de bronzeamento artificial baseadas em radiação ultravioleta para finalidade estética são proibidas no Brasil. Bronzeamento a jato com cosmético tópico é outra categoria e depende de produto regularizado e avaliação de alergia.",
    limits: "Não oferecer, agendar ou sugerir câmara UV estética.",
  },
  {
    id: "ozonioterapia",
    title: "Ozonioterapia estética",
    aliases: ["ozonioterapia", "ozônio", "ozônio estético", "ozônio para gordura"],
    category: "regulatorio",
    autonomy: "humano",
    answer: "A ozonioterapia tem caráter complementar e exige profissional de saúde de nível superior e equipamento regularizado. Benefícios genéricos para emagrecimento, gordura, celulite, rejuvenescimento ou cabelo não devem ser informados sem indicação autorizada e documentação específica.",
    limits: "Não orientar via, dose, aplicação ou promover benefício fora da indicação autorizada.",
  },
  {
    id: "tirzepatida",
    title: "Tirzepatida / Mounjaro",
    aliases: ["tirzepatida", "mounjaro", "caneta emagrecedora", "injeção para emagrecer", "monjifast"],
    category: "medicamento",
    autonomy: "humano",
    answer: "Tirzepatida é medicamento sujeito a prescrição e acompanhamento médico, não um procedimento estético. Sua indicação para controle de peso segue critérios clínicos e não deve ser oferecida como aplicação avulsa ou promessa de emagrecimento rápido.",
    limits: "Não informar dose, prescrever, comparar marcas, sugerir candidatura ou vender protocolo estético.",
  },
];

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function meaningfulTokens(value: string) {
  return new Set(
    normalize(value)
      .split(" ")
      .filter((token) => token.length >= 3 && !STOP_WORDS.has(token)),
  );
}

function entryScore(entry: AiTrainingCadernoEntry, normalizedQuery: string, queryTokens: Set<string>) {
  const normalizedAliases = entry.aliases.map(normalize);
  let score = 0;
  for (const alias of normalizedAliases) {
    if (alias && normalizedQuery.includes(alias)) score += alias.includes(" ") ? 12 : 8;
  }

  const titleTokens = meaningfulTokens(entry.title);
  const aliasTokens = meaningfulTokens(entry.aliases.join(" "));
  const bodyTokens = meaningfulTokens(`${entry.answer} ${entry.limits} ${entry.redFlags || ""}`);
  for (const token of queryTokens) {
    if (titleTokens.has(token)) score += 4;
    if (aliasTokens.has(token)) score += 3;
    if (bodyTokens.has(token)) score += 1;
  }
  return score;
}

export function retrieveAiTrainingCadernoEntries(
  query: string,
  limit = AI_TRAINING_CADERNO_MAX_RESULTS,
): RetrievedCadernoEntry[] {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return [];
  const queryTokens = meaningfulTokens(query);
  return AI_TRAINING_CADERNO_ENTRIES
    .map((entry) => ({ ...entry, score: entryScore(entry, normalizedQuery, queryTokens) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "pt-BR"))
    .slice(0, Math.max(1, Math.min(limit, AI_TRAINING_CADERNO_MAX_RESULTS)));
}
