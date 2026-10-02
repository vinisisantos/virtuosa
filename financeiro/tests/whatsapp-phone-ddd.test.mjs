import assert from "node:assert/strict";
import test from "node:test";

import { brazilianPhoneHasDdd11, matchesBrazilianDddBucket } from "../src/lib/whatsapp/phone-ddd.ts";

test("classifica DDD 11 com e sem código do Brasil", () => {
  assert.equal(brazilianPhoneHasDdd11("5511994441234"), true);
  assert.equal(brazilianPhoneHasDdd11("+55 (11) 99444-1234"), true);
  assert.equal(brazilianPhoneHasDdd11("11944441234"), true);
});

test("mantém outros DDDs e telefones sem DDD identificável em Outros DDDs", () => {
  assert.equal(matchesBrazilianDddBucket("5521994441234", "other"), true);
  assert.equal(matchesBrazilianDddBucket("199444123", "other"), true);
  assert.equal(matchesBrazilianDddBucket(null, "other"), true);
  assert.equal(matchesBrazilianDddBucket("5521994441234", "ddd11"), false);
});
