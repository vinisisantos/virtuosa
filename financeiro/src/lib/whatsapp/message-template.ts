export type WhatsAppMessageTemplateValues = {
  contactName?: string | null;
  contactPhone?: string | null;
  unit?: string | null;
  attendantName?: string | null;
};

const MESSAGE_TEMPLATE_TOKEN = /\{\{\s*([\p{L}\p{N}_ -]+?)\s*\}\}/gu;

function cleanTemplateValue(value?: string | null) {
  return (value || "").trim().replace(/\s+/g, " ");
}

function normalizeTemplateKey(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .replace(/[\s-]+/g, "_");
}

export function renderWhatsAppMessageTemplate(
  message: string,
  values: WhatsAppMessageTemplateValues,
) {
  const contactName = cleanTemplateValue(values.contactName);
  const replacements: Record<string, string> = {
    nome: contactName,
    nome_completo: contactName,
    primeiro_nome: contactName.split(" ")[0] || "",
    telefone: cleanTemplateValue(values.contactPhone),
    unidade: cleanTemplateValue(values.unit),
    atendente: cleanTemplateValue(values.attendantName),
  };

  return message.replace(MESSAGE_TEMPLATE_TOKEN, (token, rawKey: string) => {
    const replacement = replacements[normalizeTemplateKey(rawKey)];
    return replacement || token;
  });
}
