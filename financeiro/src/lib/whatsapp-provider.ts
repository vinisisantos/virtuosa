// ─── WhatsApp Provider — Evolution API Only ───

export interface WhatsAppProviderConfig {
  baseUrl: string;      // Ex: https://api.evolution.seuservidor.com.br
  apiKey: string;       // Global API Key (AUTHENTICATION_API_KEY)
  instanceName: string; // Nome da instância
  label: string;        // Apelido exibido no CRM
}

export interface SendMediaOpts {
  fileName?: string;
  caption?: string;
  mimeType?: string;
  type?: string; // image, video, audio, document
}

// ─── Build provider config from DB record ───
export function buildProviderConfig(config: any): WhatsAppProviderConfig | null {
  if (!config?.apiUrl || !config?.apiKey) return null;
  return {
    baseUrl: config.apiUrl.replace(/\/$/, ''),
    apiKey: config.apiKey,
    instanceName: config.instanceName || 'virtuosa-default',
    label: config.label || config.instanceName || 'Principal',
  };
}

// ─── Auth Headers ───
export function getAuthHeaders(config: WhatsAppProviderConfig): Record<string, string> {
  return {
    'apikey': config.apiKey,
    'Content-Type': 'application/json',
  };
}

// ─── Send Text Message ───
export async function sendText(
  config: WhatsAppProviderConfig,
  to: string,
  text: string
): Promise<any> {
  const res = await fetch(`${config.baseUrl}/message/sendText/${config.instanceName}`, {
    method: 'POST',
    headers: getAuthHeaders(config),
    body: JSON.stringify({ number: to, text }),
  });
  return res.json();
}

// ─── Send Media via URL ───
export async function sendMediaUrl(
  config: WhatsAppProviderConfig,
  to: string,
  url: string,
  opts: SendMediaOpts = {}
): Promise<any> {
  const res = await fetch(`${config.baseUrl}/message/sendMedia/${config.instanceName}`, {
    method: 'POST',
    headers: getAuthHeaders(config),
    body: JSON.stringify({
      number: to,
      mediatype: opts.type || 'document',
      media: url,
      caption: opts.caption || '',
      fileName: opts.fileName || 'file',
    }),
  });
  return res.json();
}

// ─── Send Media via Base64 ───
export async function sendMediaBase64(
  config: WhatsAppProviderConfig,
  to: string,
  base64Data: string,
  opts: SendMediaOpts = {}
): Promise<any> {
  const res = await fetch(`${config.baseUrl}/message/sendMedia/${config.instanceName}`, {
    method: 'POST',
    headers: getAuthHeaders(config),
    body: JSON.stringify({
      number: to,
      mediatype: opts.type || 'image',
      media: base64Data,
      caption: opts.caption || '',
      fileName: opts.fileName || 'file',
      mimetype: opts.mimeType || 'image/jpeg',
    }),
  });
  return res.json();
}

// ─── Send Audio PTT ───
export async function sendAudioPtt(
  config: WhatsAppProviderConfig,
  to: string,
  audioData: string, // base64 or URL
  isBase64: boolean = true
): Promise<any> {
  const res = await fetch(`${config.baseUrl}/message/sendWhatsAppAudio/${config.instanceName}`, {
    method: 'POST',
    headers: getAuthHeaders(config),
    body: JSON.stringify({ number: to, audio: audioData, encoding: isBase64 }),
  });
  return res.json();
}

// ─── Get Connection Status ───
export async function getConnectionStatus(
  config: WhatsAppProviderConfig
): Promise<{ state: string; isConnected: boolean }> {
  try {
    const res = await fetch(
      `${config.baseUrl}/instance/connectionState/${config.instanceName}`,
      { headers: getAuthHeaders(config) }
    );
    const data = await res.json();
    const state = data?.instance?.state || 'close';
    return { state, isConnected: state === 'open' };
  } catch {
    return { state: 'close', isConnected: false };
  }
}

