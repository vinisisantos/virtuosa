/**
 * Payroll Extraction Engine
 * 
 * Intelligent parser that extracts employee names and net salaries
 * from payroll PDF text content.
 * 
 * HOW TO IMPROVE ACCURACY:
 * 1. Add more patterns for different payroll formats
 * 2. Use NLP for name detection (e.g., compromise.js)
 * 3. Integrate AI model (OpenAI/Gemini) for complex layouts
 * 4. Train on specific payroll templates from each provider
 * 
 * HOW TO ADAPT FOR DIFFERENT PAYROLL FORMATS:
 * - Each accounting provider formats payrolls differently
 * - Add new regex patterns to NET_SALARY_LABELS
 * - Adjust the block splitting logic for new formats
 * - The confidence scoring will help identify parsing issues
 * 
 * HOW TO EXPAND AI CAPABILITIES:
 * - Replace extractEmployees() with an AI call:
 *   const result = await openai.chat.completions.create({
 *     model: "gpt-4",
 *     messages: [{ role: "user", content: `Extract employees and salaries: ${text}` }]
 *   });
 */

import { ExtractedEmployee } from './types';

// Labels that indicate NET salary (what the employee actually receives)
const NET_SALARY_LABELS = [
    'líquido',
    'liquido',
    'valor líquido',
    'valor liquido',
    'líquido a receber',
    'liquido a receber',
    'salário líquido',
    'salario liquido',
    'total líquido',
    'total liquido',
    'vlr\\. líquido',
    'vlr líquido',
    'vl\\.? ?líq',
    'vl\\.? ?liq',
    'sal\\.? ?líq',
];

// Labels that indicate BASE salary (salário base / vencimento)
const BASE_SALARY_LABELS = [
    'sal[áa]rio\\s*base',
    'sal\\.?\\s*base',
    'salario\\s*base',
    'vencimento\\s*base',
    'vencimentos',
    'sal[áa]rio\\s*contratual',
    'sal\\.?\\s*contratual',
    'piso\\s*salarial',
    'remunera[çc][ãa]o\\s*base',
    'sal[áa]rio\\s*mensal',
    'ordenado',
];

// Labels to IGNORE (gross salary, deductions, etc.)
const IGNORE_LABELS = [
    'salário bruto',
    'salario bruto',
    'total bruto',
    'proventos',
    'total de proventos',
    'descontos',
    'total de descontos',
    'total descontos',
    'fgts',
    'inss',
    'irrf',
    'ir\\b',
    'base de cálculo',
    'base fgts',
    'base inss',
    'vale transporte',
    'vale refeição',
    'plano de saúde',
    'contribuição sindical',
];

// Brazilian currency pattern: R$ 1.234,56 or 1234,56 or 1.234.567,89
const CURRENCY_REGEX = /R?\$?\s*([\d]{1,3}(?:\.[\d]{3})*(?:,[\d]{2}))/g;

/**
 * Parse a Brazilian currency string to a number
 */
function parseBRLCurrency(value: string): number {
    const cleaned = value
        .replace('R$', '')
        .replace(/\s/g, '')
        .replace(/\./g, '')
        .replace(',', '.');
    return parseFloat(cleaned) || 0;
}

/**
 * Check if a string looks like a person's name
 */
function isLikelyName(text: string): boolean {
    const cleaned = text.trim();
    // Names are usually 2+ words, mostly letters, often uppercase in payrolls
    if (cleaned.length < 5 || cleaned.length > 80) return false;
    if (/^\d/.test(cleaned)) return false; // Starts with number
    if (/^(total|soma|subtotal|empresa|filial|departamento)/i.test(cleaned)) return false;

    const words = cleaned.split(/\s+/);
    if (words.length < 2) return false;

    // Most words should be alphabetic
    const alphaWords = words.filter(w => /^[A-ZÀ-Ü][a-zà-ü]*$|^[A-ZÀ-Ü]+$|^(de|da|do|dos|das|e)$/i.test(w));
    return alphaWords.length / words.length >= 0.7;
}

/**
 * Find the net salary value near a specific position in text
 */
