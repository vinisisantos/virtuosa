const lines = [
    "Salário Base   Sal. Contr. INSS   Base Cálc. FGTS",
    "2.291,73       2.291,73           2.291,73",
    "Salário Base",
    "  2.291,73",
    "Salário Base: R$ 2.291,73"
];

const regex = /(?:^|\s|R\$?\s*)(\d{1,3}(?:\.\d{3})*,\d{2})/;
for (const line of lines) {
    const valMatch = line.trim().match(regex);
    console.log(line, "=>", valMatch ? valMatch[1] : null);
}
