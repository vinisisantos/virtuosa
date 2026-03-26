import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            nome_completo = '',
            estado_civil = '',
            profissao = '',
            cpf = '',
            rg = '',
            endereco_completo = '',
            nome_clinica = '',
            cnpj_clinica = '',
            endereco_clinica = '',
            data_venda = '',
            // Tables
            itens_da_venda = '',
            condicoes_pagamento_venda = '',
        } = body;

        // Read the template DOCX file
        const customTemplateFileName = body.templateFileName;
        const templateBase64 = body.templateBase64;
        let content: string;

        if (templateBase64) {
            // Use the base64-encoded template sent from the frontend (Vercel-compatible)
            content = Buffer.from(templateBase64, 'base64').toString('binary');
        } else {
            // Fallback: read from the default file in public/
            let templatePath = path.join(process.cwd(), 'public', 'CONTRATO-DE-PRESTAÇÃO-DE-SERVIÇOS.docx');
            
            if (customTemplateFileName) {
                templatePath = path.join(process.cwd(), 'public', 'templates', customTemplateFileName);
            }

            if (!fs.existsSync(templatePath)) {
                return NextResponse.json(
                    { error: 'Template de contrato não encontrado no servidor.' },
                    { status: 404 }
                );
            }

            content = fs.readFileSync(templatePath, 'binary');
        }

        const zip = new PizZip(content);

        // Pre-process: fix split runs in the DOCX XML
        // Word often splits {{ variable }} across multiple <w:r> elements
        // We need to merge them back together for docxtemplater to work
        const docXml = zip.file('word/document.xml');
        if (docXml) {
            let xmlContent = docXml.asText();
            
            // Regex to find {{ ... }} patterns split across multiple runs
            // This merges runs that together form a template tag
            // Strategy: find {{ in one run, content in next, }} in another and merge them
            
            // First, extract all text and rebuild with merged template tags
            // Remove runs between {{ and }} and merge into single run
            const mergeTemplateRuns = (xml: string): string => {
                // Pattern: find sequences of runs where the combined text forms {{ ... }}
                // We look for <w:r ...>...<w:t ...>{{</w:t></w:r> followed by runs until }}</w:t></w:r>
                
                // Simpler approach: extract text from consecutive runs, detect template patterns,
                // and replace the first run's text with the full template while removing middle runs
                
                const runPattern = /<w:r\b[^>]*>(?:(?!<w:r\b)[\s\S])*?<\/w:r>/g;
                const textPattern = /<w:t[^>]*>(.*?)<\/w:t>/g;
                
                const runs: { match: string; index: number; text: string }[] = [];
                let m;
                while ((m = runPattern.exec(xml)) !== null) {
                    const texts: string[] = [];
                    let tm;
                    const localPattern = /<w:t[^>]*>(.*?)<\/w:t>/g;
                    while ((tm = localPattern.exec(m[0])) !== null) {
                        texts.push(tm[1]);
                    }
                    runs.push({ match: m[0], index: m.index, text: texts.join('') });
                }
                
                // Find sequences that form template tags
                let result = xml;
                const replacements: { start: number; end: number; mergedText: string; keepRunIndex: number }[] = [];
                
                for (let i = 0; i < runs.length; i++) {
                    if (runs[i].text.includes('{{') && runs[i].text.includes('}}')) {
                        continue; // Already complete
                    }
                    
                    if (runs[i].text.includes('{{')) {
                        // Start of a template tag — find the closing }}
                        let combined = runs[i].text;
                        let j = i + 1;
                        while (j < runs.length && !combined.includes('}}')) {
                            combined += runs[j].text;
                            j++;
                        }
                        
                        if (combined.includes('}}')) {
                            // Found a complete tag across runs i to j-1
                            replacements.push({
                                start: i,
                                end: j - 1,
                                mergedText: combined.trim(),
                                keepRunIndex: i,
                            });
                        }
                    }
                }
                
                // Apply replacements in reverse order
                for (let r = replacements.length - 1; r >= 0; r--) {
                    const rep = replacements[r];
                    
                    // Update the first run to contain the full text
                    const firstRun = runs[rep.start];
                    const newFirstRun = firstRun.match.replace(
                        /<w:t[^>]*>.*?<\/w:t>/,
                        `<w:t xml:space="preserve">${rep.mergedText}</w:t>`
                    );
                    
                    // Remove middle and end runs (keep only the first, modified one)
                    // Build the replacement string
                    const startPos = runs[rep.start].index;
                    const endPos = runs[rep.end].index + runs[rep.end].match.length;
                    
                    result = result.substring(0, startPos) + newFirstRun + result.substring(endPos);
                }
                
                return result;
            };

            xmlContent = mergeTemplateRuns(xmlContent);
            
            // Also fix the space in "nome_ clinica" -> "nome_clinica"
            xmlContent = xmlContent.replace(/\{\{\s*nome_\s+clinica\s*\}\}/g, '{{nome_clinica}}');
            
            // Update the zip with cleaned XML
            zip.file('word/document.xml', xmlContent);
        }

        const doc = new Docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true,
            delimiters: { start: '{{', end: '}}' },
        });

        // Set the template data
        doc.render({
            nome_completo,
            estado_civil,
            profissao,
            cpf,
            rg,
            endereco_completo,
            nome_clinica,
            'nome_ clinica': nome_clinica, // Handle the original variable with space
            cnpj_clinica,
            endereco_clinica,
            data_venda,
            itens_da_venda,
            condicoes_pagamento_venda,
        });

        // Generate output
        const buf = doc.getZip().generate({
            type: 'nodebuffer',
            compression: 'DEFLATE',
        }) as Buffer;

        // Convert to Uint8Array for NextResponse compatibility
        const uint8 = new Uint8Array(buf);

        // Return as downloadable DOCX
        const fileName = `Contrato_${nome_completo.replace(/\s+/g, '_') || 'Cliente'}_${new Date().toISOString().slice(0, 10)}.docx`;

        return new NextResponse(uint8, {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
            },
        });
    } catch (err: any) {
        console.error('Contract generation error:', err);
        
        // Check for docxtemplater-specific errors
        if (err?.properties?.errors) {
            const templateErrors = err.properties.errors.map((e: any) => ({
                message: e.message,
                id: e.properties?.id,
            }));
            return NextResponse.json(
                { error: 'Erro no template do contrato', details: templateErrors },
                { status: 500 }
            );
        }
        
        return NextResponse.json(
            { error: 'Erro ao gerar contrato: ' + (err.message || 'Erro desconhecido') },
            { status: 500 }
        );
    }
}
