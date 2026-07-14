"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";

import { ProcedureSelector, type CatalogService } from "@/components/procedure-selector";
import { Button } from "@/components/ui/button";
import { normalizeProcedureNames } from "@/lib/pipeline/procedure-names";

type MultiProcedureSelectorProps = {
  values: string[];
  onChange: (values: string[]) => void;
  services: CatalogService[];
  placeholder?: string;
};

export function MultiProcedureSelector({
  values,
  onChange,
  services,
  placeholder = "Buscar ou informar procedimento",
}: MultiProcedureSelectorProps) {
  const [draft, setDraft] = useState("");

  const addProcedure = (name: string) => {
    const nextValues = normalizeProcedureNames([...values, name]);
    if (nextValues.length !== values.length) onChange(nextValues);
    setDraft("");
  };

  const removeProcedure = (name: string) => {
    onChange(values.filter((value) => value !== name));
  };

  return (
    <div className="grid gap-2">
      {values.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {values.map((name) => (
            <span
              key={name}
              className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 py-1 pl-3 pr-1.5 text-sm font-medium text-foreground"
            >
              <span className="truncate">{name}</span>
              <button
                type="button"
                onClick={() => removeProcedure(name)}
                className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-primary/15 hover:text-foreground"
                aria-label={`Remover ${name}`}
              >
                <X className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <ProcedureSelector
            services={services}
            value={draft}
            onChange={(name, price) => {
              setDraft(name);
              if (price !== undefined) addProcedure(name);
            }}
            placeholder={placeholder}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => addProcedure(draft)}
          disabled={!draft.trim()}
          className="h-[42px] w-full shrink-0 gap-1.5 sm:w-auto"
        >
          <Plus className="size-4" />
          Adicionar
        </Button>
      </div>
    </div>
  );
}
