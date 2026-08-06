import { createHash, createHmac, randomBytes } from "node:crypto";

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function createPublicTestToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: sha256(token), tokenHint: token.slice(-8) };
}

function publicTestLinkSignatureSecret() {
  const secret = process.env.AI_PUBLIC_TEST_LINK_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error("AI_PUBLIC_TEST_LINK_SECRET ou JWT_SECRET é obrigatório");
  return secret;
}

export function restorablePublicTestToken(linkId: string) {
  const signature = createHmac("sha256", publicTestLinkSignatureSecret())
    .update(`public-test-link-v1:${linkId}`)
    .digest("base64url");
  const token = `${linkId}_${signature}`;
  return { token, tokenHash: sha256(token), tokenHint: token.slice(-8) };
}
