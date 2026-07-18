import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendFcm } from '../_shared/fcm.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const placeNames: Record<string, string> = { cubao: 'Cubao', mplace: 'MPlace', outside: 'Outside Cubao' };
const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 });

function adminClient() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function sendExpoPush(tokens: string[], title: string, body: string, data: Record<string, unknown>) {
  if (!tokens.length) return { sent: 0 };
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(tokens.map((to) => ({ to, sound: 'default', title, body, data, priority: 'high' }))),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Expo push ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}

async function handleNewRequestBroadcast(admin: ReturnType<typeof adminClient>, requestId: string) {
  const { data: request, error } = await admin.from('customer_order_requests').select('id,request_no,customer_name,place,total,push_sent_at').eq('id', requestId).single();
  if (error || !request) throw new Error('Request not found');
  if (request.push_sent_at) return { ok: true, message: 'Already notified.' };
  const { data: tokenRows, error: tokenError } = await admin.from('push_tokens').select('expo_push_token,fcm_token');
  if (tokenError) throw tokenError;
  const expoTokens = (tokenRows ?? []).map((row) => row.expo_push_token).filter(Boolean) as string[];
  const fcmTokens = (tokenRows ?? []).map((row) => row.fcm_token).filter(Boolean) as string[];
  const title = `New booking ${request.request_no}`;
  const body = `${request.customer_name} - ${placeNames[request.place] || request.place} - ${peso.format(Number(request.total || 0))}`;
  const data = { request_id: request.id, kind: 'new_request', channel: 'order' };
  let pushError: string | null = null;
  try {
    if (expoTokens.length) await sendExpoPush(expoTokens, title, body, data);
    for (const token of fcmTokens) {
      const result = await sendFcm(token, title, body, data);
      if (!result.sent && result.error) pushError = result.error;
    }
  } catch (error) { pushError = error instanceof Error ? error.message : String(error); }
  if (!pushError) await admin.from('customer_order_requests').update({ push_sent_at: new Date().toISOString() }).eq('id', request.id);
  return { ok: true, expoCount: expoTokens.length, fcmCount: fcmTokens.length, pushError };
}

type CustomerToken = { token: string; source: 'account' | 'booking' };

async function customerTokens(admin: ReturnType<typeof adminClient>, userId: string | null, requestId: string | null): Promise<CustomerToken[]> {
  const rows: CustomerToken[] = [];
  if (userId) {
    const { data, error } = await admin.from('device_push_tokens').select('token').eq('user_id', userId).eq('app_role', 'customer').eq('active', true);
    if (error) throw error;
    for (const row of data ?? []) if (row.token) rows.push({ token: row.token, source: 'account' });
  }
  if (requestId) {
    const { data, error } = await admin.from('customer_device_tokens').select('fcm_token').eq('request_id', requestId).eq('enabled', true);
    if (error) throw error;
    for (const row of data ?? []) if (row.fcm_token) rows.push({ token: row.fcm_token, source: 'booking' });
  }
  return [...new Map(rows.map((row) => [row.token, row])).values()];
}

async function sendToTokens(tokens: CustomerToken[], title: string, body: string, data: Record<string, unknown>) {
  const errors: string[] = [];
  let sent = 0;
  for (const row of tokens) {
    const result = await sendFcm(row.token, title, body, data);
    if (result.sent) sent += 1;
    else if (result.error) errors.push(result.error);
  }
  return { sent, errors };
}

function statusMessage(status: string): string {
  const messages: Record<string, string> = {
    pending: 'Your booking was received and is waiting for confirmation.', received: 'Your laundry order was received by Bubbly-fi.',
    confirmed: 'Your booking has been confirmed.', scheduled: 'Your pickup schedule has been confirmed.',
    'for pickup': 'Your laundry is scheduled for pickup.', 'rider assigned': 'A delivery staff member has been assigned to your order.',
    'picked up': 'Your laundry has been picked up.', 'pickup complete': 'Your laundry has arrived at the shop.',
    washing: 'Your laundry is now being washed.', drying: 'Your laundry is in the dryer.', folding: 'Your laundry is being folded.',
    processing: 'Your laundry is being processed.', ready: 'Your laundry is ready.', 'ready for pickup': 'Your laundry is ready for pickup.',
    delivered: 'Your laundry has been delivered.', claimed: 'Your laundry has been claimed. Thank you for choosing Bubbly-fi!',
    completed: 'Your laundry order has been completed.', cancelled: 'Your laundry order was cancelled.',
    rejected: 'Your booking could not be processed. Please contact Bubbly-fi.',
  };
  return messages[status.trim().toLowerCase()] || `Your laundry order status is now ${status}.`;
}

function riderStatus(status: string): boolean {
  const value = status.toLowerCase();
  return ['approach', 'nearby', 'near ', 'on the way', 'coming', 'out for delivery', 'rider'].some((marker) => value.includes(marker));
}