function findNetSalaryNearPosition(textBlock: string): { value: number; confidence: number } | null {
    const lines = textBlock.split('\n');

    // Strategy 1: Look for explicit "líquido" label with a value
    for (const label of NET_SALARY_LABELS) {
        const regex = new RegExp(`${label}[:\\s]*([\\d]{1,3}(?:\\.\\d{3})*,\\d{2})`, 'gi');
        for (const line of lines) {
            const match = regex.exec(line);
            if (match) {
                return { value: parseBRLCurrency(match[1]), confidence: 0.95 };
            }
            regex.lastIndex = 0;
        }
    }

    // Strategy 2: Look for lines containing "líquido" and extract nearby currency
    for (const line of lines) {
        const lowerLine = line.toLowerCase();
        const hasNetLabel = NET_SALARY_LABELS.some(l => new RegExp(l, 'i').test(lowerLine));
        if (hasNetLabel) {
            const currencies: number[] = [];
            let match;
            const currRegex = new RegExp(CURRENCY_REGEX.source, 'g');
            while ((match = currRegex.exec(line)) !== null) {
                currencies.push(parseBRLCurrency(match[1]));
            }
            if (currencies.length > 0) {
                // Take the last currency value on the line (usually the result)
                return { value: currencies[currencies.length - 1], confidence: 0.85 };
            }
        }
    }

    // Strategy 3: If no explicit label, look for the last currency value
    // (in many payroll formats, the last value is the net salary)
    const allCurrencies: number[] = [];
    for (const line of lines) {
        const lowerLine = line.toLowerCase();
        // Skip lines with ignore labels
        const hasIgnoreLabel = IGNORE_LABELS.some(l => new RegExp(l, 'i').test(lowerLine));
        if (hasIgnoreLabel) continue;

        let match;
        const currRegex = new RegExp(CURRENCY_REGEX.source, 'g');
        while ((match = currRegex.exec(line)) !== null) {
            const val = parseBRLCurrency(match[1]);
            if (val > 100 && val < 100000) { // Reasonable salary range
                allCurrencies.push(val);
            }
        }
    }

    if (allCurrencies.length > 0) {
        return { value: allCurrencies[allCurrencies.length - 1], confidence: 0.5 };
    }

    return null;
}

/**
 * Split the full text into blocks, one per employee
 */
function splitIntoEmployeeBlocks(text: string): string[] {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const blocks: string[] = [];
    let currentBlock: string[] = [];

    for (const line of lines) {
        // Common block separators in payrolls
        if (/^-{5,}$|^={5,}$|^_{5,}$/.test(line)) {
            if (currentBlock.length > 0) {
                blocks.push(currentBlock.join('\n'));
                currentBlock = [];
            }
            continue;
        }

        // If we find what looks like a new employee name and we already have content
        if (isLikelyName(line) && currentBlock.length > 3) {
            blocks.push(currentBlock.join('\n'));
            currentBlock = [line];
            continue;
        }

        currentBlock.push(line);
    }

    if (currentBlock.length > 0) {
        blocks.push(currentBlock.join('\n'));
    }

    return blocks;
}

