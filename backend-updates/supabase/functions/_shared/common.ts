import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import { importPKCS8, SignJWT } from 'npm:jose@5.9.6';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

export function serviceClient() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function userClient(req: Request) {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requireUser(req: Request) {
  const client = userClient(req);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error('Authentication required');
  return data.user;
}

export async function requireStaff(req: Request, adminOnly = false) {
  const user = await requireUser(req);
  const db = serviceClient();
  const { data } = await db.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = String(data?.role || '').toLowerCase();
  if (!['admin', 'operator'].includes(role) || (adminOnly && role !== 'admin')) throw new Error(adminOnly ? 'Admin access required' : 'Staff access required');
  return { user, role };
}

type FirebaseConfig = { clientEmail: string; privateKey: string; projectId: string };
let cachedFirebaseConfig: FirebaseConfig | null = null;

function parseServiceAccount(value: string) {
  let parsed: unknown = JSON.parse(value);
  for (let attempt = 0; attempt < 2 && typeof parsed === 'string'; attempt += 1) {
    parsed = JSON.parse(parsed);
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('Firebase service-account value is not a JSON object');
  return parsed as { client_email?: string; private_key?: string; project_id?: string };
}

function normalizePkcs8(value: string): string {
  let key = String(value || '').trim();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (!(key.startsWith('"') && key.endsWith('"'))) break;
    try {
      const decoded = JSON.parse(key);
      if (typeof decoded !== 'string') break;
      key = decoded.trim();
    } catch {
      break;
    }
  }

  key = key.replace(/\r\n?/g, '\n');
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const decoded = key.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\\r/g, '\n');
    if (decoded === key) break;
    key = decoded;
  }
  key = key.replace(/\\+\n/g, '\n');

  const begin = '-----BEGIN PRIVATE KEY-----';
  const end = '-----END PRIVATE KEY-----';
  const beginIndex = key.indexOf(begin);
  const endIndex = key.indexOf(end, beginIndex + begin.length);
  if (beginIndex < 0 || endIndex < 0) throw new Error('Firebase private key header or footer is missing');

  const body = key.slice(beginIndex + begin.length, endIndex).replace(/[^A-Za-z0-9+/=]/g, '');
  if (body.length < 256) throw new Error('Firebase private key body is incomplete');
  try {
    atob(body);
  } catch {
    throw new Error('Firebase private key body is not valid base64');
  }

  const lines = body.match(/.{1,64}/g);
  if (!lines?.length) throw new Error('Firebase private key body is empty');
  return `${begin}\n${lines.join('\n')}\n${end}`;
}

function firebaseConfig(): FirebaseConfig {
  if (cachedFirebaseConfig) return cachedFirebaseConfig;

  let clientEmail = Deno.env.get('FIREBASE_CLIENT_EMAIL') || '';
  let privateKey = Deno.env.get('FIREBASE_PRIVATE_KEY') || '';
  let projectId = Deno.env.get('FIREBASE_PROJECT_ID') || '';
  const serviceAccountJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON');

  if (serviceAccountJson) {
    try {
      const serviceAccount = parseServiceAccount(serviceAccountJson);
      clientEmail ||= serviceAccount.client_email || '';
      privateKey ||= serviceAccount.private_key || '';
      projectId ||= serviceAccount.project_id || '';
    } catch (error) {
      throw new Error(`FIREBASE_SERVICE_ACCOUNT_JSON is invalid: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!clientEmail || !privateKey || !projectId) {
    throw new Error('Firebase service-account secrets are not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, and FIREBASE_PROJECT_ID.');
  }

  cachedFirebaseConfig = { clientEmail, privateKey: normalizePkcs8(privateKey), projectId };
  return cachedFirebaseConfig;
}

let cachedToken: { token: string; expiresAt: number } | null = null;
async function googleAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  const config = firebaseConfig();
  const privateKey = await importPKCS8(config.privateKey, 'RS256');
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/firebase.messaging' })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(config.clientEmail)
    .setSubject(config.clientEmail)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey);
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  const payload = await response.json() as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!response.ok || !payload.access_token) throw new Error(payload.error_description || payload.error || 'Unable to authenticate Firebase');
  cachedToken = { token: payload.access_token, expiresAt: Date.now() + Number(payload.expires_in || 3600) * 1000 };
  return cachedToken.token;
}

export type PushMessage = {
  title: string; body: string; channel?: 'order' | 'rider' | 'promo' | 'reminder';
  data?: Record<string, string>; token: string;
};

export async function sendFcm(message: PushMessage) {
  const config = firebaseConfig();
  const accessToken = await googleAccessToken();
  const channelId = message.channel === 'rider' ? 'rider_updates' : message.channel === 'promo' ? 'marketing_promos' : message.channel === 'reminder' ? 'booking_reminders' : 'order_updates';
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${config.projectId}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: {
      token: message.token,
      notification: { title: message.title, body: message.body },
      data: { channel: message.channel || 'order', ...(message.data || {}) },
      android: { priority: message.channel === 'rider' ? 'high' : 'normal', notification: { channel_id: channelId, sound: 'default', default_vibrate_timings: true } },
    }}),
  });
  const payload = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, payload };
}

export async function sendMany(messages: PushMessage[]) {
  const results = [];
  for (const message of messages) results.push({ token: message.token, ...(await sendFcm(message)) });
  return results;
}
