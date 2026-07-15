import { corsHeaders, json, requireStaff, serviceClient, sendMany } from '../_shared/common.ts';
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
    if (input.order_id) ({ data: order } = await db.from('orders').select('id,receipt_no,customer_user_id,customer_id,customers(name)').eq('id', input.order_id).maybeSingle());
    if (input.request_id) ({ data: request } = await db.from('customer_order_requests').select('id,request_no,user_id,customer_name,place').eq('id', input.request_id).maybeSingle());
    let customerUserId = request?.user_id || order?.customer_user_id || null;
    if (!customerUserId && order?.customer_id) {
      const { data: customer } = await db.from('customers').select('user_id').eq('id', order.customer_id).maybeSingle();
      customerUserId = customer?.user_id || null;
    }
    const urgent = status.toLowerCase().includes('approaching');
    const reference = request?.request_no || order?.receipt_no || 'your booking';
    const title = urgent ? 'Your rider is approaching' : 'Bubbly-fi order update';
    const body = urgent ? `The rider is approaching your pickup or delivery point for ${reference}. Please be ready at the lobby.` : `${reference} is now: ${status}.`;
    const messages: any[] = [];
    if (customerUserId) {
      const { data: customerTokens } = await db.from('device_push_tokens').select('token').eq('user_id', customerUserId).eq('app_role','customer').eq('active',true);
      for (const row of customerTokens || []) messages.push({ token: row.token, title, body, channel: urgent ? 'rider' : 'order', data: { status, order_id: order?.id || '', request_id: request?.id || '' } });
    }
    const { data: staffTokens } = await db.from('device_push_tokens').select('token').eq('app_role','operations').eq('active',true);
    for (const row of staffTokens || []) messages.push({ token: row.token, title: 'Order status updated', body: `${reference}: ${status}`, channel: urgent ? 'rider' : 'order', data: { status, order_id: order?.id || '', request_id: request?.id || '' } });
    await db.from('order_status_events').insert({ order_id: order?.id || null, customer_request_id: request?.id || null, status, changed_by: user.id });
    const results = await sendMany(messages);
    const invalid = results.filter((x:any) => !x.ok && [404,410].includes(x.status)).map((x:any)=>x.token);
    if (invalid.length) await db.from('device_push_tokens').update({ active:false }).in('token', invalid);
    return json({ ok: true, attempted: messages.length, delivered: results.filter((x:any)=>x.ok).length });
  } catch (error) { return json({ error: String(error?.message || error) }, 400); }
});
