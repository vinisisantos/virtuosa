import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { EvaluationLandingPage } from '../evaluation-landing';
import {
  EVALUATION_LANDING_UNITS,
  evaluationLandingUnitFromSlug,
} from '../unit-config';

type EvaluationUnitPageProps = {
  params: Promise<{ unit: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.values(EVALUATION_LANDING_UNITS).map(({ slug }) => ({ unit: slug }));
}

export async function generateMetadata({ params }: EvaluationUnitPageProps): Promise<Metadata> {
  const { unit } = await params;
  const config = evaluationLandingUnitFromSlug(unit);
  if (!config) return {};

  return {
    title: `Clínica Virtuosa ${config.city} — Avaliação gratuita`,
    description: `Landing page de avaliação da Clínica Virtuosa ${config.city}.`,
    robots: { index: false, follow: false, nocache: true },
  };
}

export default async function EvaluationUnitPage({ params }: EvaluationUnitPageProps) {
  const { unit } = await params;
  const config = evaluationLandingUnitFromSlug(unit);
  if (!config) notFound();

  return <EvaluationLandingPage config={config} />;
}
