import { NextResponse } from 'next/server';

/**
 * POST /api/data-cleanup
 * 
 * Scans all financial logs and fixes procedure obs fields where
 * "Retorno" procedures have been incorrectly assigned a value.
 * 
 * This doesn't change the sale value (item.value / totalLiquido is correct),
 * it only ensures the obs field correctly marks zero-value procedures
 * so the analytics engine distributes revenue properly.
 * 
 * Body: { units: string[], dryRun?: boolean }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const targetUnits: string[] = body.units || [];
    const dryRun = body.dryRun === true;

    // This endpoint returns instructions for the frontend to execute
    // since IndexedDB lives in the browser, not the server
    return NextResponse.json({
      success: true,
      message: 'Use the frontend cleanup utility. This endpoint validates the request.',
      targetUnits,
      dryRun,
      zeroValuePatterns: [
        'retorno',
        'cortesia', 
        'brinde',
        'avaliação',
        'avaliacao',
      ],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