export function extractEmployees(text: string): ExtractedEmployee[] {
    const employees: ExtractedEmployee[] = [];

    // STRATEGY 1: Exact Match for this specific Accounting Format
    // Format: 
    // Empregado
    // AMANDA GOMES DA SILVA - 1 
    // ...
    // Líquido.....R$ 2.139,87

    // We split by "Empregado" to find employee blocks
    const parts = text.split(/Empregado\s*\n/i);

    // Start at index 1 because index 0 is the header before the first "Empregado"
    for (let i = 1; i < parts.length; i++) {
        const block = parts[i];
        const lines = block.split('\n').map(l => l.trim()).filter(l => l.length > 0);

        if (lines.length < 2) continue;

        let nameLine = lines[0];
        // Clean the name (remove the " - 1" suffix)
        // Some blocks might be "CPF", we skip if it doesn't look like a name
        if (nameLine === 'CPF' || nameLine.startsWith('Página')) continue;

        const nameMatch = nameLine.match(/^([A-ZÀ-Üa-zà-ü\s]+)(?:-\s*\d+)?$/);
        const name = nameMatch ? nameMatch[1].trim() : nameLine.trim();

        // Find net salary
        let netSalary = 0;
        let foundSalary = false;
        let baseSalary: number | undefined;
        let cargo: string | undefined;

        for (const line of lines) {
            // Match exactly: "Líquido.....R$ 2.139,87" or similar
            const liquidMatch = line.match(/L[íi]quido(?:\.+|\s+)R\$\s*([\d]{1,3}(?:\.\d{3})*,\d{2})/i);
            if (liquidMatch) {
                netSalary = parseBRLCurrency(liquidMatch[1]);
                foundSalary = true;
            }

            // Extract Salário Base — multiple patterns for different payroll formats
            if (!baseSalary) {
                for (const label of BASE_SALARY_LABELS) {
                    // Pattern 1: "Salário Base: R$ 3.200,00" or "Salário Base.....R$ 3.200,00"
                    const p1 = new RegExp(`${label}[:\\s\\.]*R?\\$?\\s*([\\d]{1,3}(?:\\.\\d{3})*,\\d{2})`, 'i');
                    const m1 = line.match(p1);
                    if (m1) { baseSalary = parseBRLCurrency(m1[1]); break; }

                    // Pattern 2: Line item with code: "0001 SALÁRIO BASE ... 3.200,00"
                    const p2 = new RegExp(`\\d{2,4}\\s+${label}.*?([\\d]{1,3}(?:\\.\\d{3})*,\\d{2})`, 'i');
                    const m2 = line.match(p2);
                    if (m2) { baseSalary = parseBRLCurrency(m2[1]); break; }
                }
            }

            // Pattern 3: "Salário / Função" header with value on same or next line
            if (!baseSalary) {
                const salFuncMatch = line.match(/Sal[áa]rio\s*[\/\\]\s*Fun[çc][ãa]o[:\s]*R?\$?\s*([\d]{1,3}(?:\.\d{3})*,\d{2})/i);
                if (salFuncMatch) baseSalary = parseBRLCurrency(salFuncMatch[1]);
            }

            // Pattern 4: Proventos section — first currency value is usually the base salary
            if (!baseSalary) {
                const proventosMatch = line.match(/^Proventos[:\s]*R?\$?\s*([\d]{1,3}(?:\.\d{3})*,\d{2})/i);
                if (proventosMatch) baseSalary = parseBRLCurrency(proventosMatch[1]);
            }

            // Extract Cargo / Profissão
            const cargoMatch = line.match(/Cargo\s*\/?\s*Profiss[ãa]o[\s\n]*(.+)/i);
            if (cargoMatch) {
                const cargoValue = cargoMatch[1].trim();
                // Make sure it's not a number or empty
                if (cargoValue && !/^\d/.test(cargoValue) && cargoValue.length > 1) {
                    cargo = cargoValue;
                }
            }
        }

        // If cargo not found inline, check if there's a "Cargo / Profissão" header pattern
        // Sometimes it appears as: "CPF ... Cargo / Profissão\n47597782845 Biomédica"
        if (!cargo) {
            const blockText = block;
            const cargoPattern = blockText.match(/Cargo\s*[\/\\]?\s*Profiss[ãa]o\s*\n\s*(?:\d+\s+)?([A-ZÀ-Üa-zà-ü\s]+)/i);
            if (cargoPattern) {
                const cVal = cargoPattern[1].trim();
                if (cVal && cVal.length > 1 && !/^\d+$/.test(cVal)) {
                    cargo = cVal;
                }
            }
        }

        // If baseSalary not found in line scan, try multi-line pattern in the full block
        if (!baseSalary) {
            // Pattern: "Salário Base" on one line, value on next line
            const multiLineBase = block.match(/Sal[áa]rio\s+Base\s*\n\s*R?\$?\s*([\d]{1,3}(?:\.\d{3})*,\d{2})/i);
            if (multiLineBase) baseSalary = parseBRLCurrency(multiLineBase[1]);
        }
        if (!baseSalary) {
            // Pattern: "Sal. / Função" on one line, value on next
            const salFuncMulti = block.match(/Sal[áa]rio?\s*[\/\\]\s*Fun[çc][ãa]o\s*\n\s*R?\$?\s*([\d]{1,3}(?:\.\d{3})*,\d{2})/i);
            if (salFuncMulti) baseSalary = parseBRLCurrency(salFuncMulti[1]);
        }

        if (foundSalary && netSalary > 0) {
            // Check for duplicates (accounting software often outputs 2 copies per page: Empregador via and Empregado via)
            const formattedName = formatName(name);
            const exists = employees.some(e => e.name === formattedName && e.netSalary === netSalary);

            if (!exists) {
                employees.push({
                    name: formattedName,
                    netSalary: netSalary,
                    baseSalary: baseSalary,
                    cargo: cargo ? formatName(cargo) : undefined,
                    confidenceScore: 0.99, // Highly confident in specific format match
                    extractionSource: 'pdf-parse-exact',
                });
            }
        }
    }

    // STRATEGY 2: Fallback to line-by-line if exact match found nothing
    if (employees.length === 0) {
        const lineBasedResults = extractLineByLine(text);
        employees.push(...lineBasedResults);
    }

    return employees;
}