// ─── Get QR Code ───
export async function getQrCode(
  config: WhatsAppProviderConfig
): Promise<{ qrcode: string | null; pairingCode?: string | null; state: string }> {
  try {
    const res = await fetch(
      `${config.baseUrl}/instance/connect/${config.instanceName}`,
      { headers: getAuthHeaders(config) }
    );
    const data = await res.json();
    return {
      qrcode: data?.base64 || data?.qrcode?.base64 || null,
      pairingCode: data?.pairingCode || null,
      state: data?.instance?.state || 'connecting',
    };
  } catch {
    return { qrcode: null, state: 'error' };
  }
}

// ─── Disconnect ───
export async function disconnect(config: WhatsAppProviderConfig): Promise<void> {
  try {
    await fetch(`${config.baseUrl}/instance/logout/${config.instanceName}`, {
      method: 'DELETE',
      headers: getAuthHeaders(config),
    });
  } catch { /* ignore — may fail if already disconnected */ }
}

// ─── Download Media ───
export async function downloadMedia(
  config: WhatsAppProviderConfig,
  params: {
    messageId?: string;
    remoteJid?: string;
    fromMe?: boolean;
  }
): Promise<{ base64: string; mimetype: string; fileName?: string } | null> {
  try {
    const res = await fetch(
      `${config.baseUrl}/chat/getBase64FromMediaMessage/${config.instanceName}`,
      {
        method: 'POST',
        headers: getAuthHeaders(config),
        body: JSON.stringify({
          message: {
            key: {
              id: params.messageId,
              remoteJid: params.remoteJid,
              fromMe: params.fromMe || false,
            },
          },
          convertToMp4: false,
        }),
      }
    );
    const data = await res.json();
    if (data.base64) {
      return { base64: data.base64, mimetype: data.mimetype || 'audio/ogg', fileName: data.fileName };
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Find Chats ───
export async function findChats(config: WhatsAppProviderConfig): Promise<any[]> {
  const res = await fetch(`${config.baseUrl}/chat/findChats/${config.instanceName}`, {
    method: 'POST',
    headers: getAuthHeaders(config),
    body: JSON.stringify({}),
  });
  return res.json();
}

// ─── Find Contacts ───
export async function findContacts(config: WhatsAppProviderConfig): Promise<any[]> {
  const res = await fetch(`${config.baseUrl}/chat/findContacts/${config.instanceName}`, {
    method: 'POST',
    headers: getAuthHeaders(config),
    body: JSON.stringify({}),
  });
  return res.json();
}

// ─── Find Messages ───
export async function findMessages(
  config: WhatsAppProviderConfig,
  remoteJid: string,
  opts: { page?: number; limit?: number } = {}
): Promise<any> {
  const res = await fetch(`${config.baseUrl}/chat/findMessages/${config.instanceName}`, {
    method: 'POST',
    headers: getAuthHeaders(config),
    body: JSON.stringify({
      where: { key: { remoteJid } },
      page: opts.page || 1,
      offset: opts.limit || 50,
    }),
  });
  return res.json();
}

// ─── Create Instance ───
export async function createInstance(config: WhatsAppProviderConfig): Promise<any> {
  const res = await fetch(`${config.baseUrl}/instance/create`, {
    method: 'POST',
    headers: getAuthHeaders(config),
    body: JSON.stringify({
      instanceName: config.instanceName,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS',
    }),
  });
  return res.json();
}

// ─── Configure Webhook (Evolution API) ───
export async function configureWebhook(
  config: WhatsAppProviderConfig,
  webhookUrl: string
): Promise<any> {
  const res = await fetch(`${config.baseUrl}/webhook/set/${config.instanceName}`, {
    method: 'POST',
    headers: getAuthHeaders(config),
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: webhookUrl,
        webhookByEvents: false,
        webhookBase64: true,
        events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
      },
    }),
  });
  return res.json();
}
