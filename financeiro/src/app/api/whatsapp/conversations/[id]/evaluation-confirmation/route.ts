import {
  getEvaluationConfirmation,
  resolveEvaluationConfirmationContext,
  sendEvaluationConfirmation,
} from "@/lib/whatsapp/evaluation-confirmation-handler";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: RouteContext) {
  const { id } = await params;
  return getEvaluationConfirmation(() => resolveEvaluationConfirmationContext(req, id));
}

export async function POST(req: Request, { params }: RouteContext) {
  const { id } = await params;
  return sendEvaluationConfirmation(req, () => resolveEvaluationConfirmationContext(req, id));
}
