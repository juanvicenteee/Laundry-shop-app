import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const placeNames: Record<string, string> = { cubao: 'Cubao', mplace: 'MPlace', outside: 'Outside Cubao' };
const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 });

// --- Expo push (kept for any device still registered via the old Expo admin-app) ---

async function sendExpoPush(tokens: string[], title: string, body: string, data: Record<string, unknown>) {
  if (!tokens.length) return { sent: 0 };
  const messages = tokens.map((to) => ({ to, sound: 'default', title, body, data, priority: 'high' }));
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Expo push ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}

// --- FCM HTTP v1 (native Kotlin apps: customer-android, operations-android) ---

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

async function sendFcm(
  token: string,
  title: string,
  body: string,
  data: Record<string, unknown> = {}
): Promise<{ sent: boolean; error?: string }> {
  const raw = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON');
  if (!raw) return { sent: false, error: 'FIREBASE_SERVICE_ACCOUNT_JSON secret is not configured yet.' };

  const serviceAccount = JSON.parse(raw);
  const accessToken = await getFcmAccessToken(serviceAccount);

  // Data-only message (no top-level `notification`): this guarantees
  // onMessageReceived() always runs on Android, even in the background, so
  // BubblyfiMessagingService can pick the sound/vibration notification
  // channel that matches the customer's saved preference.
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

function adminClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

// --- Per-kind handlers ---

async function handleNewRequestBroadcast(admin: ReturnType<typeof adminClient>, requestId: string) {
  const { data: request, error } = await admin
    .from('customer_order_requests')
    .select('id,request_no,customer_name,place,total,push_sent_at')
    .eq('id', requestId)
    .single();
  if (error || !request) throw new Error('Request not found');

  if (request.push_sent_at) {
    return { ok: true, message: 'Already notified.' };
  }

  const { data: tokenRows, error: tokenError } = await admin
    .from('push_tokens')
    .select('expo_push_token,fcm_token');
  if (tokenError) throw tokenError;

  const expoTokens = (tokenRows ?? []).map((r) => r.expo_push_token).filter(Boolean) as string[];
  const fcmTokens = (tokenRows ?? []).map((r) => r.fcm_token).filter(Boolean) as string[];

  const amount = peso.format(Number(request.total || 0));
  const title = `New booking ${request.request_no}`;
  const body = `${request.customer_name} - ${placeNames[request.place] || request.place} - ${amount}`;
  const data = { request_id: request.id };

  let pushError: string | null = null;
  try {
    if (expoTokens.length) await sendExpoPush(expoTokens, title, body, data);
    for (const token of fcmTokens) {
      const result = await sendFcm(token, title, body, data);
      if (!result.sent && result.error) pushError = result.error;
    }
  } catch (err) {
    console.error('Push send failed', err);
    pushError = err instanceof Error ? err.message : String(err);
  }

  if (!pushError) {
    await admin.from('customer_order_requests').update({ push_sent_at: new Date().toISOString() }).eq('id', request.id);
  }

  return { ok: true, expoCount: expoTokens.length, fcmCount: fcmTokens.length, pushError };
}

const requestStatusMessages: Record<string, string> = {
  Confirmed: "Your booking is confirmed! We'll see you at pickup time.",
  Scheduled: 'Your pickup has been scheduled.',
  Rejected: 'Your booking could not be processed. Please contact Bubbly-fi.',
};

async function handleRequestStatus(admin: ReturnType<typeof adminClient>, requestId: string, status: string) {
  const { data: request, error } = await admin
    .from('customer_order_requests')
    .select('id,request_no,phone')
    .eq('id', requestId)
    .single();
  if (error || !request) throw new Error('Request not found');

  const { data: device } = await admin
    .from('customer_devices')
    .select('fcm_token')
    .eq('phone', request.phone)
    .maybeSingle();
  if (!device?.fcm_token) return { ok: true, message: 'No registered device for this customer yet.' };

  const title = `Booking ${request.request_no}`;
  const body = requestStatusMessages[status] || `Your booking status is now ${status}.`;
  const result = await sendFcm(device.fcm_token, title, body, { request_id: request.id, status });
  return { ok: true, ...result };
}

const orderStatusMessages: Record<string, string> = {
  Washing: 'Your laundry is now being washed.',
  Drying: 'Your laundry is in the dryer.',
  Ready: 'Your laundry is ready for pickup/delivery!',
  Claimed: 'Your laundry has been claimed. Thank you for choosing Bubbly-fi!',
};

async function handleOrderStatus(admin: ReturnType<typeof adminClient>, orderId: string, status: string) {
  const { data: order, error } = await admin
    .from('orders')
    .select('id,receipt_no,customer_id,customers(phone)')
    .eq('id', orderId)
    .single();
  if (error || !order) throw new Error('Order not found');

  const phone = (order as unknown as { customers: { phone: string } | null }).customers?.phone;
  if (!phone) return { ok: true, message: 'No phone on file for this order.' };

  const { data: device } = await admin.from('customer_devices').select('fcm_token').eq('phone', phone).maybeSingle();
  if (!device?.fcm_token) return { ok: true, message: 'No registered device for this customer yet.' };

  const title = order.receipt_no ? `Order ${order.receipt_no}` : 'Bubbly-fi order update';
  const body = orderStatusMessages[status] || `Your order status is now ${status}.`;
  const result = await sendFcm(device.fcm_token, title, body, { order_id: order.id, status });
  return { ok: true, ...result };
}

async function handleRiderApproaching(admin: ReturnType<typeof adminClient>, orderId: string, distanceM: number | null) {
  const { data: order, error } = await admin
    .from('orders')
    .select('id,receipt_no,customer_id,customers(phone)')
    .eq('id', orderId)
    .single();
  if (error || !order) throw new Error('Order not found');

  const phone = (order as unknown as { customers: { phone: string } | null }).customers?.phone;
  if (!phone) return { ok: true, message: 'No phone on file for this order.' };

  const { data: device } = await admin.from('customer_devices').select('fcm_token').eq('phone', phone).maybeSingle();
  if (!device?.fcm_token) return { ok: true, message: 'No registered device for this customer yet.' };

  const title = 'Your rider is on the way!';
  const body =
    distanceM != null && distanceM < 500
      ? 'Your rider is approaching your lobby — please be ready!'
      : 'Your rider is on the way with your laundry.';
  const result = await sendFcm(device.fcm_token, title, body, { order_id: order.id, distance_m: distanceM ?? '' });
  return { ok: true, ...result };
}

// --- Entry point ---

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const admin = adminClient();
    let result: Record<string, unknown>;

    if (body.kind === 'request_status') {
      result = await handleRequestStatus(admin, body.request_id, body.status);
    } else if (body.kind === 'order_status') {
      result = await handleOrderStatus(admin, body.order_id, body.status);
    } else if (body.kind === 'rider_approaching') {
      result = await handleRiderApproaching(admin, body.order_id, body.distance_m ?? null);
    } else if (body.request_id) {
      // Legacy shape from the v1 insert trigger: broadcast a new-request alert to staff.
      result = await handleNewRequestBroadcast(admin, body.request_id);
    } else {
      throw new Error('Unrecognized push notification payload');
    }

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
