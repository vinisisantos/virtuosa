import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { signToken, setAuthCookie } from "@/lib/auth";

const prisma = new PrismaClient();

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { email, password } = body;

        if (!email || !password) {
            return NextResponse.json({ error: "E-mail e senha são obrigatórios." }, { status: 400 });
        }

        // Find user by email
        const user = await prisma.user.findUnique({
            where: { email }
        });

        if (!user) {
            return NextResponse.json({ error: "Credenciais inválidas." }, { status: 401 });
        }

        if (!user.isActive) {
            return NextResponse.json({ error: "Sua conta está desativada. Contate um administrador." }, { status: 403 });
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return NextResponse.json({ error: "Credenciais inválidas." }, { status: 401 });
        }

        // Generate JWT token
        const token = await signToken({
            userId: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            unit: user.unit || undefined,
            permissions: (user.permissions as Record<string, boolean>) || undefined,
        });

        // Successful login — set httpOnly cookie + return user data
        const response = NextResponse.json({
            message: "Login bem-sucedido",
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                unit: user.unit,
                permissions: user.permissions
            }
        }, { status: 200 });

        return setAuthCookie(response, token);

    } catch (error) {
        console.error("Login error:", error);
        return NextResponse.json({ error: "Erro interno no servidor." }, { status: 500 });
    }
}
