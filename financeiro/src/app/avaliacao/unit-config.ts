export type EvaluationLandingSlug = 'osasco' | 'sbc' | 'scs';

export type EvaluationLandingUnit = {
  slug: EvaluationLandingSlug;
  unit: 'Osasco' | 'SBC' | 'SCS';
  city: 'Osasco' | 'São Bernardo' | 'São Caetano';
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
  scs: {
    slug: 'scs',
    unit: 'SCS',
    city: 'São Caetano',
    publicPath: '/avaliacao/scs',
    whatsappUrl: 'https://wa.me/5511936197836',
    trackMetaLead: false,
  },
};

export function evaluationLandingUnitFromSlug(slug: string) {
  return EVALUATION_LANDING_UNITS[slug as EvaluationLandingSlug] || null;
}
