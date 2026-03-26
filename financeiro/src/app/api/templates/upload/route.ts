import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        
        // Ensure directory exists
        const templatesDir = path.join(process.cwd(), 'public', 'templates');
        if (!fs.existsSync(templatesDir)) {
            fs.mkdirSync(templatesDir, { recursive: true });
        }

        // Generate a safe unique filename to prevent overwriting
        const originalName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const uniqueFileName = `${Date.now()}_${originalName}`;
        const filePath = path.join(templatesDir, uniqueFileName);

        // Save file
        fs.writeFileSync(filePath, buffer);

        return NextResponse.json({ 
            success: true, 
            fileName: uniqueFileName,
            originalName: file.name
        });
    } catch (error: any) {
        console.error('Erro no upload do template:', error);
        return NextResponse.json({ error: 'Falha ao salvar o modelo: ' + error.message }, { status: 500 });
    }
}
