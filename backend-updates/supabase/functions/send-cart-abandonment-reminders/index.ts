import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendFcm } from '../_shared/fcm.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Called every 5 minutes by the pg_cron job scheduled in
// migrate-mobile-app-v6-cart-recovery.sql. Finds booking_drafts older than
// 30 minutes with no reminder sent yet, and no matching completed booking,
// then sends the abandoned-cart push.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: drafts, error } = await admin
      .from('booking_drafts')
      .select('id,fcm_token')
      .is('reminded_at', null)
      .lt('updated_at', cutoff);
    if (error) throw error;

    let sent = 0;
    const errors: string[] = [];

    for (const draft of drafts ?? []) {
      const result = await sendFcm(
        draft.fcm_token,
        'Bubbly-fi',
        'Your laundry basket is full! Complete your booking now.',
        { kind: 'cart_abandonment' }
      );
      if (result.sent) {
        sent += 1;
        await admin.from('booking_drafts').update({ reminded_at: new Date().toISOString() }).eq('id', draft.id);
      } else if (result.error) {
        errors.push(result.error);
      }
    }

    return new Response(JSON.stringify({ ok: true, checked: drafts?.length ?? 0, sent, errors }), {
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
