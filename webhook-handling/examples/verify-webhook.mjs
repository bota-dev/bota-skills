import { createHmac, timingSafeEqual } from 'node:crypto';

/** Verify raw Node request bytes before JSON parsing. The receiver supplies its
 * environment-held secret; importing this module reads no credentials or IO.
 * nowSeconds is a trusted clock/testing input, never a request parameter. */
export function verifyBotaWebhook(rawBody, signature, timestampHeader, secret,
  nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!Buffer.isBuffer(rawBody) || typeof secret !== 'string' || secret.length === 0 ||
      typeof signature !== 'string' || !/^v1=[a-fA-F0-9]{64}$/.test(signature) ||
      typeof timestampHeader !== 'string' || !/^(?:0|[1-9][0-9]{0,10})$/.test(timestampHeader) ||
      !Number.isSafeInteger(nowSeconds) || nowSeconds < 0) return false;
  const timestamp = Number(timestampHeader);
  if (!Number.isSafeInteger(timestamp) || Math.abs(nowSeconds - timestamp) > 300) return false;
  const expected = createHmac('sha256', secret)
    .update(timestampHeader + '.', 'ascii').update(rawBody).digest();
  const actual = Buffer.from(signature.slice(3), 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
