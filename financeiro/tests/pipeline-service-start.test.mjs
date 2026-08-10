import assert from "node:assert/strict";
import test from "node:test";

import { advanceNewLeadToServiceStage } from "../src/lib/pipeline/service-start.ts";

test("vincula o funil-base e move negócio legado sem pipeline para Em Atendimento", async () => {
  const stages = [
    { id: "stage-new", name: "Novo Lead", position: 0 },
    { id: "stage-service", name: "Em Atendimento", position: 1 },
  ];
  const pipelineLookups = [];
  let dealUpdate = null;
  let clientUpdate = null;
  let auditEntry = null;

  const database = {
    client: {
      findMany: async () => [{ id: "client-1" }],
      updateMany: async (args) => {
        clientUpdate = args;
        return { count: 1 };
      },
    },
    salesPipeline: {
      findMany: async () => [{
        id: "deal-1",
        clientId: "client-1",
        clientName: "Lead Teste",
        pipelineId: null,
        stage: "novo_lead",
        stageId: null,
      }],
      updateMany: async (args) => {
        dealUpdate = args;
        return { count: 1 };
      },
    },
    pipelineStage: {
      findMany: async () => [],
    },
    pipeline: {
      findFirst: async (args) => {
        pipelineLookups.push(args);
        if (args.where?.unit === "Osasco") return null;
        return { id: "pipeline-base", unit: "Barueri", stages };
      },
    },
    auditLog: {
      create: async (args) => {
        auditEntry = args;
        return { id: "audit-1" };
      },
    },
  };

  const result = await advanceNewLeadToServiceStage({
    database,
    phone: "5511999999999",
    contactUnit: "Osasco",
    instanceUnit: "Osasco",
    userName: "Operadora",
  });

  assert.deepEqual(result, {
    status: "moved",
    dealId: "deal-1",
    stageId: "stage-service",
    stageName: "Em Atendimento",
    unit: "Osasco",
  });
  assert.equal(pipelineLookups.length, 2);
  assert.equal(pipelineLookups[0].where.unit, "Osasco");
  assert.equal(pipelineLookups[1].where, undefined);
  assert.deepEqual(dealUpdate.data, {
    pipelineId: "pipeline-base",
    stageId: "stage-service",
    stage: "em_atendimento",
  });
  assert.equal(clientUpdate.data.stage, "em_andamento");
  assert.equal(auditEntry.data.entityId, "deal-1");
});
