const mobileUserAgent = /android|iphone|ipod|ipad|iemobile|windows phone|blackberry|opera mini|\bmobile\b/i;

export function isMobileRequest(request) {
  const headers = request?.headers ?? request ?? {};
  if (String(headers['x-krabak-device-class'] ?? '').trim().toLowerCase() === 'mobile') return true;
  if (String(headers['sec-ch-ua-mobile'] ?? '').trim() === '?1') return true;
  if (mobileUserAgent.test(String(headers['user-agent'] ?? ''))) return true;

  try {
    return new URL(request?.url ?? '/', 'http://localhost').searchParams.get('clientClass') === 'mobile';
  } catch {
    return false;
  }
}
