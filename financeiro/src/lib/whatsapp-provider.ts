// ─── WhatsApp Provider Abstraction Layer ───
// Normalizes API calls between Evolution API and Mega API
// Provider is selected per-instance based on the `providerType` field in EvolutionConfig

export interface WhatsAppProviderConfig {
  providerType: 'evolution' | 'mega';
  baseUrl: string;      // Evolution: full URL | Mega: https://{host}
  apiKey: string;        // Evolution: apikey | Mega: bearer token
  instanceName: string;  // Evolution: instance name | Mega: instance_key
  label: string;
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
  
  const providerType = (config.providerType || 'evolution') as 'evolution' | 'mega';
  let baseUrl = config.apiUrl.replace(/\/$/, '');
  
  // For Mega API, ensure the URL is properly formatted
  if (providerType === 'mega' && !baseUrl.startsWith('http')) {
    baseUrl = `https://${baseUrl}`;
  }
  
  return {
    providerType,
    baseUrl,
    apiKey: config.apiKey,
    instanceName: config.instanceName || 'virtuosa-default',
    label: config.label || config.instanceName || 'Principal',
  };
}

// ─── Auth Headers ───
export function getAuthHeaders(config: WhatsAppProviderConfig): Record<string, string> {
  if (config.providerType === 'mega') {
    return {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    };
  }
  // Evolution API
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
  const headers = getAuthHeaders(config);
  
  if (config.providerType === 'mega') {
    // Mega API: POST /rest/sendMessage/{instance_key}/text
    const res = await fetch(`${config.baseUrl}/rest/sendMessage/${config.instanceName}/text`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        messageData: {
          to: to.includes('@') ? to : `${to}@s.whatsapp.net`,
          text,
        },
      }),
    });
    return res.json();
  }
  
  // Evolution API: POST /message/sendText/{instanceName}
  const res = await fetch(`${config.baseUrl}/message/sendText/${config.instanceName}`, {
    method: 'POST',
    headers,
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
  const headers = getAuthHeaders(config);
  
  if (config.providerType === 'mega') {
    // Mega API: POST /rest/sendMessage/{key}/mediaUrl
    const res = await fetch(`${config.baseUrl}/rest/sendMessage/${config.instanceName}/mediaUrl`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        messageData: {
          to: to.includes('@') ? to : `${to}@s.whatsapp.net`,
          url,
          type: opts.type || 'document',
          caption: opts.caption || '',
          mimeType: opts.mimeType || 'application/octet-stream',
          fileName: opts.fileName || 'file',
        },
      }),
    });
    return res.json();
  }
  
  // Evolution API: POST /message/sendMedia/{instanceName}
  const res = await fetch(`${config.baseUrl}/message/sendMedia/${config.instanceName}`, {
    method: 'POST',
    headers,
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
  const headers = getAuthHeaders(config);
  
  if (config.providerType === 'mega') {
    // Mega API: POST /rest/sendMessage/{key}/mediaBase64
    const res = await fetch(`${config.baseUrl}/rest/sendMessage/${config.instanceName}/mediaBase64`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        messageData: {
          to: to.includes('@') ? to : `${to}@s.whatsapp.net`,
          base64: base64Data,
          type: opts.type || 'image',
          caption: opts.caption || '',
          mimeType: opts.mimeType || 'image/jpeg',
          fileName: opts.fileName || 'file',
        },
      }),
    });
    return res.json();
  }
  
  // Evolution API: POST /message/sendMedia/{instanceName}
  const res = await fetch(`${config.baseUrl}/message/sendMedia/${config.instanceName}`, {
    method: 'POST',
    headers,
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
  const headers = getAuthHeaders(config);
  
  if (config.providerType === 'mega') {
    // Mega API: Use mediaUrl or mediaBase64 with type "audio"
    const endpoint = isBase64 ? 'mediaBase64' : 'mediaUrl';
    const res = await fetch(`${config.baseUrl}/rest/sendMessage/${config.instanceName}/${endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        messageData: {
          to: to.includes('@') ? to : `${to}@s.whatsapp.net`,
          ...(isBase64 ? { base64: audioData } : { url: audioData }),
          type: 'audio',
          mimeType: 'audio/ogg; codecs=opus',
        },
      }),
    });
    return res.json();
  }
  
  // Evolution API: POST /message/sendWhatsAppAudio/{instanceName}
  const res = await fetch(`${config.baseUrl}/message/sendWhatsAppAudio/${config.instanceName}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      number: to,
      audio: audioData,
      encoding: isBase64,
    }),
  });
  return res.json();
}

