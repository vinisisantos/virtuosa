import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { name, email, password } = body;

        if (!name || !email || !password) {
            return NextResponse.json({ error: "Nome, e-mail e senha são obrigatórios." }, { status: 400 });
        }

        // Check if user already exists
        const existingUser = await prisma.user.findUnique({
            where: { email }
        });

        if (existingUser) {
            return NextResponse.json({ error: "Este e-mail já está em uso." }, { status: 409 });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Determine First User Role (Optional logic: Make first user ADMIN)
        const userCount = await prisma.user.count();
        const isFirstUser = userCount === 0;
        const role = isFirstUser ? "ADMINISTRADOR" : "VENDEDOR";

        // Default permissions: admin gets all, others get basic access
        const defaultPermissions = isFirstUser
            ? { dashboard: true, cancelamento: true, pedidos: true, financeiro: true, perfil: true, usuarios: true, relatorios: true, admin: true }
            : { dashboard: true, perfil: true };

        // Create user
        const newUser = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                role,
                permissions: defaultPermissions as any,
            }
        });

        return NextResponse.json({
            message: "Usuário registrado com sucesso",
            user: {
                id: newUser.id,
                name: newUser.name,
                email: newUser.email,
                role: newUser.role,
                unit: newUser.unit,
                permissions: (newUser as any).permissions,
                isActive: newUser.isActive,
            }
        }, { status: 201 });

    } catch (error) {
        console.error("Register error:", error);
        return NextResponse.json({ error: "Erro interno no servidor." }, { status: 500 });
    }
}
