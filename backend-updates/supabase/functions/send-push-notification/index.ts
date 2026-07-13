import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sendExpoPush(tokens: string[], title: string, body: string, data: Record<string, unknown>) {
  if (!tokens.length) return { sent: 0 };

  const messages = tokens.map((to) => ({ to, sound: 'default', title, body, data, priority: 'high' }));
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Expo push ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { request_id } = await req.json();
    if (!request_id) throw new Error('request_id is required');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: request, error } = await admin
      .from('customer_order_requests')
      .select('id,request_no,customer_name,place,total,push_sent_at')
      .eq('id', request_id)
      .single();
    if (error || !request) throw new Error('Request not found');

    if (request.push_sent_at) {
      return new Response(JSON.stringify({ ok: true, message: 'Already notified.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: tokenRows, error: tokenError } = await admin
      .from('push_tokens')
      .select('expo_push_token');
    if (tokenError) throw tokenError;

    const tokens = (tokenRows ?? []).map((row) => row.expo_push_token).filter(Boolean);

    const placeNames: Record<string, string> = { cubao: 'Cubao', mplace: 'MPlace', outside: 'Outside Cubao' };
    const amount = new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      maximumFractionDigits: 0,
    }).format(Number(request.total || 0));
    const title = `New booking ${request.request_no}`;
    const body = `${request.customer_name} - ${placeNames[request.place] || request.place} - ${amount}`;

    let pushResult: unknown = null;
    let pushError: string | null = null;
    try {
      pushResult = await sendExpoPush(tokens, title, body, { request_id: request.id });
    } catch (err) {
      console.error('Push send failed', err);
      pushError = err instanceof Error ? err.message : String(err);
    }

    if (!pushError) {
      await admin
        .from('customer_order_requests')
        .update({ push_sent_at: new Date().toISOString() })
        .eq('id', request.id);
    }

    return new Response(JSON.stringify({ ok: true, tokenCount: tokens.length, pushResult, pushError }), {
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
