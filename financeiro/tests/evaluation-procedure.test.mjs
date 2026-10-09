import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isEvaluationAppointment,
  normalizeEvaluationProcedure,
  usesEvaluationProcedure,
} from '../src/lib/evaluation-procedure.ts';
import { EVALUATION_GROUP_INSTANCE_ID } from '../src/lib/whatsapp/evaluation-group-notice-config.ts';

test('procedimento adicional fica restrito a SBC manual e Leads - Paloma', () => {
  assert.equal(usesEvaluationProcedure('SBC'), true);
  assert.equal(usesEvaluationProcedure('SBC', EVALUATION_GROUP_INSTANCE_ID), true);
  assert.equal(usesEvaluationProcedure('SBC', 'outra-caixa'), false);
  assert.equal(usesEvaluationProcedure('Osasco', EVALUATION_GROUP_INSTANCE_ID), false);
  assert.equal(usesEvaluationProcedure('SCS'), false);
});

test('tipo Avaliação continua distinto do tratamento de interesse', () => {
  assert.equal(isEvaluationAppointment(' Avaliação '), true);
  assert.equal(isEvaluationAppointment('AVALIACAO'), true);
  assert.equal(isEvaluationAppointment('Sessão corporal'), false);
  assert.equal(normalizeEvaluationProcedure('Avaliação'), null);
  assert.equal(normalizeEvaluationProcedure('Avaliação gratuita'), null);
  assert.equal(normalizeEvaluationProcedure(''), null);
  assert.equal(normalizeEvaluationProcedure('  Gordura\n  localizada  '), 'Gordura localizada');
  assert.equal(normalizeEvaluationProcedure('x'.repeat(161)), null);
});
