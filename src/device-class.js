const mobileUserAgent = /android|iphone|ipod|ipad|iemobile|windows phone|blackberry|opera mini|\bmobile\b/i;

export function isMobileBrowser(device = globalThis.navigator) {
  if (!device) return false;
  if (device.userAgentData?.mobile === true) return true;
  if (mobileUserAgent.test(String(device.userAgent ?? ''))) return true;
  return device.platform === 'MacIntel' && Number(device.maxTouchPoints ?? 0) > 1;
}

export function mobileRequestHeaders(device = globalThis.navigator) {
  return isMobileBrowser(device) ? { 'X-Krabak-Device-Class': 'mobile' } : {};
}

export function mobileWebSocketQuery(device = globalThis.navigator) {
  return isMobileBrowser(device) ? '?clientClass=mobile' : '';
}
