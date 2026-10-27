import crypto from 'crypto';

export const COOKIE_NAME = 'gsc_auth_session';
export const STATE_COOKIE_NAME = 'gsc_oauth_state';
export const VERIFIER_COOKIE_NAME = 'gsc_pkce_verifier';

export interface GscSessionData {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // epoch ms
  userEmail?: string;
}

/**
 * Derives a consistent 32-byte AES-256 key from an environment secret
 */
function getEncryptionKey(): Buffer {
  const secret =
    process.env.SESSION_SECRET ||
    process.env.SESSION_ENCRYPTION_KEY ||
    process.env.GOOGLE_CLIENT_SECRET ||
    'indian-marketers-gsc-secure-session-key-default-salt-32';
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypts session payload into a tamper-proof AES-256-GCM string (iv.authTag.ciphertext)
 */
export function encryptSession(data: GscSessionData): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const jsonStr = JSON.stringify(data);
  let encrypted = cipher.update(jsonStr, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag();

  return `${iv.toString('base64')}.${authTag.toString('base64')}.${encrypted}`;
}

/**
 * Decrypts and verifies an AES-256-GCM session cookie
 */
export function decryptSession(cookieValue: string | undefined): GscSessionData | null {
  if (!cookieValue) return null;
  try {
    const parts = cookieValue.split('.');
    if (parts.length !== 3) return null;

    const [ivB64, authTagB64, encryptedText] = parts;
    const key = getEncryptionKey();
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(authTagB64, 'base64');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedText, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    const session: GscSessionData = JSON.parse(decrypted);
    return session;
  } catch {
    return null;
  }
}

/**
 * Generates high-entropy PKCE code verifier and SHA-256 code challenge
 */
export function generatePkcePair(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
  return { verifier, challenge };
}

/**
 * Generates random high-entropy CSRF state token
 */
export function generateCsrfState(): string {
  return crypto.randomBytes(24).toString('hex');
}
