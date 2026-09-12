import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { calc, deserializeProtocol, serializeProtocol } from '@/lib/procedure-pricing';
import { requireUnitGuard, UnitAccessDeniedError, unitAccessDeniedResponse } from '@/lib/unit-guard';
import { ACTIVE_UNITS } from '@/lib/role-access';

function failure(error: unknown) {
  if (error instanceof UnitAccessDeniedError) return unitAccessDeniedResponse();
  return NextResponse.json({ error: error instanceof Error ? error.message : 'Não foi possível salvar o cálculo.' }, { status: 400 });
}

export async function GET(req: NextRequest) {
  const guard = requireUnitGuard(req, { requestedUnit: req.nextUrl.searchParams.get('unit') });
  if (guard instanceof NextResponse) return guard;
  if (!guard.isAdmin && !guard.unitFilter) return unitAccessDeniedResponse();
  const scope = guard.unitFilter ? { OR: [{ unit: guard.unitFilter }, { unit: 'Todas' }] } : {};
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (id) {
      const protocol = await prisma.pricingProtocol.findFirst({ where: { ...scope, id } });
      return protocol ? NextResponse.json(protocol) : NextResponse.json({ error: 'Protocolo não encontrado.' }, { status: 404 });
    }
    const protocols = await prisma.pricingProtocol.findMany({ where: scope, orderBy: { updatedAt: 'desc' } });
    return NextResponse.json({ protocols });
  } catch { return NextResponse.json({ error: 'Não foi possível carregar os protocolos.' }, { status: 500 }); }
}

async function save(req: NextRequest, update: boolean) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;
  try {
    const body = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Cadastro inválido.');
    if (body.unit !== undefined && (typeof body.unit !== 'string' || ![...ACTIVE_UNITS, 'Todas'].includes(body.unit))) throw new Error('Unidade inválida.');
    const state = deserializeProtocol(body);
    if (!state.nome.trim() || state.nome.length > 200) throw new Error('Informe um nome de até 200 caracteres.');
    const result = calc(state);
    if (!result.valid) throw new Error(result.errors.join(' '));
    if (state.pricing && !ACTIVE_UNITS.includes(state.pricing.unit as typeof ACTIVE_UNITS[number])) throw new Error('Escolha uma unidade para o cálculo.');
    const requestedUnit = state.pricing?.unit || body.unit;
    if (requestedUnit && requestedUnit !== 'Todas') guard.enforceUnit(requestedUnit);
    const serialized = serializeProtocol(state);
    const data = { ...serialized, insumos: serialized.insumos as unknown as Prisma.InputJsonValue };
    let unit = guard.createUnit(requestedUnit);
    if (update) {
      if (typeof body.id !== 'string' || !body.id) throw new Error('ID obrigatório.');
      const existing = await prisma.pricingProtocol.findUnique({ where: { id: body.id }, select: { unit: true, insumos: true } });
      if (!existing) return NextResponse.json({ error: 'Protocolo não encontrado.' }, { status: 404 });
      guard.enforceUnit(existing.unit);
      const existingV2 = !Array.isArray(existing.insumos) && existing.insumos !== null && typeof existing.insumos === 'object' && 'version' in existing.insumos && existing.insumos.version === 2;
      if (existingV2 !== Boolean(state.pricing)) throw new Error('Salve uma cópia para mudar a versão do cálculo. O original será preservado.');
      if (state.pricing && state.pricing.unit !== existing.unit) throw new Error('Salve uma cópia para outra unidade.');
      unit = existing.unit;
      const protocol = await prisma.pricingProtocol.update({ where: { id: body.id }, data: { ...data, unit } });
      return NextResponse.json(protocol);
    }
    if (!state.pricing && requestedUnit === 'Todas' && guard.isAdmin) unit = 'Todas';
    const protocol = await prisma.pricingProtocol.create({ data: { ...data, unit } });
    return NextResponse.json(protocol, { status: 201 });
  } catch (error) { return failure(error); }
}

export const POST = (req: NextRequest) => save(req, false);
export const PUT = (req: NextRequest) => save(req, true);

export async function DELETE(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) throw new Error('ID obrigatório.');
    const existing = await prisma.pricingProtocol.findUnique({ where: { id }, select: { unit: true } });
    if (!existing) return NextResponse.json({ error: 'Protocolo não encontrado.' }, { status: 404 });
    guard.enforceUnit(existing.unit);
    await prisma.pricingProtocol.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) { return failure(error); }
}
