import { phoneLookupKey } from "@/lib/phone";
import { extractLeadName } from "@/lib/whatsapp/lead-name";

export type FormLeadUnit = "Osasco" | "SBC" | "SCS";

const CLINIC_NAME_BY_UNIT: Record<FormLeadUnit, string> = {
  Osasco: "Osasco",
  SBC: "São Bernardo",
  SCS: "São Caetano",
};

const DIRECT_FORM_OPENING = "olá! preenchi seu formulário e gostaria de saber mais sobre sua empresa.";

export function formLeadWelcomeMessage(unit: FormLeadUnit, name?: string | null) {
  const leadName = name?.trim();
  const greeting = leadName ? `Olá, *${leadName}*! 🌸` : "Olá! 🌸";

  return `${greeting}\n\nSeja muito bem-vinda(o) à *Clínica Virtuosa ${CLINIC_NAME_BY_UNIT[unit]}*! ✨\n\nRecebemos o seu cadastro e ficamos felizes com o seu interesse em nossos tratamentos.\n\nO mais breve possível, nossa especialista entrará em contato para tirar suas dúvidas e dar continuidade ao seu atendimento. 💗`;
}

export function extractDirectFormLeadName(messageBody: string, contactPhone: string) {
  const body = messageBody.trim();
  if (!body.toLocaleLowerCase("pt-BR").startsWith(DIRECT_FORM_OPENING)) return null;

  const submittedPhone = body.match(/(?:^|\r?\n)Phone number:\s*([^\r\n]+)/i)?.[1]?.trim();
  const submittedName = body.match(/(?:^|\r?\n)Full name:\s*([^\r\n]+)/i)?.[1]?.trim();
  if (!submittedPhone || !submittedName) return null;

  const submittedPhoneKey = phoneLookupKey(submittedPhone);
  const contactPhoneKey = phoneLookupKey(contactPhone);
  if (!submittedPhoneKey || submittedPhoneKey !== contactPhoneKey) return null;

  return extractLeadName(`Nome: ${submittedName}`);
}
