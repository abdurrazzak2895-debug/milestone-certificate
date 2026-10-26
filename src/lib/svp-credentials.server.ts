// Server-only AES-GCM storage for the SVP password used by "Reconnect".
// The plaintext password never reaches the browser and is never logged.
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function credentialSecret(): string | null {
  for (const name of ["SVP_CREDENTIAL_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
    const value = process.env[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function canStoreSvpCredentials(): boolean {
  return credentialSecret() !== null;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

async function credentialKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(`svp-credential:${secret}`));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** Encrypt the SVP password for the httpOnly vault cookie. */
export async function encryptSvpPassword(password: string): Promise<string | null> {
  const secret = credentialSecret();
  if (!secret || !password) return null;
  try {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      await credentialKey(secret),
      encoder.encode(password),
    );
    return `v1.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(encrypted))}`;
  } catch {
    return null;
  }
}

/** Decrypt a stored SVP password; null when the key changed or the value is invalid. */
export async function decryptSvpPassword(value: string | null | undefined): Promise<string | null> {
  const secret = credentialSecret();
  if (!secret || !value) return null;
  const [version, ivPart, dataPart] = value.split(".");
  if (version !== "v1" || !ivPart || !dataPart) return null;
  const iv = fromBase64Url(ivPart);
  const data = fromBase64Url(dataPart);
  if (!iv || !data) return null;
  const ivBuffer = iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer;
  const buffer = data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength,
  ) as ArrayBuffer;
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ivBuffer },
      await credentialKey(secret),
      buffer,
    );
    return decoder.decode(decrypted);
  } catch {
    return null;
  }
}
