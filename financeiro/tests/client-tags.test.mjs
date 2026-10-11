import assert from "node:assert/strict";
import test from "node:test";
import { addClientTag } from "../src/lib/client-tags.ts";

test("adiciona a categoria sem apagar tags existentes e evita duplicatas", () => {
  assert.equal(addClientTag(null, "Botox Terço Superior"), "Botox Terço Superior");
  assert.equal(addClientTag("Meta Ads", "Botox Terço Superior"), "Meta Ads,Botox Terço Superior");
  assert.equal(addClientTag("Meta Ads, Botox Terco Superior", "Botox Terço Superior"), "Meta Ads,Botox Terco Superior");
});
