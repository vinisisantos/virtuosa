import assert from 'node:assert/strict';
import test from 'node:test';
import JSZip from 'jszip';
import {
  ContratoLayoutError,
  validarLayoutContrato,
  validarPartesProtegidasContrato,
} from '../src/lib/contratos/validarLayoutContrato.ts';
import {
  prepararCamposContrato,
  sanitizarTextoContrato,
} from '../src/lib/contratos/prepararCamposContrato.ts';

const WORD = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const DRAWING = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const SECTION = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:bottom="1134" w:left="720" w:right="720" w:header="708" w:footer="708"/></w:sectPr>';

async function fixture(body = '<w:p><w:r><w:t>Contrato</w:t></w:r></w:p>', section = SECTION) {
  const zip = new JSZip();
  zip.file('word/document.xml', `<w:document xmlns:w="${WORD}" xmlns:wp="${DRAWING}"><w:body>${body}${section}</w:body></w:document>`);
  zip.file('word/header1.xml', `<w:hdr xmlns:w="${WORD}"><w:p><w:r><w:t>Virtuosa</w:t></w:r></w:p></w:hdr>`);
  zip.file('word/footer1.xml', `<w:ftr xmlns:w="${WORD}"><w:p/></w:ftr>`);
  zip.file('word/media/logo.png', Uint8Array.from([137, 80, 78, 71]));
  return zip.generateAsync({ type: 'uint8array' });
}

test('modelo válido passa, inclusive partes protegidas iguais', async () => {
  const document = await fixture();
  await validarLayoutContrato(document);
  await validarPartesProtegidasContrato(document, document);
});

test('margem alterada falha e informa o valor incorreto', async () => {
  const document = await fixture(undefined, SECTION.replace('w:top="1418"', 'w:top="720"'));
  await assert.rejects(validarLayoutContrato(document), (error) => {
    assert.ok(error instanceof ContratoLayoutError);
    assert.match(error.message, /pgMar top=720; esperado 1418/);
    return true;
  });
});

test('recuo negativo e hanging maior que left falham', async () => {
  const document = await fixture('<w:p><w:pPr><w:ind w:left="-20" w:hanging="30"/></w:pPr></w:p>');
  await assert.rejects(validarLayoutContrato(document), (error) => {
    assert.match(error.message, /left=-20 é negativo/);
    assert.match(error.message, /hanging=30 excede left=-20/);
    return true;
  });
});

test('tabela larga demais falha por tblW e soma da grade', async () => {
  const document = await fixture('<w:tbl><w:tblPr><w:tblW w:type="dxa" w:w="11000"/></w:tblPr><w:tblGrid><w:gridCol w:w="6000"/><w:gridCol w:w="6000"/></w:tblGrid></w:tbl>');
  await assert.rejects(validarLayoutContrato(document), (error) => {
    assert.match(error.message, /tblW=11000 excede 10466/);
    assert.match(error.message, /gridCol=12000 excede 10466/);
    return true;
  });
});

test('imagem larga demais falha', async () => {
  const document = await fixture('<w:p><w:r><wp:extent cx="7000000" cy="100"/></w:r></w:p>');
  await assert.rejects(validarLayoutContrato(document), /imagem 1 cx=7000000/);
});

test('campo acima do limite bloqueia com o nome do campo', () => {
  assert.throws(
    () => prepararCamposContrato([{ tag: 'nome_contratada', label: 'Nome Contratada', type: 'text' }], { nome_contratada: 'A'.repeat(101) }),
    /Nome Contratada: 101 caracteres; máximo 100/,
  );
});

test('texto sem espaços ganha quebra invisível a cada 40 caracteres', () => {
  const original = 'x'.repeat(85);
  assert.equal(sanitizarTextoContrato(` \t${original}\n `), `${'x'.repeat(40)}\u200B${'x'.repeat(40)}\u200Bxxxxx`);
});

test('campo no limite permanece válido ao ser preparado novamente', () => {
  const fields = [{ tag: 'nome_contratada', label: 'Nome Contratada', type: 'text' }];
  const initial = prepararCamposContrato(fields, { nome_contratada: 'x'.repeat(100) });
  assert.equal(initial.nome_contratada.replace(/\u200B/g, '').length, 100);
  assert.deepEqual(prepararCamposContrato(fields, initial), initial);
});

test('alteração de cabeçalho ou seção é rejeitada mesmo com margens válidas', async () => {
  const original = await fixture();
  const changed = new JSZip();
  await changed.loadAsync(original);
  changed.file('word/header1.xml', `<w:hdr xmlns:w="${WORD}"><w:p/></w:hdr>`);
  const changedBytes = await changed.generateAsync({ type: 'uint8array' });
  await assert.rejects(validarPartesProtegidasContrato(original, changedBytes), /header1.xml/);
});
