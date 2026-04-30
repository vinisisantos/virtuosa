/**
 * Autentique API Client
 * 
 * GraphQL client for Autentique digital signature platform.
 * Uses multipart/form-data for file uploads per the graphql-multipart-request-spec.
 * 
 * @see https://docs.autentique.com.br/api
 */

const AUTENTIQUE_API_URL = 'https://api.autentique.com.br/v2/graphql';

function getApiKey(): string {
  const key = process.env.AUTENTIQUE_API_KEY;
  if (!key) throw new Error('AUTENTIQUE_API_KEY não configurada nas variáveis de ambiente');
  return key;
}

function log(msg: string, data?: unknown) {
  console.log(`[Autentique] ${msg}`, data ? JSON.stringify(data).substring(0, 500) : '');
}

/** Validates CPF using check digits (Mod 11 algorithm) */
function isValidCpf(cpf: string): boolean {
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cpf[i]) * (10 - i);
  let d1 = 11 - (sum % 11);
  if (d1 >= 10) d1 = 0;
  if (parseInt(cpf[9]) !== d1) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cpf[i]) * (11 - i);
  let d2 = 11 - (sum % 11);
  if (d2 >= 10) d2 = 0;
  return parseInt(cpf[10]) === d2;
}

// ============================================
// Types
// ============================================

export interface AutoentiqueSignature {
  public_id: string;
  name: string;
  email: string | null;
  created_at: string;
  action: { name: string };
  link: { short_link: string } | null;
  user: { id: string; name: string; email: string } | null;
}

export interface AutoentiqueDocument {
  id: string;
  name: string;
  refusable: boolean;
  sortable: boolean;
  created_at: string;
  signatures: AutoentiqueSignature[];
  files?: {
    original: string;
    signed: string;
  };
}

export interface CreateDocumentResult {
  success: boolean;
  document?: AutoentiqueDocument;
  signatureLink?: string;
  signaturePublicId?: string;
  error?: string;
}

export interface GetDocumentResult {
  success: boolean;
  document?: AutoentiqueDocument & {
    signatures: (AutoentiqueSignature & {
      signed?: string | null;
      rejected?: string | null;
      viewed?: string | null;
    })[];
    files?: { original: string; signed: string };
  };
  error?: string;
}

// ============================================
// Mutations
// ============================================

/**
 * Creates a document on Autentique and sends it for signature.
 * 
 * Strategy: We pass the signer by `name` only (no email/phone) so the API
 * returns a `short_link` that we can then send via our existing WhatsApp CRM.
 * This is the cheapest option: R$0.06 (creation) + R$0.013 (signature via link).
 * 
 * The file is sent as HTML (Autentique accepts HTML, PDF, DOCX).
 */
