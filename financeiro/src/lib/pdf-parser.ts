/**
 * PDF Parser Service
 * 
 * Extracts text from PDF files using pdf-parse.
 * Falls back to a basic approach when text is not extractable.
 * 
 * NOTES ON IMPROVING:
 * - For scanned PDFs (image-only), integrate Tesseract.js for OCR:
 *   import Tesseract from 'tesseract.js';
 * - For better accuracy with complex layouts, consider using
 *   Google Cloud Vision API or AWS Textract
 * - The current parser works best with text-based PDFs
 */

import PDFParser from 'pdf2json';

export interface ParseResult {
    text: string;
    pages: number;
    method: 'text' | 'ocr';
    success: boolean;
    error?: string;
}

export async function parsePDF(buffer: Buffer): Promise<ParseResult> {
    return new Promise((resolve, reject) => {
        try {
            const pdfParser = new PDFParser(null, true);
            
            pdfParser.on("pdfParser_dataError", errData => {
                resolve({
                    text: '',
                    pages: 0,
                    method: 'text',
                    success: false,
                    error: `Erro ao processar PDF: ${(errData as any).parserError?.message || errData}`,
                });
            });

            pdfParser.on("pdfParser_dataReady", pdfData => {
                const text = pdfParser.getRawTextContent().trim() || '';

                if (text.length < 50) {
                    resolve({
                        text,
                        pages: pdfData.Pages ? pdfData.Pages.length : 0,
                        method: 'text',
                        success: false,
                        error: 'PDF contém pouco ou nenhum texto extraível. O documento pode ser uma imagem escaneada. Suporte a OCR será adicionado em breve.',
                    });
                } else {
                    resolve({
                        text,
                        pages: pdfData.Pages ? pdfData.Pages.length : 0,
                        method: 'text',
                        success: true,
                    });
                }
            });

            pdfParser.parseBuffer(buffer);
        } catch (err) {
             resolve({
                 text: '',
                 pages: 0,
                 method: 'text',
                 success: false,
                 error: `Erro fatal ao processar PDF: ${err instanceof Error ? err.message : 'Erro desconhecido'}`,
             });
        }
    });
}
