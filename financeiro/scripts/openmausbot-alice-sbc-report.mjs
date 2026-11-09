import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const REPORT_URL = "https://clinicasgestao.com.br/api/integrations/openmausbot/alice-report";
const TOKEN_ENV = "OPENMAUSBOT_SBC_REPORT_TOKEN";

const server = new Server(
  { name: "virtuosa-alice-sbc-report", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: "get_alice_sbc_report",
    description: "Retorna indicadores agregados das últimas 24 horas da Alice, exclusivamente da unidade São Bernardo do Campo (SBC).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "get_alice_sbc_report") {
    return { content: [{ type: "text", text: "Ferramenta não encontrada." }], isError: true };
  }

  const token = process.env[TOKEN_ENV]?.trim();
  if (!token) {
    return { content: [{ type: "text", text: "Credencial da integração não configurada." }], isError: true };
  }

  try {
    const response = await fetch(REPORT_URL, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const message = response.status === 401
        ? "A API não aceitou a credencial; confira a configuração da integração."
        : "A API não conseguiu gerar o relatório. Tente novamente mais tarde.";
      return { content: [{ type: "text", text: message }], isError: true };
    }

    const report = await response.json();
    return { content: [{ type: "text", text: JSON.stringify(report) }] };
  } catch {
    return { content: [{ type: "text", text: "Não foi possível conectar à API do relatório." }], isError: true };
  }
});

await server.connect(new StdioServerTransport());
