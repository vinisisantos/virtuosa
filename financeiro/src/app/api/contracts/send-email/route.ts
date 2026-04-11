import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { Resend } from 'resend';

export async function POST(req: NextRequest) {
  try {
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: 'RESEND_API_KEY não configurada. Configure nas variáveis de ambiente.' }, { status: 500 });
    }
    const resend = new Resend(process.env.RESEND_API_KEY);

    const { contractId, email } = await req.json();

    if (!contractId || !email) {
      return NextResponse.json({ error: 'contractId e email são obrigatórios' }, { status: 400 });
    }

    // Get the contract
    const contract = await prisma.digitalContract.findUnique({ where: { id: contractId } });
    if (!contract) {
      return NextResponse.json({ error: 'Contrato não encontrado' }, { status: 404 });
    }
    if (!contract.signingToken) {
      return NextResponse.json({ error: 'Contrato sem token de assinatura' }, { status: 400 });
    }

    // Build signing URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://clinicasgestao.com.br';
    const signingUrl = `${baseUrl}/assinar/${contract.signingToken}`;

    // Update contract email if not set
    if (!contract.clientEmail) {
      await prisma.digitalContract.update({
        where: { id: contractId },
        data: { clientEmail: email },
      });
    }

    // Send email via Resend
    const fromEmail = process.env.FROM_EMAIL || 'Virtuosa Clínicas <onboarding@resend.dev>';
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: [email],
      subject: `📝 Contrato para Assinatura — ${contract.templateName}`,
      html: buildContractEmail({
        clientName: contract.clientName,
        templateName: contract.templateName,
        signingUrl,
        unit: contract.unit,
      }),
    });

    if (error) {
      console.error('[Email] Resend error:', error);
      return NextResponse.json({ error: error.message || 'Erro ao enviar email' }, { status: 500 });
    }

    return NextResponse.json({ success: true, emailId: data?.id });
  } catch (err: any) {
    console.error('[Email] Error:', err);
    return NextResponse.json({ error: err?.message || 'Erro interno' }, { status: 500 });
  }
}

function buildContractEmail({ clientName, templateName, signingUrl, unit }: {
  clientName: string; templateName: string; signingUrl: string; unit: string;
}) {
  const firstName = clientName.split(' ')[0];

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Contrato para Assinatura</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:800;letter-spacing:-0.5px;">
                ✍️ Contrato para Assinatura
              </h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;font-weight:500;">
                ${templateName}
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 20px;font-size:16px;color:#334155;line-height:1.6;">
                Olá, <strong>${firstName}</strong>! 👋
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.7;">
                Seu contrato <strong>"${templateName}"</strong> está pronto para assinatura digital. 
                Clique no botão abaixo para ler os termos e assinar de forma rápida e segura.
              </p>

              <!-- Info Card -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;margin-bottom:32px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:4px 0;">
                          <span style="display:inline-block;font-size:12px;font-weight:700;color:#94a3b8;text-transform:uppercase;">Documento</span><br>
                          <span style="font-size:14px;font-weight:700;color:#1e293b;">${templateName}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:4px 0;">
                          <span style="display:inline-block;font-size:12px;font-weight:700;color:#94a3b8;text-transform:uppercase;">Signatário</span><br>
                          <span style="font-size:14px;font-weight:700;color:#1e293b;">${clientName}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:4px 0;">
                          <span style="display:inline-block;font-size:12px;font-weight:700;color:#94a3b8;text-transform:uppercase;">Unidade</span><br>
                          <span style="font-size:14px;font-weight:700;color:#1e293b;">${unit}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${signingUrl}" style="display:inline-block;padding:16px 48px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#ffffff;text-decoration:none;border-radius:14px;font-size:16px;font-weight:800;letter-spacing:0.3px;box-shadow:0 6px 20px rgba(99,102,241,0.35);">
                      ✅ Ler e Assinar Contrato
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:28px 0 0;font-size:13px;color:#94a3b8;text-align:center;line-height:1.6;">
                Se o botão não funcionar, copie e cole este link no navegador:<br>
                <a href="${signingUrl}" style="color:#6366f1;word-break:break-all;font-size:12px;">${signingUrl}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;padding:24px 40px;border-top:1px solid #e2e8f0;text-align:center;">
              <p style="margin:0 0 4px;font-size:13px;color:#64748b;font-weight:600;">
                Virtuosa Clínicas — ${unit}
              </p>
              <p style="margin:0;font-size:11px;color:#94a3b8;">
                Este email foi enviado automaticamente. Sua assinatura será registrada com data, hora e endereço IP.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