// ─── Get Connection Status ───
export async function getConnectionStatus(
  config: WhatsAppProviderConfig
): Promise<{ state: string; isConnected: boolean }> {
  const headers = getAuthHeaders(config);
  
  try {
    if (config.providerType === 'mega') {
      // Mega API: GET /rest/instance/{key}
      const res = await fetch(`${config.baseUrl}/rest/instance/${config.instanceName}`, { headers });
      const data = await res.json();
      const status = data?.instance?.status || data?.instance?.state || 'close';
      return { state: status, isConnected: status === 'open' || status === 'connected' };
    }
    
    // Evolution API: GET /instance/connectionState/{name}
    const res = await fetch(`${config.baseUrl}/instance/connectionState/${config.instanceName}`, { headers });
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
  const headers = getAuthHeaders(config);
  
  try {
    if (config.providerType === 'mega') {
      // Mega API: GET /rest/instance/qrcode_base64/{key}
      const res = await fetch(`${config.baseUrl}/rest/instance/qrcode_base64/${config.instanceName}`, { headers });
      const data = await res.json();
      return {
        qrcode: data?.qrcode || data?.base64 || null,
        state: 'connecting',
      };
    }
    
    // Evolution API: GET /instance/connect/{name}
    const res = await fetch(`${config.baseUrl}/instance/connect/${config.instanceName}`, { headers });
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
export async function disconnect(
  config: WhatsAppProviderConfig
): Promise<void> {
  const headers = getAuthHeaders(config);
  
  try {
    if (config.providerType === 'mega') {
      // Mega API: DELETE /rest/instance/{key}/logout
      await fetch(`${config.baseUrl}/rest/instance/${config.instanceName}/logout`, {
        method: 'DELETE',
        headers,
      });
    } else {
      // Evolution API: DELETE /instance/logout/{name}
      await fetch(`${config.baseUrl}/instance/logout/${config.instanceName}`, {
        method: 'DELETE',
        headers,
      });
    }
  } catch { /* ignore — may fail if already disconnected */ }
}

// ─── Download Media ───
export async function downloadMedia(
  config: WhatsAppProviderConfig,
  params: {
    messageId?: string;
    remoteJid?: string;
    fromMe?: boolean;
    // Mega API specific fields (from webhook message)
    mediaKey?: string;
    directPath?: string;
    url?: string;
    mimetype?: string;
    messageType?: string;
  }
): Promise<{ base64: string; mimetype: string; fileName?: string } | null> {
  const headers = getAuthHeaders(config);
  
  try {
    if (config.providerType === 'mega') {
      // Mega API: POST /rest/instance/downloadMediaMessage/{key}
      const res = await fetch(`${config.baseUrl}/rest/instance/downloadMediaMessage/${config.instanceName}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          messageKeys: {
            mediaKey: params.mediaKey,
            directPath: params.directPath,
            url: params.url,
            mimetype: params.mimetype || 'application/octet-stream',
            messageType: params.messageType || 'document',
          },
        }),
      });
      const data = await res.json();
      if (data.base64) {
        return { base64: data.base64, mimetype: data.mimetype || params.mimetype || 'application/octet-stream' };
      }
      return null;
    }
    
    // Evolution API: POST /chat/getBase64FromMediaMessage/{name}
    const res = await fetch(`${config.baseUrl}/chat/getBase64FromMediaMessage/${config.instanceName}`, {
      method: 'POST',
      headers,
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
    });
    const data = await res.json();
    if (data.base64) {
      return { base64: data.base64, mimetype: data.mimetype || 'audio/ogg', fileName: data.fileName };
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Configure Webhook ───
export async function configureWebhook(
  config: WhatsAppProviderConfig,
  webhookUrl: string
): Promise<any> {
  const headers = getAuthHeaders(config);
  
  if (config.providerType === 'mega') {
    // Mega API: POST /rest/webhook/{key}/configWebhook
    const res = await fetch(`${config.baseUrl}/rest/webhook/${config.instanceName}/configWebhook`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        messageData: {
          webhookUrl,
          webhookEnabled: true,
        },
      }),
    });
    return res.json();
  }
  
  // Evolution API: uses dashboard/panel config (no REST endpoint)
  return { info: 'Configure webhook via Evolution API dashboard' };
}

// ─── Find Chats (Evolution only — Mega API doesn't have this) ───
export async function findChats(
  config: WhatsAppProviderConfig
): Promise<any[]> {
  if (config.providerType === 'mega') {
    // Mega API doesn't have chat listing — return empty
    return [];
  }
  
  const headers = getAuthHeaders(config);
  const res = await fetch(`${config.baseUrl}/chat/findChats/${config.instanceName}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
  return res.json();
}

// ─── Find Contacts (Evolution only) ───
export async function findContacts(
  config: WhatsAppProviderConfig
): Promise<any[]> {
  if (config.providerType === 'mega') {
    return [];
  }
  
  const headers = getAuthHeaders(config);
  const res = await fetch(`${config.baseUrl}/chat/findContacts/${config.instanceName}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
  return res.json();
}

// ─── Find Messages (Evolution only) ───
export async function findMessages(
  config: WhatsAppProviderConfig,
  remoteJid: string,
  opts: { page?: number; limit?: number } = {}
): Promise<any> {
  if (config.providerType === 'mega') {
    // Mega API doesn't have message history — return empty
    return { messages: { records: [] } };
  }
  
  const headers = getAuthHeaders(config);
  const res = await fetch(`${config.baseUrl}/chat/findMessages/${config.instanceName}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      where: {
        key: { remoteJid },
      },
      page: opts.page || 1,
      offset: opts.limit || 50,
    }),
  });
  return res.json();
}

// ─── Create Instance (Evolution only — Mega uses dashboard) ───
export async function createInstance(
  config: WhatsAppProviderConfig
): Promise<any> {
  if (config.providerType === 'mega') {
    return { info: 'Mega API instances are created via the dashboard panel' };
  }
  
  const headers = getAuthHeaders(config);
  const res = await fetch(`${config.baseUrl}/instance/create`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      instanceName: config.instanceName,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS',
    }),
  });
  return res.json();
}
