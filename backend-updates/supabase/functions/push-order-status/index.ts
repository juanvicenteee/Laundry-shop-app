import { corsHeaders, json, requireStaff, serviceClient, sendMany } from '../_shared/common.ts';

type TokenRow = { token: string; source: 'account' | 'booking' };
type StatusNotice = {
  key: string;
  title: string;
  body: (reference: string) => string;
  channel: 'order' | 'rider';
  notificationType: 'order_status' | 'rider';
};

function normalize(value: unknown): string {
  return String(value || '').toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function statusNotice(status: string): StatusNotice {
  const value = normalize(status);
  if (/delivered|completed|complete|claimed|received by customer/.test(value)) {
    return { key: 'delivered', title: 'Laundry delivered', body: (reference) => `${reference} has been delivered successfully.`, channel: 'rider', notificationType: 'rider' };
  }
  if (/rider already nearby|rider nearby|delivery staff.*nearby|staff.*nearby/.test(value)) {
    return { key: 'rider_nearby', title: 'Your rider is nearby', body: (reference) => `The delivery staff for ${reference} is already nearby. Please be ready to receive your laundry.`, channel: 'rider', notificationType: 'rider' };
  }
  if (/arrived|at (the )?(address|location|lobby|door)|delivery staff.*here|rider.*here/.test(value)) {
    return { key: 'arrived', title: 'Delivery has arrived', body: (reference) => `The delivery staff has arrived for ${reference}. Please receive your laundry.`, channel: 'rider', notificationType: 'rider' };
  }
  if (/ongoing delivery|delivery ongoing|out for delivery|in transit|delivery started|on delivery|en route.*deliver/.test(value)) {
    return { key: 'ongoing_delivery', title: 'Your laundry is on the way', body: (reference) => `Delivery is ongoing for ${reference}. Please keep your phone available.`, channel: 'rider', notificationType: 'rider' };
  }
  if (/ready for delivery/.test(value)) {
    return { key: 'ready_for_delivery', title: 'Ready for delivery', body: (reference) => `${reference} is ready and waiting for delivery.`, channel: 'order', notificationType: 'order_status' };
  }
  if (/ready.*pickup|ready/.test(value)) {
    return { key: 'ready', title: 'Laundry is ready', body: (reference) => `${reference} is ready for pickup.`, channel: 'order', notificationType: 'order_status' };
  }
  if (/processing|washing|wash|drying|folding|laundry in progress/.test(value)) {
    return { key: 'processing', title: 'Laundry is being processed', body: (reference) => `${reference} is currently being washed, dried, or folded.`, channel: 'order', notificationType: 'order_status' };
  }
  if (/received at shop|arrived at shop|shop received|laundry received/.test(value)) {
    return { key: 'at_shop', title: 'Laundry received at Bubbly-fi', body: (reference) => `Bubbly-fi has received ${reference} at the shop.`, channel: 'order', notificationType: 'order_status' };
  }
  if (/picked up|collected|pickup complete/.test(value)) {
    return { key: 'picked_up', title: 'Laundry picked up', body: (reference) => `${reference} has been picked up and is being brought to Bubbly-fi.`, channel: 'rider', notificationType: 'rider' };
  }
  if (/approach|nearby|near |on the way|coming|rider assigned|staff assigned|pickup ongoing|for pickup/.test(value)) {
    return { key: 'rider', title: 'Delivery staff is on the way', body: (reference) => `The delivery staff is on the way for ${reference}. Please keep your phone available.`, channel: 'rider', notificationType: 'rider' };
  }
  if (/confirm|accepted|scheduled|received|submitted|pending/.test(value)) {
    return { key: 'confirmed', title: 'Booking received', body: (reference) => `${reference} is recorded and waiting for the next update.`, channel: 'order', notificationType: 'order_status' };
  }
  if (/cancel|reject|failed/.test(value)) {
    return { key: 'cancelled', title: 'Order cancelled', body: (reference) => `${reference} was cancelled or rejected. Contact Bubbly-fi if you need assistance.`, channel: 'order', notificationType: 'order_status' };
  }
  return { key: 'updated', title: 'Bubbly-fi order update', body: (reference) => `${reference} is now: ${status}.`, channel: 'order', notificationType: 'order_status' };
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

    const reference = request?.request_no || order?.receipt_no || 'Your booking';
    const notice = statusNotice(status);
    const tokens = await customerTokens(db, customerUserId, requestId);
    const dedupeKey = String(input.dedupe_key || `${requestId || order?.id || 'order'}:${normalize(status)}${input.force_retry ? `:${Date.now()}` : ''}`);
    const commonData = {
      kind: notice.key,
      notification_type: notice.notificationType,
      channel: notice.channel,
      delivery_stage: notice.key,
      status,
      order_id: order?.id || '',
      request_id: requestId || '',
      request_no: request?.request_no || '',
      dedupe_key: dedupeKey,
    };

    const messages: any[] = tokens.map((row) => ({
      token: row.token,
      title: notice.title,
      body: notice.body(reference),
      channel: notice.channel,
      data: commonData,
    }));

    const { data: staffTokens, error: staffError } = await db.from('device_push_tokens').select('token').eq('app_role', 'operations').eq('active', true);
    if (staffError) throw staffError;
    for (const row of staffTokens || []) {
      messages.push({
        token: row.token,
        title: 'Order status updated',
        body: `${reference}: ${status}`,
        channel: notice.channel,
        data: { ...commonData, dedupe_key: `staff:${dedupeKey}` },
      });
    }

    const eventResult = await db.from('order_status_events').insert({
      order_id: order?.id || null,
      customer_request_id: requestId,
      status,
      message: notice.body(reference),
      changed_by: user.id,
    });
    if (eventResult.error && /column.*message|schema cache/i.test(String(eventResult.error.message || eventResult.error))) {
      const fallback = await db.from('order_status_events').insert({
        order_id: order?.id || null,
        customer_request_id: requestId,
        status,
        changed_by: user.id,
      });
      if (fallback.error) throw fallback.error;
    } else if (eventResult.error) throw eventResult.error;

    const results = await sendMany(messages);
    const invalid = results.filter((result: any) => !result.ok && [404, 410].includes(result.status)).map((result: any) => result.token);
    if (invalid.length) {
      await Promise.all([
        db.from('device_push_tokens').update({ active: false }).in('token', invalid),
        db.from('customer_device_tokens').update({ enabled: false }).in('fcm_token', invalid),
      ]);
    }

    if (order?.id) {
      const deliveredCount = results.filter((result: any) => result.ok).length;
      const failures = results.filter((result: any) => !result.ok);
      await db.from('orders').update({
        last_notification_status: messages.length === 0 ? 'No customer device' : failures.length ? 'Partially failed' : 'Sent',
        last_notification_error: failures.length ? `${failures.length} of ${results.length} notification attempts failed` : null,
        last_notification_at: new Date().toISOString(),
      }).eq('id', order.id);
    }

    return json({
      ok: true,
      delivery_stage: notice.key,
      customer_devices: tokens.length,
      attempted: messages.length,
      delivered: results.filter((result: any) => result.ok).length,
      rider_notification: notice.channel === 'rider',
    });
  } catch (error) {
    return json({ error: String((error as any)?.message || error) }, 400);
  }
});
