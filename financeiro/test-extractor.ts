import { extractEmployees } from './src/lib/payroll-extractor';
import * as fs from 'fs';

const text = fs.readFileSync('last-pdf-text.txt', 'utf8');
const results = extractEmployees(text);
console.log(JSON.stringify(results, null, 2));
