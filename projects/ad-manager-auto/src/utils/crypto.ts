import crypto from "node:crypto";

export function stableHash(input: string, length = 10): string {
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, length);
}

export function safeTimingEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

export function hmacSha256Hex(secret: string, body: Buffer): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}
