import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeaders } from '@/lib/auth';
import { canonicalContractUnit, contractUnitFilterValues } from '@/lib/contract-units';
import { requireUnitGuard, UnitAccessDeniedError, unitAccessDeniedResponse } from '@/lib/unit-guard';

import { prisma } from "@/lib/db";

const TEMPLATES: Record<string, string> = {
  'Termo de Consentimento': `
TERMO DE CONSENTIMENTO INFORMADO

Eu, {{NOME}}, portador(a) do CPF {{CPF}}, declaro que fui devidamente informado(a) sobre o procedimento estético a ser realizado na clínica Virtuosa Estética, unidade {{UNIDADE}}.

PROCEDIMENTO: {{PROCEDIMENTO}}

Declaro que:
1. Fui informado(a) sobre os possíveis riscos e efeitos colaterais do procedimento.
2. Tive oportunidade de esclarecer todas as minhas dúvidas.
3. Autorizo a realização do procedimento descrito acima.
4. Estou ciente de que os resultados podem variar de pessoa para pessoa.
5. Comprometo-me a seguir todas as orientações pós-procedimento.

Data: {{DATA}}
Local: Virtuosa Estética — {{UNIDADE}}

_________________________
{{NOME}}
CPF: {{CPF}}
`,
  'Contrato de Pacote': `
CONTRATO DE PRESTAÇÃO DE SERVIÇOS

CONTRATANTE: {{NOME}}, CPF: {{CPF}}
CONTRATADA: Virtuosa Estética — Unidade {{UNIDADE}}

OBJETO: Prestação de serviços estéticos conforme pacote contratado.

PACOTE: {{PROCEDIMENTO}}
VALOR TOTAL: {{VALOR}}
FORMA DE PAGAMENTO: {{PAGAMENTO}}

CLÁUSULAS:
1. O presente contrato tem validade de 6 (seis) meses a partir da data de assinatura.
2. As sessões devem ser agendadas com antecedência mínima de 24 horas.
3. Faltas sem aviso prévio de 24h serão contabilizadas como sessão realizada.
4. O contrato não é transferível a terceiros.
5. Em caso de desistência, será cobrada multa de 20% sobre o valor restante.

Data: {{DATA}}
Local: Virtuosa Estética — {{UNIDADE}}

_________________________
{{NOME}}
CPF: {{CPF}}
`,
  'Autorização de Imagem': `
AUTORIZAÇÃO DE USO DE IMAGEM

Eu, {{NOME}}, CPF {{CPF}}, AUTORIZO a Virtuosa Estética a utilizar minha imagem (fotos antes/depois) para fins de:

☐ Portfolio interno
☐ Redes sociais
☐ Material publicitário
☐ Site institucional

Esta autorização é válida por tempo indeterminado e pode ser revogada a qualquer momento mediante solicitação formal.

Data: {{DATA}}
Unidade: {{UNIDADE}}

_________________________
{{NOME}}
CPF: {{CPF}}
`,
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const clientName = searchParams.get('clientName');
  const guard = requireUnitGuard(req, { requestedUnit: searchParams.get('unit') });
  if (guard instanceof NextResponse) return guard;

  if (id) {
    const contract = await prisma.digitalContract.findUnique({ where: { id } });
    if (!contract) return NextResponse.json({ error: 'Contrato não encontrado' }, { status: 404 });
    try {
      guard.enforceUnit(canonicalContractUnit(contract.unit) || contract.unit);
    } catch (error) {
      if (error instanceof UnitAccessDeniedError) return unitAccessDeniedResponse(error);
      throw error;
    }
    return NextResponse.json(contract);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (clientName) where.clientName = { contains: clientName };
  if (guard.unitFilter) where.unit = { in: contractUnitFilterValues(guard.unitFilter) };

  if (clientName) {
    const contracts = await prisma.digitalContract.findMany({
      where,
      select: {
        id: true,
        clientName: true,
        clientCpf: true,
        templateName: true,
        content: true,
        status: true,
        signingToken: true,
        signedAt: true,
        signatureIp: true,
        unit: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return NextResponse.json({ contracts, templates: Object.keys(TEMPLATES) });
  }

  const contracts = await prisma.digitalContract.findMany({
    where,
    select: {
      id: true,
      clientName: true,
      templateName: true,
      status: true,
      unit: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  const templates = Object.keys(TEMPLATES);
  return NextResponse.json({ contracts, templates });
}

export async function POST(req: NextRequest) {
  const user = getUserFromHeaders(req);
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const body = await req.json();
  const requestedUnit = canonicalContractUnit(body.unit);
  const template = TEMPLATES[body.templateName] || TEMPLATES['Termo de Consentimento'];
  const now = new Date();

  const content = template
    .replace(/\{\{NOME\}\}/g, body.clientName || '')
    .replace(/\{\{CPF\}\}/g, body.clientCpf || '')
    .replace(/\{\{UNIDADE\}\}/g, requestedUnit || 'SCS')
    .replace(/\{\{PROCEDIMENTO\}\}/g, body.procedimento || '')
    .replace(/\{\{VALOR\}\}/g, body.valor || '')
    .replace(/\{\{PAGAMENTO\}\}/g, body.pagamento || '')
    .replace(/\{\{DATA\}\}/g, now.toLocaleDateString('pt-BR'));

  const contract = await prisma.digitalContract.create({
    data: {
      clientName: body.clientName,
      clientCpf: body.clientCpf || null,
      clientEmail: body.clientEmail || null,
      templateName: body.templateName,
      content,
      unit: user.isAdmin
        ? (requestedUnit || 'SCS')
        : (canonicalContractUnit(user.unit) || user.unit),
    },
  });
  return NextResponse.json(contract);
}

export async function PUT(req: NextRequest) {
  const user = getUserFromHeaders(req);
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const body = await req.json();

  if (!user.isAdmin) {
    const existing = await prisma.digitalContract.findUnique({ where: { id: body.id }, select: { unit: true } });
    if (!existing || existing.unit !== user.unit) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }
  }

  const data: Record<string, unknown> = {};
  if (body.status) data.status = body.status;
  if (body.status === 'assinado') {
    data.signedAt = new Date();
    data.signatureIp = body.ip || 'unknown';
  }
  const updated = await prisma.digitalContract.update({ where: { id: body.id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const user = getUserFromHeaders(req);
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

  const contract = await prisma.digitalContract.findUnique({
    where: { id },
    select: { id: true, unit: true },
  });
  if (!contract) return NextResponse.json({ error: 'Contrato não encontrado' }, { status: 404 });

  if (!user.isAdmin && contract.unit !== user.unit) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  await prisma.digitalContract.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
