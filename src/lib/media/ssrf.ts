const PRIVATE_IP_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^::1$/,
  /^fe80:/i,
  /^fc00:/i,
  /^fd00:/i,
  /^localhost$/i,
];

export function isPrivateIP(hostname: string): boolean {
  return PRIVATE_IP_RANGES.some(pattern => pattern.test(hostname));
}

export async function isPrivateURL(urlString: string): Promise<boolean> {
  try {
    const url = new URL(urlString);
    const hostname = url.hostname;

    if (isPrivateIP(hostname)) {
      return true;
    }

    if (/^[a-zA-Z]/.test(hostname) && !hostname.includes('.')) {
      return true;
    }

    return false;
  } catch {
    return true;
  }
}

export function sanitizeURL(urlString: string): string | null {
  try {
    const url = new URL(urlString);

    if (!['http:', 'https:'].includes(url.protocol)) {
      return null;
    }

    if (isPrivateIP(url.hostname)) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}
