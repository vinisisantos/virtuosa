import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUnitGuard } from '@/lib/unit-guard';

/* ─── GET /api/relatorios?type=...&dateFrom=...&dateTo=...&profissionalId=...&vendedor=... ─── */
export async function GET(req: NextRequest) {
  const guard = requireUnitGuard(req, { requestedUnit: new URL(req.url).searchParams.get('unit') });
  if (guard instanceof NextResponse) return guard;

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') || '';
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const profissionalId = searchParams.get('profissionalId');
  const vendedor = searchParams.get('vendedor');

  const unitFilter = guard.unitFilter;

  // Parse date range
  const startDate = dateFrom ? new Date(dateFrom + 'T00:00:00Z') : null;
  const endDate = dateTo ? new Date(dateTo + 'T23:59:59Z') : null;

  try {
    switch (type) {

      /* ═══ ATENDIMENTOS ═══ */
      case 'atendimentos': {
        const where: any = {};
        if (unitFilter) where.unit = unitFilter;
        if (startDate && endDate) where.startTime = { gte: startDate, lte: endDate };
        const data = await prisma.agendamento.findMany({
          where, include: { profissional: true }, orderBy: { startTime: 'desc' },
        });
        return NextResponse.json({ success: true, type, data, count: data.length });
      }

      /* ═══ COMISSÃO DO PROFISSIONAL ═══ */
      case 'comissao-profissional': {
        const where: any = {};
        if (unitFilter) where.unit = unitFilter;
        if (startDate && endDate) where.startTime = { gte: startDate, lte: endDate };
        if (profissionalId && profissionalId !== 'todos') where.profissionalId = profissionalId;
        where.status = 'finalizado';
        const data = await prisma.agendamento.findMany({
          where, include: { profissional: true }, orderBy: { startTime: 'desc' },
        });
        return NextResponse.json({ success: true, type, data, count: data.length });
      }

      /* ═══ VALOR POR PROFISSIONAL ═══ */
      case 'valor-profissional': {
        const where: any = {};
        if (unitFilter) where.unit = unitFilter;
        if (startDate && endDate) where.startTime = { gte: startDate, lte: endDate };
        if (profissionalId && profissionalId !== 'todos') where.profissionalId = profissionalId;
        where.status = 'finalizado';
        const data = await prisma.agendamento.findMany({
          where, include: { profissional: true }, orderBy: { profissionalId: 'asc' },
        });
        return NextResponse.json({ success: true, type, data, count: data.length });
      }

      /* ═══ QUANTIDADE DE SESSÕES ═══ */
      case 'quantidade-sessoes': {
        const where: any = {};
        if (unitFilter) where.unit = unitFilter;
        if (startDate && endDate) where.startTime = { gte: startDate, lte: endDate };
        const data = await prisma.agendamento.findMany({
          where, include: { profissional: true }, orderBy: { startTime: 'desc' },
        });
        const byStatus: Record<string, number> = {};
        data.forEach((d: any) => { byStatus[d.status] = (byStatus[d.status] || 0) + 1; });
        return NextResponse.json({ success: true, type, data, count: data.length, summary: byStatus });
      }

      /* ═══ AGENDA POR STATUS ═══ */
      case 'agenda-status': {
        const where: any = {};
        if (unitFilter) where.unit = unitFilter;
        if (startDate && endDate) where.startTime = { gte: startDate, lte: endDate };
        const statusFilter = searchParams.get('statusFilter');
        if (statusFilter && statusFilter !== 'todos') where.status = statusFilter;
        const data = await prisma.agendamento.findMany({
          where, include: { profissional: true }, orderBy: { startTime: 'desc' },
        });
        return NextResponse.json({ success: true, type, data, count: data.length });
      }

      /* ═══ PACIENTES CADASTRADOS ═══ */
      case 'pacientes-cadastrados': {
        const where: any = {};
        if (unitFilter) where.unit = unitFilter;
        if (startDate && endDate) where.createdAt = { gte: startDate, lte: endDate };
        const data = await prisma.client.findMany({ where, orderBy: { createdAt: 'desc' } });
        return NextResponse.json({ success: true, type, data, count: data.length });
      }

      /* ═══ PACIENTES ATIVOS ═══ */
      case 'pacientes-ativos': {
        const where: any = { status: 'ativo' };
        if (unitFilter) where.unit = unitFilter;
        const data = await (prisma as any).package.findMany({ where, orderBy: { createdAt: 'desc' } });
        return NextResponse.json({ success: true, type, data, count: data.length });
      }

      /* ═══ SESSÕES VENDIDAS X REALIZADAS ═══ */
      case 'sessoes-vendidas-realizadas': {
        const where: any = {};
        if (unitFilter) where.unit = unitFilter;
        const packages = await (prisma as any).package.findMany({ where, orderBy: { createdAt: 'desc' } });
        const totalSold = packages.reduce((s: number, p: any) => s + p.totalSessions, 0);
        const totalDone = packages.reduce((s: number, p: any) => s + p.completedSessions, 0);
        return NextResponse.json({ success: true, type, data: packages, count: packages.length, summary: { totalSold, totalDone, remaining: totalSold - totalDone } });
      }

      /* ═══ TRATAMENTO PARADO ═══ */
      case 'tratamento-parado': {
        const where: any = { status: 'ativo' };
        if (unitFilter) where.unit = unitFilter;
        const packages = await (prisma as any).package.findMany({ where, orderBy: { updatedAt: 'asc' } });
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const stalled = packages.filter((p: any) => new Date(p.updatedAt) < thirtyDaysAgo);
        return NextResponse.json({ success: true, type, data: stalled, count: stalled.length });
      }

      /* ═══ CANCELAMENTOS ═══ */
      case 'cancelamentos': {
        const where: any = {};
        if (unitFilter) where.unit = unitFilter;
        if (startDate && endDate) where.createdAt = { gte: startDate, lte: endDate };
        const data = await prisma.cancelamentoHistory.findMany({ where, orderBy: { createdAt: 'desc' } });
        return NextResponse.json({ success: true, type, data, count: data.length });
      }

      /* ═══ RANKING DE VENDAS ═══ */
      case 'ranking-vendas': {
        const where: any = {};
        if (unitFilter) where.unit = unitFilter;
        if (startDate && endDate) where.createdAt = { gte: startDate, lte: endDate };
        const packages = await (prisma as any).package.findMany({ where, orderBy: { totalValue: 'desc' } });
        return NextResponse.json({ success: true, type, data: packages, count: packages.length });
      }

      /* ═══ RANKING DE VENDAS POR CLIENTE ═══ */
      case 'ranking-vendas-cliente': {
        const where: any = {};
        if (unitFilter) where.unit = unitFilter;
        if (startDate && endDate) where.createdAt = { gte: startDate, lte: endDate };
        const packages = await (prisma as any).package.findMany({ where });
        const clientMap: Record<string, { totalValue: number; count: number }> = {};
        packages.forEach((p: any) => {
          if (!clientMap[p.clientName]) clientMap[p.clientName] = { totalValue: 0, count: 0 };
          clientMap[p.clientName].totalValue += p.totalValue;
          clientMap[p.clientName].count++;
        });
        const ranked = Object.entries(clientMap)
          .map(([name, d]) => ({ name, ...d, ticketMedio: d.totalValue / d.count }))
          .sort((a, b) => b.totalValue - a.totalValue);
        return NextResponse.json({ success: true, type, data: ranked, count: ranked.length });
      }

      /* ═══ VENDAS DETALHADAS ═══ */
      case 'vendas-detalhadas': {
        const where: any = {};
        if (unitFilter) where.unit = unitFilter;
        if (startDate && endDate) where.createdAt = { gte: startDate, lte: endDate };
        const data = await (prisma as any).package.findMany({ where, orderBy: { createdAt: 'desc' } });
        return NextResponse.json({ success: true, type, data, count: data.length });
      }

      /* ═══ CLIENTES POR TICKET MÉDIO ═══ */
      case 'clientes-ticket-medio': {
        const where: any = {};
        if (unitFilter) where.unit = unitFilter;
        if (startDate && endDate) where.createdAt = { gte: startDate, lte: endDate };
        const packages = await (prisma as any).package.findMany({ where });
        const clientMap: Record<string, { totalValue: number; count: number }> = {};
        packages.forEach((p: any) => {
          if (!clientMap[p.clientName]) clientMap[p.clientName] = { totalValue: 0, count: 0 };
          clientMap[p.clientName].totalValue += p.totalValue;
          clientMap[p.clientName].count++;
        });
        const ranked = Object.entries(clientMap)
          .map(([name, d]) => ({ name, ...d, ticketMedio: d.totalValue / d.count }))
          .sort((a, b) => b.ticketMedio - a.ticketMedio);
        return NextResponse.json({ success: true, type, data: ranked, count: ranked.length });
      }

      /* ═══ PRODUTOS DISPONÍVEIS NO ESTOQUE ═══ */
      case 'estoque-disponivel': {
        const where: any = { isActive: true };
        if (unitFilter) where.unit = unitFilter;
        const data = await prisma.stockItem.findMany({ where, orderBy: { name: 'asc' } });
        return NextResponse.json({ success: true, type, data, count: data.length });
      }

      /* ═══ MOVIMENTAÇÃO DE ESTOQUE ═══ */
      case 'movimentacao-estoque': {
        const itemWhere: any = { isActive: true };
        if (unitFilter) itemWhere.unit = unitFilter;
        const items = await prisma.stockItem.findMany({ where: itemWhere, select: { id: true } });
        const itemIds = items.map(i => i.id);
        const moveWhere: any = { stockItemId: { in: itemIds } };
        if (startDate && endDate) moveWhere.createdAt = { gte: startDate, lte: endDate };
        const data = await prisma.stockMovement.findMany({
          where: moveWhere, include: { stockItem: true }, orderBy: { createdAt: 'desc' },
        });
        return NextResponse.json({ success: true, type, data, count: data.length });
      }

      /* ═══ AGENDAMENTOS POR PERÍODO ═══ */
      case 'agendamentos-periodo': {
        const where: any = {};
        if (unitFilter) where.unit = unitFilter;
        if (startDate && endDate) where.startTime = { gte: startDate, lte: endDate };
        const data = await prisma.agendamento.findMany({
          where, include: { profissional: true }, orderBy: { startTime: 'desc' },
        });
        return NextResponse.json({ success: true, type, data, count: data.length });
      }

      /* ═══ COMISSÃO DE VENDEDOR ═══ */
      case 'comissao-vendedor': {
        const where: any = {};
        if (unitFilter) where.unit = unitFilter;
        if (startDate && endDate) where.createdAt = { gte: startDate, lte: endDate };
        const packages = await (prisma as any).package.findMany({ where, orderBy: { createdAt: 'desc' } });
        return NextResponse.json({ success: true, type, data: packages, count: packages.length, vendedorFilter: vendedor });
      }

      /* ═══ TRATAMENTOS FINALIZADOS ═══ */
      case 'tratamentos-finalizados': {
        const where: any = { status: 'concluido' };
        if (unitFilter) where.unit = unitFilter;
        if (startDate && endDate) where.updatedAt = { gte: startDate, lte: endDate };
        const data = await (prisma as any).package.findMany({ where, orderBy: { updatedAt: 'desc' } });
        return NextResponse.json({ success: true, type, data, count: data.length });
      }

      /* ═══ SESSÕES RESTANTES ═══ */
      case 'sessoes-restantes': {
        const where: any = { status: 'ativo' };
        if (unitFilter) where.unit = unitFilter;
        const packages = await (prisma as any).package.findMany({ where, orderBy: { clientName: 'asc' } });
        const data = packages.map((p: any) => ({
          clientName: p.clientName, totalSessions: p.totalSessions,
          completedSessions: p.completedSessions, remaining: p.totalSessions - p.completedSessions,
          services: p.services,
        }));
        return NextResponse.json({ success: true, type, data, count: data.length });
      }

      /* ═══ ORÇAMENTOS ═══ */
      case 'orcamentos': {
        const where: any = {};
        if (unitFilter) where.unit = unitFilter;
        if (startDate && endDate) where.createdAt = { gte: startDate, lte: endDate };
        const data = await (prisma as any).package.findMany({ where, orderBy: { createdAt: 'desc' } });
        return NextResponse.json({ success: true, type, data, count: data.length });
      }

      /* ═══ ANIVERSARIANTES ═══ */
      case 'aniversariantes': {
        const where: any = {};
        if (unitFilter) where.unit = unitFilter;
        const clients = await prisma.client.findMany({ where, orderBy: { name: 'asc' } });
        // Filter by birth month if dates provided
        let filtered = clients;
        if (startDate && endDate) {
          const startMonth = startDate.getUTCMonth() + 1;
          const endMonth = endDate.getUTCMonth() + 1;
          filtered = clients.filter((c: any) => {
            if (!c.birthDate) return false;
            const bd = new Date(c.birthDate);
            const m = bd.getUTCMonth() + 1;
            return m >= startMonth && m <= endMonth;
          });
        }
        return NextResponse.json({ success: true, type, data: filtered, count: filtered.length });
      }

      /* ═══ FOLHA DE PAGAMENTO ═══ */
      case 'folha-pagamento': {
        if (!startDate) return NextResponse.json({ error: 'Data obrigatória' }, { status: 400 });
        const month = startDate.getUTCMonth() + 1;
        const year = startDate.getUTCFullYear();
        const whereClause: any = { competenceMonth: month, competenceYear: year };
        if (unitFilter) whereClause.unit = unitFilter;
        const imports = await prisma.payrollImport.findMany({
          where: whereClause, include: { entries: { orderBy: { employeeName: 'asc' } } },
        });
        const entries = imports.flatMap(i => i.entries);
        const total = entries.reduce((s, e) => s + e.netSalary, 0);
        return NextResponse.json({ success: true, type, data: entries, count: entries.length, summary: { total } });
      }

      /* ═══ REEMBOLSOS ═══ */
      case 'reembolsos': {
        const where: any = {};
        if (unitFilter) where.unit = unitFilter;
        if (startDate && endDate) where.createdAt = { gte: startDate, lte: endDate };
        const data = await (prisma as any).reembolsoTicket.findMany({
          where, include: { items: true }, orderBy: { createdAt: 'desc' },
        });
        return NextResponse.json({ success: true, type, data, count: data.length });
      }

      /* ═══ PROCEDIMENTOS CONTRATADOS ═══ */
      case 'procedimentos-contratados': {
        const where: any = {};
        if (unitFilter) where.unit = unitFilter;
        if (startDate && endDate) where.createdAt = { gte: startDate, lte: endDate };
        const packages = await (prisma as any).package.findMany({ where });
        const procMap: Record<string, { count: number; totalValue: number }> = {};
        packages.forEach((p: any) => {
          try {
            const svcs = JSON.parse(p.services);
            if (Array.isArray(svcs)) {
              svcs.forEach((s: any) => {
                const name = s.name || 'Outros';
                if (!procMap[name]) procMap[name] = { count: 0, totalValue: 0 };
                procMap[name].count += parseInt(s.quantity) || 1;
                procMap[name].totalValue += parseFloat(s.unitPrice) * (parseInt(s.quantity) || 1);
              });
            }
          } catch { /* ignore parse error */ }
        });
        const data = Object.entries(procMap)
          .map(([name, d]) => ({ name, ...d }))
          .sort((a, b) => b.count - a.count);
        return NextResponse.json({ success: true, type, data, count: data.length });
      }

      /* ═══ FINANCEIRO GERAL ═══ */
      case 'financeiro-geral': {
        const pkgWhere: any = {};
        if (unitFilter) pkgWhere.unit = unitFilter;
        if (startDate && endDate) pkgWhere.createdAt = { gte: startDate, lte: endDate };
        const packages = await (prisma as any).package.findMany({ where: pkgWhere });
        const totalVendas = packages.reduce((s: number, p: any) => s + p.totalValue, 0);
        const totalPago = packages.reduce((s: number, p: any) => s + p.paidValue, 0);
        return NextResponse.json({
          success: true, type, count: packages.length,
          summary: { totalVendas, totalPago, totalPendente: totalVendas - totalPago, totalPackages: packages.length },
          data: packages,
        });
      }

      /* ═══ RANKING DE EXECUÇÃO ═══ */
      case 'ranking-execucao': {
        const where: any = { status: 'finalizado' };
        if (unitFilter) where.unit = unitFilter;
        if (startDate && endDate) where.startTime = { gte: startDate, lte: endDate };
        const agendamentos = await prisma.agendamento.findMany({
          where, include: { profissional: true }, orderBy: { startTime: 'desc' },
        });
        const procMap: Record<string, number> = {};
        agendamentos.forEach((a: any) => {
          procMap[a.procedimento] = (procMap[a.procedimento] || 0) + 1;
        });
        const data = Object.entries(procMap)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count);
        return NextResponse.json({ success: true, type, data, count: data.length });
      }

      /* ═══ ANDAMENTO DE TRATAMENTOS ═══ */
      case 'andamento-tratamentos': {
        const where: any = { status: 'ativo' };
        if (unitFilter) where.unit = unitFilter;
        const data = await (prisma as any).package.findMany({ where, orderBy: { clientName: 'asc' } });
        return NextResponse.json({ success: true, type, data, count: data.length });
      }

      /* ═══ CUSTOS FIXOS ═══ */
      case 'custos-fixos': {
        // Fixed costs are stored in localStorage backup — return financial backup
        const where: any = {};
        if (unitFilter) where.unit = unitFilter;
        const backup = await prisma.financialBackup.findFirst({ where, orderBy: { updatedAt: 'desc' } });
        let fixed: any[] = [];
        if (backup) {
          try { fixed = JSON.parse(backup.fixed || '[]'); } catch { /* ignore */ }
        }
        return NextResponse.json({ success: true, type, data: fixed, count: fixed.length });
      }

      /* ═══ DESPESAS VARIÁVEIS ═══ */
      case 'despesas-variaveis': {
        const where: any = {};
        if (unitFilter) where.unit = unitFilter;
        const backup = await prisma.financialBackup.findFirst({ where, orderBy: { updatedAt: 'desc' } });
        let logs: any[] = [];
        if (backup) {
          try { logs = JSON.parse(backup.logs || '[]'); } catch { /* ignore */ }
        }
        const costs = logs.filter((l: any) => l.type === 'cost');
        if (startDate && endDate) {
          const filtered = costs.filter((l: any) => {
            if (!l.date) return false;
            const d = new Date(l.date);
            return d >= startDate && d <= endDate;
          });
          return NextResponse.json({ success: true, type, data: filtered, count: filtered.length });
        }
        return NextResponse.json({ success: true, type, data: costs, count: costs.length });
      }

      /* ═══ PREMIAÇÃO POR COLABORADOR ═══ */
      case 'premiacao-colaborador': {
        const where: any = {};
        if (unitFilter) where.unit = unitFilter;
        if (startDate && endDate) where.createdAt = { gte: startDate, lte: endDate };
        where.type = 'PREMIACAO';
        const data = await prisma.adiantamento.findMany({ where, orderBy: { createdAt: 'desc' } });
        return NextResponse.json({ success: true, type, data, count: data.length });
      }

      /* ═══ PACIENTES INCOMPLETOS ═══ */
      case 'pacientes-incompletos': {
        const where: any = {};
        if (unitFilter) where.unit = unitFilter;
        const clients = await prisma.client.findMany({ where, orderBy: { name: 'asc' } });
        const incomplete = clients.filter((c: any) => !c.phone || !c.email || !c.cpf);
        return NextResponse.json({ success: true, type, data: incomplete, count: incomplete.length });
      }

      default:
        return NextResponse.json({ error: `Tipo de relatório desconhecido: ${type}` }, { status: 400 });
    }
  } catch (err: any) {
    console.error(`[Relatórios] Error generating ${type}:`, err);
    return NextResponse.json({ error: err.message || 'Erro ao gerar relatório' }, { status: 500 });
  }
}
