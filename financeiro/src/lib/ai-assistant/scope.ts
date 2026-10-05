import type { AliceUnit } from "@/lib/ai-assistant/policy";

const ALICE_ALLOWED_UNITS: readonly AliceUnit[] = ["SBC", "Osasco"];

export function isAliceUnit(value: string): value is AliceUnit {
  return ALICE_ALLOWED_UNITS.some((unit) => unit === value);
}
