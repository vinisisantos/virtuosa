const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

function normalizeHostname(host: string): string {
  const normalizedHost = host.trim().toLowerCase();
  if (normalizedHost === '::1') return normalizedHost;

  const bracketedIpv6 = normalizedHost.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketedIpv6) return bracketedIpv6[1];

  return normalizedHost.replace(/:\d+$/, '');
}

export function matchesLocalTestCredentials(
  email: string,
  password: string,
  requestHost: string,
): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  if (!LOCAL_HOSTNAMES.has(normalizeHostname(requestHost))) return false;

  const configuredEmail = process.env.LOCAL_TEST_EMAIL?.trim().toLowerCase();
  const configuredPassword = process.env.LOCAL_TEST_PASSWORD;

  if (!configuredEmail || !configuredPassword) return false;

  return email.trim().toLowerCase() === configuredEmail && password === configuredPassword;
}
