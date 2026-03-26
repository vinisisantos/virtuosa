import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// GET all users (Admin only)
export async function GET(request: Request) {
    try {
        const users = await prisma.user.findMany({
            orderBy: { name: 'asc' }
        });
        
        // Strip out passwords securely
        const safeUsers = users.map(user => {
            const { password, ...safeUser } = user;
            return safeUser;
        });

        return NextResponse.json(safeUsers);
    } catch (error) {
        console.error('Error fetching users:', error);
        return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }
}

// CREATE new user
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { name, email, password, phone, role, unit, isActive, permissions } = body;

        // Basic validation
        if (!name || !email || !password) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Check if email already exists
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return NextResponse.json({ error: 'Email already in use' }, { status: 400 });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                phone: phone || null,
                role: role || 'VENDEDOR',
                unit: unit || 'Barueri',
                isActive: isActive !== undefined ? isActive : true,
                permissions: permissions || {} // JSON type
            }
        });

        const { password: _, ...safeUser } = newUser;
        return NextResponse.json(safeUser, { status: 201 });
    } catch (error) {
        console.error('Error creating user:', error);
        return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
    }
}

// UPDATE user
export async function PUT(request: Request) {
    try {
        const body = await request.json();
        const { id, name, email, phone, role, unit, isActive, permissions, password } = body;

        if (!id) {
            return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
        }

        // Prepare update data — only include fields that were explicitly provided
        const updateData: any = {};
        if (name !== undefined) updateData.name = name;
        if (email !== undefined) updateData.email = email;
        if (phone !== undefined) updateData.phone = phone;
        if (role !== undefined) updateData.role = role;
        if (unit !== undefined) updateData.unit = unit;
        if (isActive !== undefined) updateData.isActive = isActive;
        if (permissions !== undefined) updateData.permissions = permissions;

        // Only update password if a new one is provided in the packet
        if (password && password.trim() !== '') {
            updateData.password = await bcrypt.hash(password, 10);
        }

        const updatedUser = await prisma.user.update({
            where: { id },
            data: updateData
        });

        const { password: _, ...safeUser } = updatedUser;
        return NextResponse.json(safeUser);
    } catch (error) {
        console.error('Error updating user:', error);
        return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
    }
}

// DELETE user
export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
        }

        await prisma.user.delete({
            where: { id }
        });

        return NextResponse.json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
        console.error('Error deleting user:', error);
        return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
    }
}
