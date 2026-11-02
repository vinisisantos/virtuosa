export type EvaluationLandingSlug = 'osasco' | 'sbc';

export type EvaluationLandingUnit = {
  slug: EvaluationLandingSlug;
  unit: 'Osasco' | 'SBC';
  city: 'Osasco' | 'São Bernardo';
  publicPath: string;
  whatsappUrl: string | null;
  trackMetaLead: boolean;
};

export const EVALUATION_LANDING_UNITS: Record<EvaluationLandingSlug, EvaluationLandingUnit> = {
  osasco: {
    slug: 'osasco',
    unit: 'Osasco',
    city: 'Osasco',
    publicPath: '/avaliacao/osasco',
    whatsappUrl: 'https://wa.me/5511936220492',
    trackMetaLead: true,
  },
  sbc: {
    slug: 'sbc',
    unit: 'SBC',
    city: 'São Bernardo',
    publicPath: '/avaliacao/sbc',
    whatsappUrl: 'https://wa.me/5511936192770',
    trackMetaLead: false,
  },
};

export function evaluationLandingUnitFromSlug(slug: string) {
  return EVALUATION_LANDING_UNITS[slug as EvaluationLandingSlug] || null;
}
