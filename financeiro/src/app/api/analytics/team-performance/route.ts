import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { jwtVerify } from "jose";

if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET environment variable is required");
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

type JwtPermissions = {
  admin?: boolean;
};

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("virtuosa_token")?.value
      || req.headers.get("authorization")?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, JWT_SECRET);
    
    const role = payload.role as string;
    const permissions = payload.permissions as JwtPermissions | undefined;
    const isAdmin = role === "ADMINISTRADOR" || permissions?.admin === true;

    if (!isAdmin) {
      return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });
    }

    // Busca usuários
    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, role: true, unit: true, email: true }
    });

    // Busca vendas fechadas
    const wonDeals = await prisma.salesPipeline.groupBy({
      by: ["assignedTo", "unit"],
      where: { stage: "fechado" },
      _sum: { value: true },
      _count: true,
    });

    const performance = users.map(user => {
      const userDeals = wonDeals.filter(d => d.assignedTo === user.id);

      let totalValue = 0;
      let totalDeals = 0;
      const breakdown = userDeals.map(d => {
        totalValue += d._sum.value || 0;
        totalDeals += d._count;
        return {
          unit: d.unit || "Desconhecida",
          value: d._sum.value || 0,
          dealsCount: d._count
        };
      });

      return {
        id: user.id,
        name: user.name,
        role: user.role,
        email: user.email,
        totalValue,
        totalDeals,
        breakdown: breakdown.sort((a, b) => b.value - a.value)
      };
    }).sort((a, b) => b.totalValue - a.totalValue);

    return NextResponse.json({ performance });
  } catch (error) {
    console.error("Erro no Team Performance:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
