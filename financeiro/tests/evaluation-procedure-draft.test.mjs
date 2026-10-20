import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluationProcedureDraft } from '../src/lib/evaluation-procedure-draft.ts';

test('saved treatment wins over later sales procedures and campaign metadata', () => {
  assert.equal(evaluationProcedureDraft({ evaluationProcedure: 'Botox + papada', procedureNames: ['Mamas'], campaignName: 'Lipo Laser' }), 'Botox + papada');
});

test('explicit multiple treatments are preserved together before the campaign suggestion', () => {
  assert.equal(evaluationProcedureDraft({ procedureNames: ['Botox', 'Papada'], campaignName: 'Lipo Laser' }), 'Botox · Papada');
  assert.equal(evaluationProcedureDraft({ procedureName: 'Glúteos Perfeitos 120ml', campaignName: 'Glúteos Perfeitos' }), 'Glúteos Perfeitos 120ml');
});

test('the schedule type is never a treatment; campaign supplies an editable draft', () => {
  assert.equal(evaluationProcedureDraft({ evaluationProcedure: 'Avaliação', procedureNames: ['Avaliação'], campaignName: 'Lipo Laser' }), 'Lipo Laser');
});

test('generic attribution and unresolved Meta placeholders do not become suggested treatments', () => {
  for (const campaignName of [null, '', 'Via link', 'Campanha Desconhecida', 'Sem campanha classificada', '{{product.name}}']) {
    assert.equal(evaluationProcedureDraft({ campaignName }), '', String(campaignName));
  }
});

test('freeform user additions remain intact when reopening a saved appointment', () => {
  assert.equal(evaluationProcedureDraft({ evaluationProcedure: 'Lipo Laser; avaliar também glúteos', campaignName: 'Lipo Laser' }), 'Lipo Laser; avaliar também glúteos');
});

test('oversized campaign descriptions stay blank for human correction instead of being truncated', () => {
  assert.equal(evaluationProcedureDraft({ campaignName: 'x'.repeat(161) }), '');
});
