import { NextRequest, NextResponse } from 'next/server';
import { getMLAuthUrl } from '@/lib/mercadolivre';

/* GET /api/mercadolivre/auth?unit=SBC → redirects to ML OAuth */
export async function GET(req: NextRequest) {
  const unit = new URL(req.url).searchParams.get('unit');
  if (!unit) return NextResponse.json({ error: 'Unidade obrigatória.' }, { status: 400 });

  const url = getMLAuthUrl(unit);
  return NextResponse.redirect(url);
}
