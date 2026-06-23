import { NextResponse } from 'next/server';
import { DEFAULT_SETTINGS } from '@/lib/payroll-calc';

import { prisma } from "@/lib/db";
const SETTINGS_KEY = 'folha_inteligente_settings';

export async function GET(req: Request) {
  try {
    const setting = await prisma.appSetting.findUnique({
      where: { key: SETTINGS_KEY },
    });

    if (setting) {
      return NextResponse.json(JSON.parse(setting.value));
    } else {
      return NextResponse.json(DEFAULT_SETTINGS);
    }
  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const data = await req.json();
    
    const setting = await prisma.appSetting.upsert({
      where: { key: SETTINGS_KEY },
      update: { value: JSON.stringify(data) },
      create: { key: SETTINGS_KEY, value: JSON.stringify(data) },
    });

    return NextResponse.json(JSON.parse(setting.value));
  } catch (error) {
    console.error('Error updating settings:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
