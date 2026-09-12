import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { UNIT_PROFILES } from '../src/app/termos/terms-shared.ts';
import { canonicalContractUnit } from '../src/lib/contract-units.ts';

// Read only the static literal: importing the client page would load browser/API dependencies.
const pageUrl = new URL('../src/app/docs/gerar/page.tsx', import.meta.url);
const source = ts.createSourceFile(pageUrl.pathname, readFileSync(pageUrl, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let clinicLiteral;
function visit(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'CLINIC_DETAILS') {
    clinicLiteral = node.initializer;
  }
  ts.forEachChild(node, visit);
}
visit(source);
function readLiteral(node) {
  assert.ok(node, 'CLINIC_DETAILS must exist');
  if (ts.isStringLiteral(node)) return node.text;
  assert.ok(ts.isObjectLiteralExpression(node), 'Clinic profiles must remain static objects');
  return Object.fromEntries(node.properties.map(property => {
    assert.ok(ts.isPropertyAssignment(property));
    assert.ok(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name));
    return [property.name.text, readLiteral(property.initializer)];
  }));
}
const clinics = readLiteral(clinicLiteral);

test('SCS usa a razão social e o CNPJ solicitados sem alterar o endereço', () => {
  assert.deepEqual(clinics.SCS, {
    razao_social_contratante: 'CLINICA DE ESTETICA ALMEIDA RIBEIRO LTDA',
    cnpj_contratante: '63.246.385/0001-91',
    endereco_contratante: 'Av. Vital Brasil Filho',
    numero: '143', cidade: 'São Caetano do Sul', uf: 'SP', cep: '09541-130',
  });
  assert.deepEqual(UNIT_PROFILES.SCS, {
    nome_clinica: 'Virtuosa São Caetano do Sul',
    endereco_clinica: 'Av. Vital Brasil Filho, 143 - Osvaldo Cruz, São Caetano do Sul - SP, 09541-130',
    cidade_clinica: 'São Caetano do Sul - SP',
    cnpj_clinica: '63.246.385/0001-91',
  });
});

test('perfis de documentos das demais unidades permanecem intactos', () => {
  const { SCS: _scs, ...otherClinics } = clinics;
  assert.deepEqual(otherClinics, {
    SBC: {
      razao_social_contratante: 'CLINICA DE ESTETICA SBC LTDA',
      cnpj_contratante: '55.176.726/0001-71',
      endereco_contratante: 'Av. das Nações Unidas',
      numero: '30', cidade: 'São Bernardo do Campo', uf: 'SP', cep: '09726-110',
    },
    Osasco: {
      razao_social_contratante: 'LRGUI CLINICA DE ESTETICA LTDA',
      cnpj_contratante: '51.590.266/0001-72',
      endereco_contratante: 'Rua Eloy Candido Lopes',
      numero: '61', cidade: 'Osasco', uf: 'SP', cep: '06010-130',
    },
    Barueri: {
      razao_social_contratante: 'CLINICA DE ESTETICA FACIAL E CORPORAL LTDA',
      cnpj_contratante: '63.676.273/0001-70',
      endereco_contratante: 'Av. Vinte e Seis de Março',
      numero: '701', cidade: 'Barueri', uf: 'SP', cep: '06401-050',
    },
  });
});

test('perfis de termos das demais unidades e alias de SCS permanecem intactos', () => {
  const { SCS: _scs, ...otherProfiles } = UNIT_PROFILES;
  assert.deepEqual(otherProfiles, {
    Barueri: {
      nome_clinica: 'Virtuosa Barueri',
      endereco_clinica: 'Av. Vinte e Seis de Março, 701 - Térreo - Centro, Barueri - SP, 06401-050',
      cidade_clinica: 'Barueri - SP', cnpj_clinica: '63.676.273/0001-70',
    },
    SBC: {
      nome_clinica: 'Virtuosa São Bernardo',
      endereco_clinica: 'Av. das Nações Unidas, 30 - Jardim do Mar, São Bernardo do Campo - SP, 09726-110',
      cidade_clinica: 'São Bernardo do Campo - SP', cnpj_clinica: '55.176.726/0001-71',
    },
    Osasco: {
      nome_clinica: 'Virtuosa Osasco',
      endereco_clinica: 'Rua Eloy Candido Lopes, 61 - Centro, Osasco - SP, 06010-130',
      cidade_clinica: 'Osasco - SP', cnpj_clinica: '51.590.266/0001-72',
    },
  });
  assert.equal(canonicalContractUnit(UNIT_PROFILES.SCS.nome_clinica), 'SCS');
});
