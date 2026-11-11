import assert from 'node:assert/strict';
import test from 'node:test';
import { aliceCanContinueAfterSoftHandoff, aliceRetryableTurnError, aliceRetryAttemptLimit,
  aliceAutonomyRequiresHumanOwnership } from '../src/lib/ai-assistant/autonomy/policy.ts';

test('motivos de revisão novos e legado mantêm o limite individual e não mudam o modo Alice', () => {
  for (const reason of ['human_review', 'human_review_requested', 'human_review_low_confidence']) {
    assert.equal(aliceCanContinueAfterSoftHandoff(reason), true, reason);
    assert.equal(aliceRetryableTurnError(reason), true, reason);
    assert.equal(aliceRetryAttemptLimit(reason), 2, reason);
    assert.equal(aliceAutonomyRequiresHumanOwnership('needs_human', reason), false, reason);
    assert.equal(aliceAutonomyRequiresHumanOwnership('uncertain', reason), true, reason);
  }
  assert.equal(aliceCanContinueAfterSoftHandoff('clinical_safety'), false);
  assert.equal(aliceRetryableTurnError('booking_confirmation_uncertain'), false);
  assert.equal(aliceCanContinueAfterSoftHandoff('booking_followup_requires_review'), true);
  assert.equal(aliceRetryableTurnError('booking_followup_requires_review'), false);
  assert.equal(aliceAutonomyRequiresHumanOwnership('needs_human', 'booking_followup_requires_review'), false);
});
