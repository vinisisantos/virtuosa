import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * GET /api/clients/check-duplicate?cpf=X&phone=Y&email=Z&name=W
 * Verifica duplicidade de pacientes antes de criar cadastro.
 * Retorna candidatos encontrados com nível de confiança.
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const cpf = url.searchParams.get('cpf')?.replace(/\D/g, '') || '';
    const phone = url.searchParams.get('phone')?.replace(/\D/g, '') || '';
    const email = url.searchParams.get('email')?.toLowerCase().trim() || '';
    const name = url.searchParams.get('name')?.trim() || '';

    if (!cpf && !phone && !email && !name) {
      return NextResponse.json({ duplicates: [], hasDuplicate: false });
    }

    // Build OR conditions for potential matches
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conditions: any[] = [];

    if (cpf && cpf.length >= 11) {
      conditions.push({ cpf: { contains: cpf } });
    }
    if (phone && phone.length >= 10) {
      conditions.push({ phone: { contains: phone } });
    }
    if (email && email.length >= 5) {
      conditions.push({ email: { equals: email } });
    }

    if (conditions.length === 0 && !name) {
      return NextResponse.json({ duplicates: [], hasDuplicate: false });
    }

    // Query potential duplicates
    const candidates = await prisma.client.findMany({
      where: {
        isActive: true,
        ...(conditions.length > 0 ? { OR: conditions } : { name: { contains: name } }),
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        cpf: true,
        birthdate: true,
        gender: true,
        unit: true,
        rg: true,
        profissao: true,
        estadoCivil: true,
        cep: true,
        estado: true,
        cidade: true,
        bairro: true,
        rua: true,
        numero: true,
        complemento: true,
      },
      take: 10,
    });

    // Score each candidate
    const scored = candidates.map(c => {
      let score = 0;
      const reasons: string[] = [];
      const cleanCpf = (c.cpf || '').replace(/\D/g, '');
      const cleanPhone = (c.phone || '').replace(/\D/g, '');
      const cleanEmail = (c.email || '').toLowerCase().trim();

      if (cpf && cleanCpf && cleanCpf === cpf) {
        score += 100;
        reasons.push('CPF idêntico');
      }
      if (phone && cleanPhone && cleanPhone === phone) {
        score += 80;
        reasons.push('Telefone idêntico');
      }
      if (email && cleanEmail && cleanEmail === email) {
        score += 70;
        reasons.push('Email idêntico');
      }
      if (name && c.name.toLowerCase().includes(name.toLowerCase())) {
        score += 30;
        reasons.push('Nome similar');
      }
      if (name && phone && c.name.toLowerCase().includes(name.toLowerCase()) && cleanPhone === phone) {
        score += 40;
        reasons.push('Nome + telefone');
      }

      return { ...c, score, reasons };
    });

    // Sort by score desc, filter only meaningful matches
    const duplicates = scored
      .filter(c => c.score >= 30)
      .sort((a, b) => b.score - a.score);

    return NextResponse.json({
      duplicates,
      hasDuplicate: duplicates.some(d => d.score >= 70),
    });
  } catch (err) {
    console.error('Check-duplicate error:', err);
    return NextResponse.json({ error: 'Falha ao verificar duplicidade' }, { status: 500 });
  }
}
