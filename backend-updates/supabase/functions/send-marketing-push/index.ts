import { corsHeaders, json, requireStaff, serviceClient, sendMany } from '../_shared/common.ts';
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { user } = await requireStaff(req, true);
    const input = await req.json();
    const title = String(input.title || '').trim().slice(0,80);
    const body = String(input.body || '').trim().slice(0,1000);
    const area = ['all','mplace','cubao','outside'].includes(input.area) ? input.area : 'all';
    if (!title || !body) return json({ error: 'Title and message are required' }, 400);
    const db = serviceClient();
    let query = db.from('device_push_tokens').select('token,user_id,area').eq('app_role','customer').eq('active',true);
    if (area !== 'all') query = query.eq('area', area);
    const { data: tokens, error } = await query;
    if (error) throw error;
    const userIds = [...new Set((tokens || []).map((x:any)=>x.user_id))];
    const { data: preferences } = userIds.length ? await db.from('notification_preferences').select('user_id,marketing').in('user_id', userIds) : { data: [] } as any;
    const allowed = new Set((preferences || []).filter((x:any)=>x.marketing !== false).map((x:any)=>x.user_id));
    const messages = (tokens || []).filter((x:any)=>allowed.has(x.user_id)).map((x:any)=>({ token:x.token,title,body,channel:'promo' as const,data:{area} }));
    const results = await sendMany(messages);
    await db.from('marketing_campaigns').insert({ title, body, target_area:area, sent_by:user.id, sent_at:new Date().toISOString(), recipient_count:results.filter((x:any)=>x.ok).length });
    return json({ ok:true, attempted:messages.length, delivered:results.filter((x:any)=>x.ok).length });
  } catch (error) { return json({ error:String(error?.message || error) }, 400); }
});
