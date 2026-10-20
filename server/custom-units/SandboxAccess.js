'use strict';
const crypto = require('crypto');

function allowSandboxSocket(request, token, httpPort) {
 const address = request.socket?.remoteAddress;
 if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address)) return false;
 try {
  const origin = new URL(request.headers.origin);
  if (origin.origin !== `http://127.0.0.1:${httpPort}`) return false;
  const supplied = new URL(request.url, 'http://127.0.0.1').searchParams.get('custom-session');
  if (!/^[a-f0-9]{64}$/.test(supplied || '') || !/^[a-f0-9]{64}$/.test(token || '')) return false;
  return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(token));
 } catch (_) { return false; }
}
module.exports = { allowSandboxSocket };
