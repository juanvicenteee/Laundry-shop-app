import { corsHeaders, json, serviceClient, sendMany } from '../_shared/common.ts';
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const expected = Deno.env.get('CRON_SECRET');
    if (expected && req.headers.get('x-cron-secret') !== expected) return json({ error:'Unauthorized' }, 401);
    const db = serviceClient();
    const settings = await db.from('mobile_app_settings').select('abandoned_cart_minutes').eq('id',1).single();
    const minutes = Number(settings.data?.abandoned_cart_minutes || 30);
    const cutoff = new Date(Date.now() - minutes * 60_000).toISOString();
    const { data: carts, error } = await db.from('booking_carts').select('id,user_id,cart_key,area').eq('status','active').is('reminder_sent_at',null).lte('updated_at',cutoff).limit(500);
    if (error) throw error;
    const messages:any[]=[];
    for (const cart of carts || []) {
      const { data: prefs } = await db.from('notification_preferences').select('order_updates').eq('user_id',cart.user_id).maybeSingle();
      if (prefs?.order_updates === false) continue;
      const { data: tokens } = await db.from('device_push_tokens').select('token').eq('user_id',cart.user_id).eq('app_role','customer').eq('active',true);
      for (const token of tokens || []) messages.push({token:token.token,title:'Bubbly-fi Laundry',body:'Your laundry basket is full! Complete your booking now.',channel:'reminder' as const,data:{cart_key:cart.cart_key}});
    }
    const results=await sendMany(messages);
    if ((carts||[]).length) await db.from('booking_carts').update({reminder_sent_at:new Date().toISOString()}).in('id',(carts||[]).map((x:any)=>x.id));
    return json({ok:true,carts:(carts||[]).length,attempted:messages.length,delivered:results.filter((x:any)=>x.ok).length});
  } catch(error){return json({error:String(error?.message||error)},400);}
});
