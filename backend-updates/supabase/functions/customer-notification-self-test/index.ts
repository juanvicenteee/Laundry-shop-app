import { corsHeaders, json, sendFcm, serviceClient } from '../_shared/common.ts';

const recentTests = new Map<string, number>();
const TEST_INTERVAL_MS = 60_000;

function maskToken(token: string): string {
  return token.length >= 12 ? `${token.slice(0, 6)}…${token.slice(-6)}` : 'invalid';
}

async function registeredSources(token: string): Promise<string[]> {
  const db = serviceClient();
  const sources: string[] = [];

  const [installation, phone, booking] = await Promise.all([
    db.from('customer_installations').select('fcm_token').eq('fcm_token', token).eq('enabled', true).limit(1),
    db.from('customer_phone_devices').select('fcm_token').eq('fcm_token', token).eq('enabled', true).limit(1),
    db.from('customer_device_tokens').select('fcm_token').eq('fcm_token', token).eq('enabled', true).limit(1),
  ]);

  if (installation.error) throw installation.error;
  if (phone.error && phone.error.code !== '42P01') throw phone.error;
  if (booking.error) throw booking.error;
  if (installation.data?.length) sources.push('installation');
  if (phone.data?.length) sources.push('phone');
  if (booking.data?.length) sources.push('booking');
  return sources;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'POST required' }, 405);

  try {
    const input = await req.json().catch(() => ({}));
    const token = String(input.fcm_token || input.token || '').trim();
    if (token.length < 40 || token.length > 4096) return json({ ok: false, error: 'A valid device token is required' }, 400);

    const sources = await registeredSources(token);
    if (!sources.length) return json({ ok: false, error: 'This device token is not registered for Bubbly-fi Customer notifications' }, 404);

    const now = Date.now();
    const lastTest = recentTests.get(token) || 0;
    const retryAfter = TEST_INTERVAL_MS - (now - lastTest);
    if (retryAfter > 0) return json({ ok: false, error: 'Wait before sending another test', retry_after_seconds: Math.ceil(retryAfter / 1000) }, 429);
    recentTests.set(token, now);

    const result = await sendFcm({
      token,
      title: 'Bubbly-fi notification test',
      body: 'This phone is connected to Bubbly-fi notifications.',
      channel: 'promo',
      data: {
        kind: 'notification_self_test',
        notification_type: 'marketing',
        channel: 'promo',
        dedupe_key: `self-test:${crypto.randomUUID()}`,
      },
    });

    if (!result.ok) {
      recentTests.delete(token);
      const errorCode = String((result.payload as any)?.error?.details?.[0]?.errorCode || (result.payload as any)?.error?.status || '');
      return json({ ok: false, error: 'Firebase rejected this device token', fcm_status: result.status, error_code: errorCode, token: maskToken(token), sources }, 502);
    }

    return json({ ok: true, accepted: true, fcm_status: result.status, token: maskToken(token), sources });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
