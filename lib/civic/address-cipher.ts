import { createCipheriv, createHash, randomBytes } from "crypto";

const VERSION = "v1";

function keyMaterial() {
  const dedicated = process.env.CIVIC_ADDRESS_ENCRYPTION_KEY?.trim();
  if (dedicated) return createHash("sha256").update(dedicated).digest();

  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (serviceRole) {
    return createHash("sha256")
      .update(`where-2-run:civic-address:${serviceRole}`)
      .digest();
  }

  throw new Error(
    "Set CIVIC_ADDRESS_ENCRYPTION_KEY before storing a residential address.",
  );
}

/** AES-256-GCM ciphertext. The residential address never lands in the database as plaintext. */
export function encryptResidentialAddress(plaintext: string) {
  const key = keyMaterial();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${Buffer.concat([iv, tag, ciphertext]).toString("base64url")}`;
}