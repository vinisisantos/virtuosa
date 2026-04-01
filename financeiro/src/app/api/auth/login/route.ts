import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { signToken, setAuthCookie } from "@/lib/auth";

const prisma = new PrismaClient();

// Simple in-memory rate limiter: max 5 attempts per IP per 15 minutes
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 5) return false;
  entry.count++;
  return true;
}

export async function POST(req: NextRequest) {
    try {
        // Rate limiting by IP
        const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
          || req.headers.get('x-real-ip')
          || 'unknown';

        if (!checkRateLimit(ip)) {
            return NextResponse.json(
                { error: "Muitas tentativas de login. Tente novamente em 15 minutos." },
                { status: 429 }
            );
        }

        const body = await req.json();
        const { email, password } = body;

        if (!email || !password) {
            return NextResponse.json({ error: "E-mail e senha são obrigatórios." }, { status: 400 });
        }

        const user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
            return NextResponse.json({ error: "Credenciais inválidas." }, { status: 401 });
        }

        if (!user.isActive) {
            return NextResponse.json({ error: "Sua conta está desativada. Contate um administrador." }, { status: 403 });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return NextResponse.json({ error: "Credenciais inválidas." }, { status: 401 });
        }

        const token = await signToken({
            userId: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            unit: user.unit || undefined,
            permissions: (user.permissions as Record<string, boolean>) || undefined,
        });

        const response = NextResponse.json({
            message: "Login bem-sucedido",
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                unit: user.unit,
                permissions: user.permissions,
            },
        }, { status: 200 });

        return setAuthCookie(response, token);

    } catch (error) {
        console.error("Login error:", error);
        return NextResponse.json({ error: "Erro interno no servidor." }, { status: 500 });
    }
}
