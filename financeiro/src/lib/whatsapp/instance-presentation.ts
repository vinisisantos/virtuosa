import { prisma } from "@/lib/db";

export const INSTANCE_DISPLAY_NAMES_KEY = "whatsapp_instance_display_names";
export const INSTANCE_CHANNELS_KEY = "whatsapp_instance_channels";
export const ALLOWED_INSTANCE_CHANNELS = ["whatsapp", "instagram"] as const;

export type InstanceChannel = (typeof ALLOWED_INSTANCE_CHANNELS)[number];

export function normalizeInstanceChannel(channel?: string | null): InstanceChannel {
  return channel === "instagram" ? "instagram" : "whatsapp";
}

function parseRecord(value?: string | null): Record<string, unknown> {
  if (!value) return {};

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export async function getInstancePresentationSettings() {
  const settings = await prisma.appSetting.findMany({
    where: { key: { in: [INSTANCE_DISPLAY_NAMES_KEY, INSTANCE_CHANNELS_KEY] } },
    select: { key: true, value: true },
  });
  const values = new Map(settings.map((setting) => [setting.key, setting.value]));
  const rawDisplayNames = parseRecord(values.get(INSTANCE_DISPLAY_NAMES_KEY));
  const rawChannels = parseRecord(values.get(INSTANCE_CHANNELS_KEY));

  const displayNames = Object.fromEntries(
    Object.entries(rawDisplayNames)
      .filter(([, value]) => typeof value === "string" && value.trim())
      .map(([instanceId, value]) => [instanceId, (value as string).trim()]),
  ) as Record<string, string>;
  const channels = Object.fromEntries(
    Object.entries(rawChannels).map(([instanceId, value]) => [
      instanceId,
      normalizeInstanceChannel(typeof value === "string" ? value : null),
    ]),
  ) as Record<string, InstanceChannel>;

  return { displayNames, channels };
}

export async function setInstanceDisplayName(instanceId: string, displayName: string | null) {
  const { displayNames } = await getInstancePresentationSettings();
  const cleanName = displayName?.trim();

  if (cleanName) {
    displayNames[instanceId] = cleanName.slice(0, 80);
  } else {
    delete displayNames[instanceId];
  }

  await prisma.appSetting.upsert({
    where: { key: INSTANCE_DISPLAY_NAMES_KEY },
    create: { key: INSTANCE_DISPLAY_NAMES_KEY, value: JSON.stringify(displayNames) },
    update: { value: JSON.stringify(displayNames) },
  });

  return displayNames[instanceId] || null;
}

export async function setInstanceChannel(instanceId: string, channel: InstanceChannel) {
  const { channels } = await getInstancePresentationSettings();
  channels[instanceId] = channel;

  await prisma.appSetting.upsert({
    where: { key: INSTANCE_CHANNELS_KEY },
    create: { key: INSTANCE_CHANNELS_KEY, value: JSON.stringify(channels) },
    update: { value: JSON.stringify(channels) },
  });

  return channels[instanceId];
}
