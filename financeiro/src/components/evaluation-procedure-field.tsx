"use client";

import { useId } from "react";
import { normalizeEvaluationGroupPhone } from "@/lib/whatsapp/evaluation-group-notice-config";

export function EvaluationProcedureField({ value, onChange, required = false, disabled = false, clientPhone }: {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  clientPhone?: string | null;
}) {
  const id = useId();
  return (
    <div className="grid min-w-0 gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        Procedimento de interesse{required ? " *" : ""}
      </label>
      <input
        id={id}
        aria-label="Procedimento de interesse"
        aria-describedby={`${id}-help`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        disabled={disabled}
        maxLength={160}
        placeholder="Informe o tratamento que será avaliado"
        className="h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 disabled:opacity-60"
      />
      <p id={`${id}-help`} className="break-words text-xs text-muted-foreground">
        Confirme com a pessoa o tratamento de interesse. O tipo do agendamento continua sendo Avaliação.
      </p>
      {required && !normalizeEvaluationGroupPhone(clientPhone) && (
        <p role="status" className="break-words text-xs text-amber-700 dark:text-amber-300">
          Sem telefone válido, o aviso ao grupo não será enviado.
        </p>
      )}
    </div>
  );
}
