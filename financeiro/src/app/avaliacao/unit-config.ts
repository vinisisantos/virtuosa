export type EvaluationLandingSlug = 'osasco' | 'sbc' | 'scs';

export type EvaluationLandingUnit = {
  slug: EvaluationLandingSlug;
  unit: 'Osasco' | 'SBC' | 'SCS';
  city: 'Osasco' | 'São Bernardo' | 'São Caetano';
  publicPath: string;
  whatsappUrl: string | null;
};

export const EVALUATION_LANDING_UNITS: Record<EvaluationLandingSlug, EvaluationLandingUnit> = {
  osasco: {
    slug: 'osasco',
    unit: 'Osasco',
    city: 'Osasco',
    publicPath: '/avaliacao/osasco',
    whatsappUrl: null,
  },
  sbc: {
    slug: 'sbc',
    unit: 'SBC',
    city: 'São Bernardo',
    publicPath: '/avaliacao/sbc',
    whatsappUrl: null,
  },
  scs: {
    slug: 'scs',
    unit: 'SCS',
    city: 'São Caetano',
    publicPath: '/avaliacao/scs',
    whatsappUrl: null,
  },
};

export function evaluationLandingUnitFromSlug(slug: string) {
  return EVALUATION_LANDING_UNITS[slug as EvaluationLandingSlug] || null;
}
