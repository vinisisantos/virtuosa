'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, ExternalLink, Link2, MessageCircle, PanelsTopLeft } from 'lucide-react';

import { toast } from '@/components/toast';
import { useGlobalUnit } from '@/contexts/UnitContext';
import { EVALUATION_LANDING_UNITS } from '@/app/avaliacao/unit-config';

const FALLBACK_ORIGIN = 'https://clinicasgestao.com.br';

export default function LandingPagesPage() {
  const { globalUnit } = useGlobalUnit();
  const [origin, setOrigin] = useState(FALLBACK_ORIGIN);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const units = useMemo(() => {
    const allUnits = Object.values(EVALUATION_LANDING_UNITS);
    return [...allUnits].sort((left, right) => {
      if (left.unit === globalUnit) return -1;
      if (right.unit === globalUnit) return 1;
      return left.city.localeCompare(right.city, 'pt-BR');
    });
  }, [globalUnit]);

  const copyLandingUrl = async (publicPath: string) => {
    const publicUrl = `${origin}${publicPath}`;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopiedPath(publicPath);
      toast('Link da landing page copiado.', 'success');
      window.setTimeout(() => setCopiedPath((current) => current === publicPath ? null : current), 1800);
    } catch {
      toast('Não foi possível copiar o link.', 'error');
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 sm:space-y-6">
      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-4 p-5 sm:p-7 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3 sm:gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary sm:h-12 sm:w-12">
              <PanelsTopLeft className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Landing pages de avaliação</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                Cada unidade possui um endereço público próprio para vinculação aos anúncios da Meta.
              </p>
            </div>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
            <MessageCircle className="h-3.5 w-3.5" />
            WhatsApp aguardando números
          </span>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {units.map((unit) => {
          const publicUrl = `${origin}${unit.publicPath}`;
          const isCurrentUnit = unit.unit === globalUnit;
          const isCopied = copiedPath === unit.publicPath;

          return (
            <article
              key={unit.slug}
              className={`flex min-w-0 flex-col rounded-2xl border bg-card p-5 shadow-sm transition-colors sm:p-6 ${
                isCurrentUnit ? 'border-primary/45 ring-1 ring-primary/20' : 'border-border'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">Clínica Virtuosa</p>
                  <h3 className="mt-1 text-xl font-bold text-foreground">{unit.city}</h3>
                </div>
                {isCurrentUnit && (
                  <span className="shrink-0 rounded-full bg-primary/12 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-primary">
                    Unidade atual
                  </span>
                )}
              </div>

              <div className="mt-5 min-w-0 rounded-xl border border-border bg-muted/45 p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <Link2 className="h-3.5 w-3.5 shrink-0" />
                  Link público
                </div>
                <p className="mt-2 break-all text-sm font-medium leading-5 text-foreground">{publicUrl}</p>
              </div>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row lg:mt-auto lg:pt-5">
                <button
                  type="button"
                  onClick={() => void copyLandingUrl(unit.publicPath)}
                  className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
                >
                  {isCopied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  {isCopied ? 'Copiado' : 'Copiar link'}
                </button>
                <a
                  href={unit.publicPath}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Visualizar
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </article>
          );
        })}
      </section>

      <p className="px-1 text-xs leading-5 text-muted-foreground">
        As páginas continuam como rascunho visual. O botão de WhatsApp será ativado individualmente quando o número de cada unidade for informado.
      </p>
    </div>
  );
}
