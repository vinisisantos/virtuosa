import assert from "node:assert/strict";
import test from "node:test";

import {
  filterInstancesToOwner,
  selectSingleDefaultInboxInstance,
} from "../src/lib/whatsapp/instance-scope.ts";

const instances = [
  { id: "main", userId: "claudenice" },
  { id: "reception", userId: "reception-user" },
  { id: "legacy", userId: null },
];

test("Meu Inbox pode restringir a lista às instâncias de propriedade direta", () => {
  assert.deepEqual(filterInstancesToOwner(instances, "claudenice", true), [instances[0]]);
});

test("sem restrição, a seleção explícita mantém instâncias compartilhadas acessíveis", () => {
  assert.deepEqual(filterInstancesToOwner(instances, "claudenice", false), instances);
});

test("a restrição não infere proprietário quando o contexto não o identifica", () => {
  assert.deepEqual(filterInstancesToOwner(instances, null, true), instances);
});

test("Meu Inbox usa uma própria quando há só uma ou uma única conectada", () => {
  assert.deepEqual(selectSingleDefaultInboxInstance([instances[0]]), [instances[0]]);
  assert.deepEqual(selectSingleDefaultInboxInstance([
    { id: "offline", status: "disconnected" },
    { id: "main", status: "connected" },
  ]), [{ id: "main", status: "connected" }]);
});

test("Meu número prioriza exatamente 11952750497 mesmo que outra instância esteja conectada", () => {
  const own = [
    { id: "other", phoneNumber: "+55 (11) 91234-5678", status: "connected" },
    { id: "my-number", phoneNumber: "+55 11 95275-0497", status: "disconnected" },
  ];
  assert.deepEqual(selectSingleDefaultInboxInstance(own, "11952750497"), [own[1]]);
});

test("Meu número não escolhe arbitrariamente quando o telefone coincide com caixas duplicadas", () => {
  const duplicateNumber = [
    { id: "one", phoneNumber: "11952750497", status: "connected" },
    { id: "two", phoneNumber: "5511952750497", status: "connected" },
  ];
  assert.deepEqual(selectSingleDefaultInboxInstance(duplicateNumber, "11952750497"), []);
});

test("Meu Inbox não escolhe arbitrariamente nem agrega múltiplas instâncias próprias", () => {
  assert.deepEqual(selectSingleDefaultInboxInstance([
    { id: "one", status: "connected" },
    { id: "two", status: "connected" },
  ]), []);
  assert.deepEqual(selectSingleDefaultInboxInstance([
    { id: "one", status: "disconnected" },
    { id: "two", status: "disconnected" },
  ]), []);
});
