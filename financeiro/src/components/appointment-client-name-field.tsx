"use client";

import { useId } from "react";
import { normalizeAppointmentClientName } from "@/lib/appointment-client-name";

export function AppointmentClientNameField({ value, onChange, disabled = false }: {
  value: string; onChange: (value: string) => void; disabled?: boolean;
}) {
  const id = useId();
  return <div className="grid min-w-0 gap-1.5">
    <label htmlFor={id} className="text-sm font-medium text-foreground">Nome da cliente *</label>
    <input id={id} aria-label="Nome da cliente" aria-describedby={`${id}-help`} value={value}
      onChange={(event) => onChange(event.target.value)} disabled={disabled} required autoComplete="name" maxLength={200}
      className="h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 disabled:opacity-60" />
    <p id={`${id}-help`} className="break-words text-xs text-muted-foreground">
      {normalizeAppointmentClientName(value) ? "Confira o nome da pessoa antes de salvar." : "Informe o nome da pessoa. O telefone não pode ser usado como nome."}
    </p>
  </div>;
}
