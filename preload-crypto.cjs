// Polyfill global crypto for Rollup / serialize-javascript under Node 18
const crypto = require('crypto');
if (!globalThis.crypto) {
  globalThis.crypto = crypto.webcrypto || crypto;
}
if (!global.crypto) {
  global.crypto = crypto.webcrypto || crypto;
}
