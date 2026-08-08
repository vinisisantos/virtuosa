import type { Metadata } from 'next';

import { EvaluationLandingPage } from './evaluation-landing';
import { EVALUATION_LANDING_UNITS } from './unit-config';

export const metadata: Metadata = {
  title: 'Clínica Virtuosa Osasco — Avaliação gratuita',
  description: 'Landing page de avaliação da Clínica Virtuosa Osasco.',
  robots: { index: false, follow: false, nocache: true },
};

export default function LegacyEvaluationPage() {
  return <EvaluationLandingPage config={EVALUATION_LANDING_UNITS.osasco} />;
}
