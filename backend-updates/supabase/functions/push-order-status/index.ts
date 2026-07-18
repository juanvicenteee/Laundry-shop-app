import { corsHeaders, json, requireStaff, serviceClient, sendMany } from '../_shared/common.ts';

type TokenRow = { token: string; source: 'account' | 'booking' };

function isRiderStatus(status: string): boolean {
  const value = status.toLowerCase();
  return ['approach', 'nearby', 'near ', 'on the way', 'coming', 'out for delivery', 'rider'].some((marker) => value.includes(marker));
}

async function customerTokens(db: ReturnType<typeof serviceClient>, userId: string | null, requestId: string | null): Promise<TokenRow[]> {
  const rows: TokenRow[] = [];
  if (userId) {
    const { data, error } = await db.from('device_push_tokens').select('token').eq('user_id', userId).eq('app_role', 'customer').eq('active', true);
    if (error) throw error;
    for (const row of data || []) if (row.token) rows.push({ token: row.token, source: 'account' });
  }
  if (requestId) {
    const { data, error } = await db.from('customer_device_tokens').select('fcm_token').eq('request_id', requestId).eq('enabled', true);
    if (error) throw error;
    for (const row of data || []) if (row.fcm_token) rows.push({ token: row.fcm_token, source: 'booking' });
  }
  return [...new Map(rows.map((row) => [row.token, row])).values()];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { user } = await requireStaff(req);
    const input = await req.json();
    const status = String(input.status || '').trim().slice(0, 80);
    if (!status) return json({ error: 'Status is required' }, 400);

    const db = serviceClient();
    let order: any = null;
    let request: any = null;
    if (input.order_id) {
      const result = await db.from('orders').select('id,receipt_no,customer_user_id,customer_id,source_request_id,customers(name)').eq('id', input.order_id).maybeSingle();
      if (result.error) throw result.error;
      order = result.data;
    }
    if (input.request_id) {
      const result = await db.from('customer_order_requests').select('id,request_no,user_id,customer_name,place').eq('id', input.request_id).maybeSingle();
      if (result.error) throw result.error;
      request = result.data;
    }

    let requestId: string | null = request?.id || order?.source_request_id || null;
    if (!requestId && order?.id) {
      const { data: linked } = await db.from('customer_order_requests').select('id,request_no,user_id,customer_name,place').eq('converted_order_id', order.id).maybeSingle();
      request = request || linked;
      requestId = linked?.id || null;
    }

    let customerUserId = request?.user_id || order?.customer_user_id || null;
    if (!customerUserId && order?.customer_id) {
      const { data: customer } = await db.from('customers').select('user_id').eq('id', order.customer_id).maybeSingle();
      customerUserId = customer?.user_id || null;
    }

    const rider = isRiderStatus(status);
    const reference = request?.request_no || order?.receipt_no || 'your booking';
    const title = rider ? 'Your delivery staff is on the way' : 'Bubbly-fi order update';
    const body = rider
      ? status.toLowerCase().includes('near') || status.toLowerCase().includes('approach')
        ? `The delivery staff is near your pickup or delivery point for ${reference}. Please be ready.`
        : `The delivery staff is coming for ${reference}. Please be ready.`
      : `${reference} is now: ${status}.`;

    const tokens = await customerTokens(db, customerUserId, requestId);
    const dedupeKey = String(input.dedupe_key || `${requestId || order?.id || 'order'}:${status.toLowerCase()}`);
    const messages: any[] = tokens.map((row) => ({
      token: row.token,
      title,
      body,
      channel: rider ? 'rider' as const : 'order' as const,
      data: {
        kind: rider ? 'rider_approaching' : 'order_status',
        notification_type: rider ? 'rider' : 'order_status',
        status,
        order_id: order?.id || '',
        request_id: requestId || '',
        request_no: request?.request_no || '',
        dedupe_key: dedupeKey,
      },
    }));

    const { data: staffTokens, error: staffError } = await db.from('device_push_tokens').select('token').eq('app_role', 'operations').eq('active', true);
    if (staffError) throw staffError;
    for (const row of staffTokens || []) {
      messages.push({
        token: row.token,
        title: 'Order status updated',
        body: `${reference}: ${status}`,
        channel: rider ? 'rider' as const : 'order' as const,
        data: {
          kind: rider ? 'rider_approaching' : 'order_status',
          notification_type: rider ? 'rider' : 'order_status',
          status,
          order_id: order?.id || '',
          request_id: requestId || '',
          request_no: request?.request_no || '',
          dedupe_key: `staff:${dedupeKey}`,
        },
      });
    }

    await db.from('order_status_events').insert({ order_id: order?.id || null, customer_request_id: requestId, status, changed_by: user.id });
    const results = await sendMany(messages);
    const invalid = results.filter((result: any) => !result.ok && [404, 410].includes(result.status)).map((result: any) => result.token);
    if (invalid.length) {
      await Promise.all([
        db.from('device_push_tokens').update({ active: false }).in('token', invalid),
        db.from('customer_device_tokens').update({ enabled: false }).in('fcm_token', invalid),
      ]);
    }
    return json({ ok: true, customer_devices: tokens.length, attempted: messages.length, delivered: results.filter((result: any) => result.ok).length, rider_notification: rider });
  } catch (error) {
    return json({ error: String((error as any)?.message || error) }, 400);
  }
});