/**
 * Fallback: line-by-line extraction
 * Looks for lines with both a name-like pattern and a currency value
 */
function extractLineByLine(text: string): ExtractedEmployee[] {
    const employees: ExtractedEmployee[] = [];
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    // Pre-scan: build a map of base salaries found near employee names
    const baseSalaryByName: Record<string, number> = {};
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const label of BASE_SALARY_LABELS) {
            const regex = new RegExp(`${label}[:\\s\\.]*R?\\$?\\s*([\\d]{1,3}(?:\\.\\d{3})*,\\d{2})`, 'i');
            const match = line.match(regex);
            if (match) {
                // Look backwards for a name
                for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
                    if (isLikelyName(lines[j].split(/\s{2,}|\t/)[0])) {
                        const nameKey = formatName(lines[j].split(/\s{2,}|\t/)[0]).toLowerCase();
                        baseSalaryByName[nameKey] = parseBRLCurrency(match[1]);
                        break;
                    }
                }
            }
        }
    }

    for (const line of lines) {
        // Skip lines with ignore labels
        const lowerLine = line.toLowerCase();
        if (IGNORE_LABELS.some(l => new RegExp(l, 'i').test(lowerLine))) continue;
        if (/^(total|soma|subtotal)/i.test(lowerLine)) continue;

        // Look for lines that have a name and a currency value
        const parts = line.split(/\s{2,}|\t/); // Split by multiple spaces or tabs

        if (parts.length >= 2) {
            const namePart = parts[0].trim();

            if (isLikelyName(namePart)) {
                // Look for currency in the rest of the line
                const restOfLine = parts.slice(1).join(' ');
                const currRegex = new RegExp(CURRENCY_REGEX.source, 'g');
                const currencies: number[] = [];
                let match;
                while ((match = currRegex.exec(restOfLine)) !== null) {
                    const val = parseBRLCurrency(match[1]);
                    if (val > 100 && val < 100000) currencies.push(val);
                }

                if (currencies.length > 0) {
                    const formattedName = formatName(namePart);
                    const baseSalary = baseSalaryByName[formattedName.toLowerCase()];
                    employees.push({
                        name: formattedName,
                        netSalary: currencies[currencies.length - 1],
                        baseSalary: baseSalary || (currencies.length > 1 ? currencies[0] : undefined),
                        confidenceScore: 0.4, // Low confidence for line-by-line
                        extractionSource: 'pdf-parse',
                    });
                }
            }
        }
    }

    return employees;
}

/**
 * Format a name to Title Case
 */
function formatName(name: string): string {
    const lowerWords = ['de', 'da', 'do', 'dos', 'das', 'e', 'em', 'com'];
    return name
        .toLowerCase()
        .split(/\s+/)
        .map((word, i) => {
            if (i > 0 && lowerWords.includes(word)) return word;
            return word.charAt(0).toUpperCase() + word.slice(1);
        })
        .join(' ');
}
