import { json, sendFcm, serviceClient } from '../_shared/common.ts';

type Candidate = {
  token: string;
  source: 'installation' | 'phone' | 'booking';
  last_seen_at?: string | null;
};

function maskToken(token: string): string {
  if (token.length < 12) return 'invalid';
  return `${token.slice(0, 6)}…${token.slice(-6)}`;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);

  try {
    const db = serviceClient();
    const candidates: Candidate[] = [];

    const installationResult = await db
      .from('customer_installations')
      .select('fcm_token,last_seen_at')
      .eq('enabled', true)
      .order('last_seen_at', { ascending: false })
      .limit(10);
    if (installationResult.error) throw installationResult.error;
    for (const row of installationResult.data || []) {
      if (row.fcm_token) candidates.push({ token: row.fcm_token, source: 'installation', last_seen_at: row.last_seen_at });
    }

    const phoneResult = await db
      .from('customer_phone_devices')
      .select('fcm_token,last_seen_at')
      .eq('enabled', true)
      .order('last_seen_at', { ascending: false })
      .limit(10);
    if (phoneResult.error && phoneResult.error.code !== '42P01') throw phoneResult.error;
    for (const row of phoneResult.data || []) {
      if (row.fcm_token) candidates.push({ token: row.fcm_token, source: 'phone', last_seen_at: row.last_seen_at });
    }

    const bookingResult = await db
      .from('customer_device_tokens')
      .select('fcm_token,last_seen_at')
      .eq('enabled', true)
      .order('last_seen_at', { ascending: false })
      .limit(10);
    if (bookingResult.error) throw bookingResult.error;
    for (const row of bookingResult.data || []) {
      if (row.fcm_token) candidates.push({ token: row.fcm_token, source: 'booking', last_seen_at: row.last_seen_at });
    }

    const unique = [...new Map(
      candidates
        .sort((a, b) => new Date(b.last_seen_at || 0).getTime() - new Date(a.last_seen_at || 0).getTime())
        .map((candidate) => [candidate.token, candidate])
    ).values()];

    if (!unique.length) return json({ ok: false, error: 'No enabled Customer FCM token is registered' }, 409);

    const attempts: Array<Record<string, unknown>> = [];
    for (const candidate of unique) {
      const result = await sendFcm({
        token: candidate.token,
        title: 'Bubbly-fi broadcast test',
        body: 'Broadcast notifications are connected.',
        channel: 'promo',
        data: {
          kind: 'marketing_broadcast',
          notification_type: 'marketing',
          area: 'all',
          dedupe_key: `broadcast-smoke:${crypto.randomUUID()}`,
        },
      });

      const errorCode = String((result.payload as any)?.error?.details?.[0]?.errorCode || (result.payload as any)?.error?.status || '');
      attempts.push({ source: candidate.source, token: maskToken(candidate.token), status: result.status, ok: result.ok, error_code: errorCode });

      if (result.ok) {
        return json({
          ok: true,
          delivered: 1,
          source: candidate.source,
          token: maskToken(candidate.token),
          fcm_status: result.status,
          attempted_tokens: attempts.length,
          candidate_count: unique.length,
        });
      }

      if ([404, 410].includes(result.status) || errorCode === 'UNREGISTERED') {
        await Promise.all([
          db.from('customer_installations').update({ enabled: false }).eq('fcm_token', candidate.token),
          db.from('customer_phone_devices').update({ enabled: false }).eq('fcm_token', candidate.token),
          db.from('customer_device_tokens').update({ enabled: false }).eq('fcm_token', candidate.token),
        ]);
      }
    }

    return json({ ok: false, error: 'FCM rejected all registered Customer tokens', attempts }, 502);
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