async function handleRequestStatus(admin: ReturnType<typeof adminClient>, requestId: string, status: string, suppliedDedupe?: string) {
  const { data: request, error } = await admin.from('customer_order_requests').select('id,request_no,user_id').eq('id', requestId).single();
  if (error || !request) throw new Error('Request not found');
  const tokens = await customerTokens(admin, request.user_id, request.id);
  if (!tokens.length) return { ok: true, tokenCount: 0, message: 'No registered device for this customer yet.' };
  const rider = riderStatus(status);
  const title = rider ? 'Your delivery staff is on the way' : `Booking ${request.request_no}`;
  const body = rider ? `The delivery staff is coming for ${request.request_no}. Please be ready.` : statusMessage(status);
  const delivery = await sendToTokens(tokens, title, body, {
    kind: rider ? 'rider_approaching' : 'request_status', notification_type: rider ? 'rider' : 'order_status',
    channel: rider ? 'rider' : 'order', request_id: request.id, request_no: request.request_no, status,
    dedupe_key: suppliedDedupe || `request:${request.id}:${status.toLowerCase()}`,
  });
  return { ok: true, tokenCount: tokens.length, ...delivery };
}

async function resolveOrderContext(admin: ReturnType<typeof adminClient>, orderId: string) {
  const { data: order, error } = await admin.from('orders').select('id,receipt_no,customer_user_id,customer_id,source_request_id').eq('id', orderId).single();
  if (error || !order) throw new Error('Order not found');
  let requestId: string | null = order.source_request_id || null;
  let requestNo: string | null = null;
  let requestUserId: string | null = null;
  if (requestId) {
    const { data: request } = await admin.from('customer_order_requests').select('id,request_no,user_id').eq('id', requestId).maybeSingle();
    requestNo = request?.request_no || null; requestUserId = request?.user_id || null;
  } else {
    const { data: request } = await admin.from('customer_order_requests').select('id,request_no,user_id').eq('converted_order_id', order.id).maybeSingle();
    requestId = request?.id || null; requestNo = request?.request_no || null; requestUserId = request?.user_id || null;
  }
  let userId = requestUserId || order.customer_user_id || null;
  if (!userId && order.customer_id) {
    const { data: customer } = await admin.from('customers').select('user_id').eq('id', order.customer_id).maybeSingle();
    userId = customer?.user_id || null;
  }
  return { order, requestId, requestNo, userId };
}

async function handleOrderStatus(admin: ReturnType<typeof adminClient>, orderId: string, status: string, suppliedDedupe?: string) {
  const context = await resolveOrderContext(admin, orderId);
  const tokens = await customerTokens(admin, context.userId, context.requestId);
  if (!tokens.length) return { ok: true, tokenCount: 0, message: 'No registered device for this customer yet.' };
  const rider = riderStatus(status);
  const reference = context.requestNo || context.order.receipt_no || 'your order';
  const title = rider ? 'Your delivery staff is on the way' : (context.order.receipt_no ? `Order ${context.order.receipt_no}` : 'Bubbly-fi order update');
  const body = rider
    ? status.toLowerCase().includes('near') || status.toLowerCase().includes('approach')
      ? `The delivery staff is near your pickup or delivery point for ${reference}. Please be ready.`
      : `The delivery staff is coming for ${reference}. Please be ready.`
    : statusMessage(status);
  const delivery = await sendToTokens(tokens, title, body, {
    kind: rider ? 'rider_approaching' : 'order_status', notification_type: rider ? 'rider' : 'order_status',
    channel: rider ? 'rider' : 'order', order_id: context.order.id, request_id: context.requestId || '',
    request_no: context.requestNo || '', status, dedupe_key: suppliedDedupe || `order:${context.order.id}:${status.toLowerCase()}`,
  });
  return { ok: true, tokenCount: tokens.length, ...delivery, riderNotification: rider };
}

async function handleRiderApproaching(admin: ReturnType<typeof adminClient>, orderId: string, distanceM: number | null, suppliedDedupe?: string) {
  const context = await resolveOrderContext(admin, orderId);
  const tokens = await customerTokens(admin, context.userId, context.requestId);
  if (!tokens.length) return { ok: true, tokenCount: 0, message: 'No registered device for this customer yet.' };
  const reference = context.requestNo || context.order.receipt_no || 'your order';
  const close = distanceM != null && distanceM < 500;
  const title = close ? 'Your delivery staff is nearby' : 'Your delivery staff is on the way';
  const body = close ? `The delivery staff is approaching your lobby or pickup point for ${reference}. Please be ready.` : `The delivery staff is coming for ${reference}. Please be ready.`;
  const delivery = await sendToTokens(tokens, title, body, {
    kind: 'rider_approaching', notification_type: 'rider', channel: 'rider', order_id: context.order.id,
    request_id: context.requestId || '', request_no: context.requestNo || '', distance_m: distanceM ?? '',
    status: close ? 'Nearby' : 'On the way', dedupe_key: suppliedDedupe || `rider:${context.order.id}:${Math.floor(Date.now() / 60000)}`,
  });
  return { ok: true, tokenCount: tokens.length, ...delivery, distanceM };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json();
    const admin = adminClient();
    let result: Record<string, unknown>;
    if (body.kind === 'request_status') result = await handleRequestStatus(admin, body.request_id, String(body.status || 'Updated'), body.dedupe_key);
    else if (body.kind === 'order_status') result = await handleOrderStatus(admin, body.order_id, String(body.status || 'Updated'), body.dedupe_key);
    else if (body.kind === 'rider_approaching') result = await handleRiderApproaching(admin, body.order_id, body.distance_m ?? null, body.dedupe_key);
    else if (body.request_id) result = await handleNewRequestBroadcast(admin, body.request_id);
    else throw new Error('Unrecognized push notification payload');
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
