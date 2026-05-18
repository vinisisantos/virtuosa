const fs = require('fs');
const file = '/Users/viniciussantos/Downloads/virtuosa-main/financeiro/src/lib/payroll-extractor.ts';
let code = fs.readFileSync(file, 'utf8');

// STRATEGY 1 Fix
code = code.replace(
    `const valMatch = valLine.match(/(?:^|\\s|R\\$?\\s*)(\\d{1,3}(?:\\.\\d{3})*,\\d{2})/);\n                    if (valMatch) {\n                        baseSalary = parseBRLCurrency(valMatch[1]);\n                        break;\n                    }`,
    `const currRegex = /(?:^|\\s|R\\$?\\s*)(\\d{1,3}(?:\\.\\d{3})*,\\d{2})/g;\n                    let match;\n                    let found = false;\n                    while ((match = currRegex.exec(valLine)) !== null) {\n                        const val = parseBRLCurrency(match[1]);\n                        if (val > 100) {\n                            baseSalary = val;\n                            found = true;\n                            break;\n                        }\n                    }\n                    if (found) break;`
);

// Fallback 1 Fix
code = code.replace(
    `if (multiMatch) baseSalary = parseBRLCurrency(multiMatch[1]);`,
    `if (multiMatch) { const v = parseBRLCurrency(multiMatch[1]); if (v > 100) baseSalary = v; }`
);

// Fallback 2 Fix
code = code.replace(
    `if (multiLineBase) baseSalary = parseBRLCurrency(multiLineBase[1]);`,
    `if (multiLineBase) { const v = parseBRLCurrency(multiLineBase[1]); if (v > 100) baseSalary = v; }`
);

// STRATEGY 1.5 Fix
code = code.replace(
    `const valMatch = lines[k].trim().match(/(?:^|\\s|R\\$?\\s*)(\\d{1,3}(?:\\.\\d{3})*,\\d{2})/);\n                            if (valMatch) {\n                                baseSalary = parseBRLCurrency(valMatch[1]);\n                                break;\n                            }`,
    `const currRegex = /(?:^|\\s|R\\$?\\s*)(\\d{1,3}(?:\\.\\d{3})*,\\d{2})/g;\n                            let match;\n                            let found = false;\n                            while ((match = currRegex.exec(lines[k].trim())) !== null) {\n                                const val = parseBRLCurrency(match[1]);\n                                if (val > 100) {\n                                    baseSalary = val;\n                                    found = true;\n                                    break;\n                                }\n                            }\n                            if (found) break;`
);

fs.writeFileSync(file, code);
console.log('Fixed payroll-extractor.ts');
