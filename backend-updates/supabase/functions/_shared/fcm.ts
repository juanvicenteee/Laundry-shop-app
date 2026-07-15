// Shared FCM HTTP v1 sender, used by send-push-notification and
// send-cart-abandonment-reminders. Supabase Edge Functions support
// relative imports across function directories via this _shared folder.

function base64UrlEncode(bytes: Uint8Array): string {
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const clean = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

async function getFcmAccessToken(serviceAccount: { client_email: string; private_key: string }): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 30_000) {
    return cachedAccessToken.token;
  }

  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const encoder = new TextEncoder();
  const encodedHeader = base64UrlEncode(encoder.encode(JSON.stringify(header)));
  const encodedClaims = base64UrlEncode(encoder.encode(JSON.stringify(claims)));
  const signingInput = `${encodedHeader}.${encodedClaims}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(serviceAccount.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(signingInput));
  const jwt = `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`Google OAuth token exchange failed: ${JSON.stringify(payload)}`);

  cachedAccessToken = { token: payload.access_token, expiresAt: Date.now() + payload.expires_in * 1000 };
  return cachedAccessToken.token;
}

export async function sendFcm(
  token: string,
  title: string,
  body: string,
  data: Record<string, unknown> = {}
): Promise<{ sent: boolean; error?: string }> {
  const raw = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON');
  if (!raw) return { sent: false, error: 'FIREBASE_SERVICE_ACCOUNT_JSON secret is not configured yet.' };

  const serviceAccount = JSON.parse(raw);
  const accessToken = await getFcmAccessToken(serviceAccount);

  // Data-only message (no top-level `notification`): guarantees
  // onMessageReceived() always runs on Android, even in the background, so
  // BubblyfiMessagingService can pick the sound/vibration channel that
  // matches the customer's saved preference.
  const stringData: Record<string, string> = { title, body };
  for (const [k, v] of Object.entries(data)) stringData[k] = String(v);

  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: { token, data: stringData, android: { priority: 'high' } },
      }),
    }
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok) return { sent: false, error: `FCM ${response.status}: ${JSON.stringify(payload)}` };
  return { sent: true };
}
