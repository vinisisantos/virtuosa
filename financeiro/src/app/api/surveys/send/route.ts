import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  // O disparo real via WhatsApp ocorrerá via close/route.ts do WhatsApp
  // Este endpoint serve apenas para a UI não quebrar caso tente forçar envio.
  return NextResponse.json({ success: true, message: 'Disparos delegados para automações' });
}
