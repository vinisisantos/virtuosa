export const EVALUATION_CLIENT_NAME_REQUIRED = "EVALUATION_CLIENT_NAME_REQUIRED";
export const APPOINTMENT_CLIENT_NAME_ERROR = "Informe o nome da cliente antes de agendar; o telefone não pode ser usado como nome.";

export class AppointmentClientNameError extends Error {
  readonly code = EVALUATION_CLIENT_NAME_REQUIRED;

  constructor() {
    super(APPOINTMENT_CLIENT_NAME_ERROR);
    this.name = "AppointmentClientNameError";
  }
}

export function normalizeAppointmentClientName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.normalize("NFC").trim().replace(/\s+/gu, " ");
  if (name.length > 200 || (name.match(/\p{L}/gu)?.length ?? 0) < 2) return null;
  if (!/^[\p{L}\p{M}'’‘.\- ]+$/u.test(name)) return null;

  const comparable = name.normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase().replace(/[.\-'’‘]/g, " ").replace(/\s+/g, " ").trim();
  if (/^(?:(?:lead|cliente|contato|paciente|nome)(?: (?:sem nome|nao informad[oa]|desconhecid[oa]))?|sem nome|nome desconhecido|nome nao informado|nao informad[oa]|desconhecid[oa]|n a|null|undefined|whatsapp)$/u.test(comparable)) return null;
  return name;
}

export function requireAppointmentClientName(value: unknown): string {
  const name = normalizeAppointmentClientName(value);
  if (!name) throw new AppointmentClientNameError();
  return name;
}
