import { corsHeaders, json, requireStaff, serviceClient, sendMany } from '../_shared/common.ts';

type Recipient = { token: string; user_id?: string | null; area?: string | null; source: 'account' | 'installation' | 'phone' | 'booking' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { user } = await requireStaff(req, true);
    const input = await req.json();
    const title = String(input.title || '').trim().slice(0, 80);
    const body = String(input.body || input.message || '').trim().slice(0, 1000);
    const area = ['all', 'mplace', 'cubao', 'outside'].includes(input.area) ? input.area : 'all';
    if (!title || !body) return json({ error: 'Title and message are required' }, 400);

    const db = serviceClient();
    const recipients: Recipient[] = [];

    let accountQuery = db.from('device_push_tokens').select('token,user_id,area').eq('app_role', 'customer').eq('active', true);
    if (area !== 'all') accountQuery = accountQuery.eq('area', area);
    const { data: accountTokens, error: accountError } = await accountQuery;
    if (accountError) throw accountError;

    const userIds = [...new Set((accountTokens || []).map((row: any) => row.user_id).filter(Boolean))];
    const { data: preferences, error: preferenceError } = userIds.length
      ? await db.from('notification_preferences').select('user_id,marketing').in('user_id', userIds)
      : { data: [], error: null } as any;
    if (preferenceError) throw preferenceError;
    const blockedUsers = new Set((preferences || []).filter((row: any) => row.marketing === false).map((row: any) => row.user_id));
    for (const row of accountTokens || []) {
      if (row.token && !blockedUsers.has(row.user_id)) recipients.push({ token: row.token, user_id: row.user_id, area: row.area, source: 'account' });
    }

    let installationQuery = db.from('customer_installations').select('fcm_token,area').eq('enabled', true);
    if (area !== 'all') installationQuery = installationQuery.eq('area', area);
    const { data: installations, error: installationError } = await installationQuery;
    if (installationError) throw installationError;
    for (const row of installations || []) {
      if (row.fcm_token) recipients.push({ token: row.fcm_token, area: row.area, source: 'installation' });
    }

    let phoneQuery = db.from('customer_phone_devices').select('fcm_token,area').eq('enabled', true);
    if (area !== 'all') phoneQuery = phoneQuery.eq('area', area);
    const { data: phoneTokens, error: phoneError } = await phoneQuery;
    if (phoneError && phoneError.code !== '42P01') throw phoneError;
    for (const row of phoneTokens || []) {
      if (row.fcm_token) recipients.push({ token: row.fcm_token, area: row.area, source: 'phone' });
    }

    let bookingQuery = db.from('customer_device_tokens').select('fcm_token,area').eq('enabled', true);
    if (area !== 'all') bookingQuery = bookingQuery.eq('area', area);
    const { data: bookingTokens, error: bookingError } = await bookingQuery;
    if (bookingError) throw bookingError;
    for (const row of bookingTokens || []) {
      if (row.fcm_token) recipients.push({ token: row.fcm_token, area: row.area, source: 'booking' });
    }

    const unique = new Map<string, Recipient>();
    for (const recipient of recipients) unique.set(recipient.token, recipient);
    const dedupeKey = `marketing:${crypto.randomUUID()}`;
    const messages = [...unique.values()].map((recipient) => ({
      token: recipient.token,
      title,
      body,
      channel: 'promo' as const,
      data: { kind: 'marketing_broadcast', notification_type: 'marketing', area, dedupe_key: dedupeKey },
    }));

    const results = await sendMany(messages);
    const invalid = results.filter((result: any) => !result.ok && [404, 410].includes(result.status)).map((result: any) => result.token);
    if (invalid.length) {
      await Promise.all([
        db.from('device_push_tokens').update({ active: false }).in('token', invalid),
        db.from('customer_installations').update({ enabled: false }).in('fcm_token', invalid),
        db.from('customer_phone_devices').update({ enabled: false }).in('fcm_token', invalid),
        db.from('customer_device_tokens').update({ enabled: false }).in('fcm_token', invalid),
      ]);
    }

    const delivered = results.filter((result: any) => result.ok).length;
    await db.from('marketing_campaigns').insert({ title, body, target_area: area, sent_by: user.id, sent_at: new Date().toISOString(), recipient_count: delivered });
    return json({
      ok: true,
      attempted: messages.length,
      delivered,
      failed: messages.length - delivered,
      sources: {
        account: [...unique.values()].filter((row) => row.source === 'account').length,
        guest_installation: [...unique.values()].filter((row) => row.source === 'installation').length,
        phone_history: [...unique.values()].filter((row) => row.source === 'phone').length,
        guest_booking: [...unique.values()].filter((row) => row.source === 'booking').length,
      },
    });
  } catch (error) {
    return json({ error: String((error as any)?.message || error) }, 400);
  }
});