export async function createDocument(params: {
  name: string;
  htmlContent?: string;
  pdfBase64?: string;
  signerName: string;
  signerCpf?: string;
  sandbox?: boolean;
}): Promise<CreateDocumentResult> {
  const { name, htmlContent, pdfBase64, signerName, signerCpf, sandbox = true } = params;

  const mutation = `mutation CreateDocumentMutation(
    $document: DocumentInput!,
    $signers: [SignerInput!]!,
    $file: Upload!
  ) {
    createDocument(
      sandbox: ${sandbox},
      document: $document,
      signers: $signers,
      file: $file
    ) {
      id
      name
      refusable
      sortable
      created_at
      signatures {
        public_id
        name
        email
        created_at
        action { name }
        link { short_link }
        user { id name email }
      }
    }
  }`;

  // Build signer object — using `name` to get signature link back
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const signer: any = {
    name: signerName,
    action: 'SIGN',
  };

  // Add CPF validation if provided — Autentique validates CPF format
  if (signerCpf) {
    const cleanCpf = signerCpf.replace(/\D/g, '');
    if (cleanCpf.length === 11 && isValidCpf(cleanCpf)) {
      signer.configs = { cpf: cleanCpf };
      log(`CPF attached: ${cleanCpf.substring(0, 3)}.***.***-${cleanCpf.substring(9)}`);
    } else {
      log(`CPF invalid or skipped: ${cleanCpf}`);
    }
  }

  const variables = {
    document: {
      name,
      message: 'Acesse e assine eletronicamente seu contrato Virtuosa Estética.',
      reminder: 'WEEKLY',
      footer: 'BOTTOM',
      refusable: true,
      scrolling_required: true,
      locale: {
        country: 'BR',
        language: 'pt-BR',
        timezone: 'America/Sao_Paulo',
      },
    },
    signers: [signer],
    file: null, // Handled by multipart map
  };

  const operations = JSON.stringify({ query: mutation, variables });
  const map = JSON.stringify({ file: ['variables.file'] });

  // Build multipart form data
  const formData = new FormData();
  formData.append('operations', operations);
  formData.append('map', map);

  // Build file blob — PDF (base64) or HTML
  const safeName = name.replace(/[^a-zA-Z0-9]/g, '_');
  if (pdfBase64) {
    // Use Buffer.from (Node.js) instead of atob for better serverless compatibility
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');
    const pdfBlob = new Blob([pdfBuffer], { type: 'application/pdf' });
    formData.append('file', pdfBlob, `${safeName}.pdf`);
    log(`PDF file attached: ${pdfBuffer.length} bytes (${(pdfBuffer.length / 1024).toFixed(1)}KB)`);
  } else if (htmlContent) {
    const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
    formData.append('file', htmlBlob, `${safeName}.html`);
    log(`HTML file attached: ${htmlContent.length} chars`);
  } else {
    return { success: false, error: 'Nenhum conteúdo (HTML ou PDF) fornecido para o documento.' };
  }

  log(`Creating document: "${name}", signer: ${signerName}, sandbox: ${sandbox}`);

  try {
    const response = await fetch(AUTENTIQUE_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getApiKey()}`,
      },
      body: formData,
    });

    const responseText = await response.text();
    log(`Response status: ${response.status}, body: ${responseText.substring(0, 400)}`);

    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      return { success: false, error: `Invalid JSON response: ${responseText.substring(0, 200)}` };
    }

    if (result.errors) {
      return { success: false, error: result.errors.map((e: { message: string }) => e.message).join(', ') };
    }

    const doc = result.data?.createDocument;
    if (!doc) {
      return { success: false, error: 'No document returned from API' };
    }

    // Extract signature link from the first signer
    const firstSig = doc.signatures?.[0];
    const signatureLink = firstSig?.link?.short_link || null;
    const signaturePublicId = firstSig?.public_id || null;

    log(`Document created! ID: ${doc.id}, link: ${signatureLink}`);

    return {
      success: true,
      document: doc,
      signatureLink: signatureLink || undefined,
      signaturePublicId: signaturePublicId || undefined,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log(`Error creating document: ${message}`);
    return { success: false, error: message };
  }
}

/**
 * Retrieves a document from Autentique by ID.
 */
export async function getDocument(documentId: string): Promise<GetDocumentResult> {
  const query = `query {
    document(id: "${documentId}") {
      id
      name
      refusable
      sortable
      created_at
      signatures {
        public_id
        name
        email
        created_at
        action { name }
        link { short_link }
        viewed
        signed
        rejected
        user { id name email }
      }
      files {
        original
        signed
      }
    }
  }`;

  try {
    const response = await fetch(AUTENTIQUE_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getApiKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    const result = await response.json();

    if (result.errors) {
      return { success: false, error: result.errors.map((e: { message: string }) => e.message).join(', ') };
    }

    return { success: true, document: result.data?.document };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * Resends signature notification for a document.
 */
export async function resendSignature(documentId: string): Promise<{ success: boolean; error?: string }> {
  const mutation = `mutation {
    resendDocument(id: "${documentId}") {
      id
      name
      signatures {
        public_id
        name
        email
        link { short_link }
      }
    }
  }`;

  try {
    const response = await fetch(AUTENTIQUE_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getApiKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: mutation }),
    });

    const result = await response.json();

    if (result.errors) {
      return { success: false, error: result.errors.map((e: { message: string }) => e.message).join(', ') };
    }

    log('Signature resent successfully');
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * Lists documents from Autentique (with optional sandbox filter).
 */
export async function listDocuments(params?: {
  sandbox?: boolean;
  page?: number;
  limit?: number;
}): Promise<{ success: boolean; documents?: AutoentiqueDocument[]; error?: string }> {
  const { sandbox = true, page = 1, limit = 20 } = params || {};

  const sandboxClause = sandbox ? 'showSandbox: true, onlySandbox: true,' : '';

  const query = `query {
    documents(
      limit: ${limit},
      page: ${page},
      ${sandboxClause}
    ) {
      total
      data {
        id
        name
        created_at
        signatures {
          public_id
          name
          email
          action { name }
          link { short_link }
          signed
          rejected
        }
      }
    }
  }`;

  try {
    const response = await fetch(AUTENTIQUE_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getApiKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    const result = await response.json();

    if (result.errors) {
      return { success: false, error: result.errors.map((e: { message: string }) => e.message).join(', ') };
    }

    return { success: true, documents: result.data?.documents?.data || [] };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
