import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendFcm } from '../_shared/fcm.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Triggered by public.broadcast_marketing(...) (admin-only RPC, gated on
// is_bubblyfi_admin()) via pg_net, passing only a campaign_id — this
// function trusts the request came from the database trigger, same as the
// other pg_net-triggered functions in this project. Targets the real
// device_push_tokens/notification_preferences tables (marketing_campaigns
// pre-existed as a log table with no send mechanism until this migration).
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { campaign_id } = await req.json();
    if (!campaign_id) throw new Error('campaign_id is required');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const { data: campaign, error: campaignError } = await admin
      .from('marketing_campaigns')
      .select('id,title,body,target_area,sent_at')
      .eq('id', campaign_id)
      .single();
    if (campaignError || !campaign) throw new Error('Campaign not found');
    if (campaign.sent_at) {
      return new Response(JSON.stringify({ ok: true, message: 'Already sent.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let query = admin
      .from('device_push_tokens')
      .select('token, notification_preferences!inner(marketing)')
      .eq('app_role', 'customer')
      .eq('active', true)
      .eq('notification_preferences.marketing', true);
    if (campaign.target_area && campaign.target_area !== 'all') {
      query = query.eq('area', campaign.target_area);
    }
    const { data: devices, error } = await query;
    if (error) throw error;

    let sent = 0;
    const errors: string[] = [];
    for (const device of devices ?? []) {
      const result = await sendFcm(device.token, campaign.title, campaign.body, { kind: 'marketing', campaign_id });
      if (result.sent) sent += 1;
      else if (result.error) errors.push(result.error);
    }

    await admin.from('marketing_campaigns').update({ sent_at: new Date().toISOString() }).eq('id', campaign_id);

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
