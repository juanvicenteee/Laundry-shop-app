import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendFcm } from '../_shared/fcm.ts';

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

// Device lookups target device_push_tokens (the real, account-scoped push
// table) rather than the retired customer_devices — devices only register
// there once signed in, matching the "push requires an account" decision
// made during the backend reconciliation.

async function customerTokensForUser(admin: ReturnType<typeof adminClient>, userId: string | null): Promise<string[]> {
  if (!userId) return [];
  const { data } = await admin
    .from('device_push_tokens')
    .select('token')
    .eq('user_id', userId)
    .eq('app_role', 'customer')
    .eq('active', true);
  return (data ?? []).map((row) => row.token).filter(Boolean);
}

async function sendToTokens(tokens: string[], title: string, body: string, data: Record<string, unknown>) {
  let pushError: string | null = null;
  for (const token of tokens) {
    const result = await sendFcm(token, title, body, data);
    if (!result.sent && result.error) pushError = result.error;
  }
  return pushError;
}

const requestStatusMessages: Record<string, string> = {
  Confirmed: "Your booking is confirmed! We'll see you at pickup time.",
  Scheduled: 'Your pickup has been scheduled.',
  Rejected: 'Your booking could not be processed. Please contact Bubbly-fi.',
};

async function handleRequestStatus(admin: ReturnType<typeof adminClient>, requestId: string, status: string) {
  const { data: request, error } = await admin
    .from('customer_order_requests')
    .select('id,request_no,user_id')
    .eq('id', requestId)
    .single();
  if (error || !request) throw new Error('Request not found');

  const tokens = await customerTokensForUser(admin, request.user_id);
  if (!tokens.length) return { ok: true, message: 'No registered device for this customer yet.' };

  const title = `Booking ${request.request_no}`;
  const body = requestStatusMessages[status] || `Your booking status is now ${status}.`;
  const pushError = await sendToTokens(tokens, title, body, { request_id: request.id, status });
  return { ok: true, tokenCount: tokens.length, pushError };
}

const orderStatusMessages: Record<string, string> = {
  Washing: 'Your laundry is now being washed.',
  Drying: 'Your laundry is in the dryer.',
  Ready: 'Your laundry is ready for pickup/delivery!',
  Claimed: 'Your laundry has been claimed. Thank you for choosing Bubbly-fi!',
};

async function resolveOrderUserId(admin: ReturnType<typeof adminClient>, order: { customer_user_id?: string | null; customer_id?: string | null }) {
  if (order.customer_user_id) return order.customer_user_id;
  if (!order.customer_id) return null;
  const { data: customer } = await admin.from('customers').select('user_id').eq('id', order.customer_id).maybeSingle();
  return customer?.user_id ?? null;
}

async function handleOrderStatus(admin: ReturnType<typeof adminClient>, orderId: string, status: string) {
  const { data: order, error } = await admin
    .from('orders')
    .select('id,receipt_no,customer_user_id,customer_id')
    .eq('id', orderId)
    .single();
  if (error || !order) throw new Error('Order not found');

  const userId = await resolveOrderUserId(admin, order);
  const tokens = await customerTokensForUser(admin, userId);
  if (!tokens.length) return { ok: true, message: 'No registered device for this customer yet.' };

  const title = order.receipt_no ? `Order ${order.receipt_no}` : 'Bubbly-fi order update';
  const body = orderStatusMessages[status] || `Your order status is now ${status}.`;
  const pushError = await sendToTokens(tokens, title, body, { order_id: order.id, status });
  return { ok: true, tokenCount: tokens.length, pushError };
}

async function handleRiderApproaching(admin: ReturnType<typeof adminClient>, orderId: string, distanceM: number | null) {
  const { data: order, error } = await admin
    .from('orders')
    .select('id,receipt_no,customer_user_id,customer_id')
    .eq('id', orderId)
    .single();
  if (error || !order) throw new Error('Order not found');

  const userId = await resolveOrderUserId(admin, order);
  const tokens = await customerTokensForUser(admin, userId);
  if (!tokens.length) return { ok: true, message: 'No registered device for this customer yet.' };

  const title = 'Your rider is on the way!';
  const body =
    distanceM != null && distanceM < 500
      ? 'Your rider is approaching your lobby — please be ready!'
      : 'Your rider is on the way with your laundry.';
  const pushError = await sendToTokens(tokens, title, body, { order_id: order.id, distance_m: distanceM ?? '' });
  return { ok: true, tokenCount: tokens.length, pushError };
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
