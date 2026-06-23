import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getUserFromHeaders } from '@/lib/auth';

import { prisma } from "@/lib/db";

// GET all users (Admin only)
export async function GET(req: NextRequest) {
    const user = getUserFromHeaders(req);
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    if (!user.isAdmin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

    try {
        const users = await prisma.user.findMany({ orderBy: { name: 'asc' } });
        const safeUsers = users.map(({ password, ...u }) => u);
        return NextResponse.json(safeUsers);
    } catch (error) {
        console.error('Error fetching users:', error);
        return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }
}

// CREATE new user (Admin only)
export async function POST(req: NextRequest) {
    const user = getUserFromHeaders(req);
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    if (!user.isAdmin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

    try {
        const body = await req.json();
        const { name, email, password, phone, role, unit, isActive, permissions } = body;

        if (!name || !email || !password) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return NextResponse.json({ error: 'Email already in use' }, { status: 400 });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await prisma.user.create({
            data: {
                name, email, password: hashedPassword, phone: phone || null,
                role: role || 'VENDEDOR', unit: unit || 'SCS',
                isActive: isActive !== undefined ? isActive : true,
                permissions: permissions || {},
            },
        });

        const { password: _, ...safeUser } = newUser;
        return NextResponse.json(safeUser, { status: 201 });
    } catch (error) {
        console.error('Error creating user:', error);
        return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
    }
}

// UPDATE user (Admin only)
export async function PUT(req: NextRequest) {
    const user = getUserFromHeaders(req);
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    if (!user.isAdmin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

    try {
        const body = await req.json();
        const { id, name, email, phone, role, unit, isActive, permissions, password } = body;

        if (!id) return NextResponse.json({ error: 'User ID is required' }, { status: 400 });

        const updateData: any = {};
        if (name !== undefined) updateData.name = name;
        if (email !== undefined) updateData.email = email;
        if (phone !== undefined) updateData.phone = phone;
        if (role !== undefined) updateData.role = role;
        if (unit !== undefined) updateData.unit = unit;
        if (isActive !== undefined) updateData.isActive = isActive;
        if (permissions !== undefined) updateData.permissions = permissions;

        if (password && password.trim() !== '') {
            updateData.password = await bcrypt.hash(password, 10);
        }

        const updatedUser = await prisma.user.update({ where: { id }, data: updateData });
        const { password: _, ...safeUser } = updatedUser;
        return NextResponse.json(safeUser);
    } catch (error) {
        console.error('Error updating user:', error);
        return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
    }
}

// DELETE user (Admin only)
export async function DELETE(req: NextRequest) {
    const user = getUserFromHeaders(req);
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    if (!user.isAdmin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');
        if (!id) return NextResponse.json({ error: 'User ID is required' }, { status: 400 });

        await prisma.user.delete({ where: { id } });
        return NextResponse.json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
        console.error('Error deleting user:', error);
        return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
    }
}
