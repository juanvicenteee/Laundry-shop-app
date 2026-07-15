import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendFcm } from '../_shared/fcm.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Triggered by public.broadcast_marketing(...) (admin-only RPC) via pg_net.
// Access control happens in that RPC (is_staff() check) — this function
// trusts the request came from the database trigger, same as the other
// pg_net-triggered functions in this project.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { area, title, body } = await req.json();
    if (!title || !body) throw new Error('title and body are required');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

    let query = admin.from('customer_devices').select('fcm_token').eq('marketing_opt_in', true);
    if (area && area !== 'all') query = query.eq('last_known_area', area);
    const { data: devices, error } = await query;
    if (error) throw error;

    let sent = 0;
    const errors: string[] = [];
    for (const device of devices ?? []) {
      const result = await sendFcm(device.fcm_token, title, body, { kind: 'marketing' });
      if (result.sent) sent += 1;
      else if (result.error) errors.push(result.error);
    }

    return new Response(JSON.stringify({ ok: true, targeted: devices?.length ?? 0, sent, errors }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
