"use client";

import { useId } from "react";
import { normalizeEvaluationGroupPhone } from "@/lib/whatsapp/evaluation-group-notice-config";
import type { CatalogService } from "@/components/procedure-selector";
import { formatCurrency } from "@/lib/currency";

export function EvaluationProcedureField({ value, onChange, required = false, disabled = false, clientPhone, services = [], loading = false, loadError = false }: {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  clientPhone?: string | null;
  services?: CatalogService[];
  loading?: boolean;
  loadError?: boolean;
}) {
  const id = useId();
  return (
    <div className="grid min-w-0 gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        Procedimento de interesse{required ? " *" : ""}
      </label>
      <input
        id={id}
        list={`${id}-catalog`}
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
      <datalist id={`${id}-catalog`}>
        {Array.from(new Map(services.map(service => [service.name, service])).values()).map(service => (
          <option key={service.id} value={service.name}>
            {formatCurrency(service.price)} · {service.duration > 0 ? `${service.duration} min` : 'Sem duração definida'}
          </option>
        ))}
      </datalist>
      {(loading || loadError) && (
        <p role="status" className="break-words text-xs text-muted-foreground">
          {loading ? 'Carregando procedimentos…' : 'Não foi possível carregar o catálogo. Você pode informar o procedimento manualmente.'}
        </p>
      )}
      <p id={`${id}-help`} className="break-words text-xs text-muted-foreground">
        Confira o tratamento sugerido, ajuste ou acrescente outros procedimentos antes de salvar. Confirme o interesse com a pessoa.
      </p>
      {required && !normalizeEvaluationGroupPhone(clientPhone) && (
        <p role="status" className="break-words text-xs text-amber-700 dark:text-amber-300">
          Sem telefone válido, o aviso ao grupo não será enviado.
        </p>
      )}
    </div>
  );
}
