import { corsHeaders, json, requireUser, serviceClient } from '../_shared/common.ts';
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const user = await requireUser(req);
    const body = await req.json();
    const token = String(body.token || '').trim();
    const appRole = body.app_role === 'operations' ? 'operations' : 'customer';
    const area = ['mplace','cubao','outside'].includes(body.area) ? body.area : null;
    if (token.length < 40 || token.length > 4096) return json({ error: 'Invalid push token' }, 400);
    const db = serviceClient();
    const { error } = await db.from('device_push_tokens').upsert({ user_id: user.id, token, app_role: appRole, area, active: true, last_seen_at: new Date().toISOString() }, { onConflict: 'token' });
    if (error) throw error;
    return json({ ok: true });
  } catch (error) { return json({ error: String(error?.message || error) }, 401); }
});
