const BASE = 'https://api.tokenfactory.nebius.com/v1';
const MODEL = process.env.NEBIUS_MODEL || 'nvidia/Nemotron-3.5-Super-VL';
let verifiedAt = null;
export function aiStatus() { return { configured: Boolean(process.env.NEBIUS_API_KEY), model: MODEL, provider: 'Nebius Token Factory', verified: Boolean(verifiedAt), verifiedAt }; }
export async function interpret(message) {
  if (!process.env.NEBIUS_API_KEY) throw Object.assign(new Error('Nebius is not connected. You can use the editable demo request.'),{status:503});
  const start=Date.now();
  const response = await fetch(`${BASE}/chat/completions`, { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${process.env.NEBIUS_API_KEY}`}, signal:AbortSignal.timeout(35000), body:JSON.stringify({ model:MODEL, temperature:0, max_tokens:500, response_format:{type:'json_object'}, messages:[{role:'system',content:'Extract the guest request as a JSON object with requested_time (HH:MM 24h or null), breakfast_portions (integer or null), room_count (integer or null), guest_count (integer or null). Do not infer missing facts. Do not decide availability, pricing, permissions or execute actions. Return JSON only.'},{role:'user',content:String(message).slice(0,1000)}] }) });
  if (!response.ok) throw Object.assign(new Error(`Nebius returned HTTP ${response.status}. No reservation was changed.`),{status:502});
  const data=await response.json();
  let parsed; try { parsed=JSON.parse(data.choices?.[0]?.message?.content || ''); } catch { throw Object.assign(new Error('The model did not return valid request details. Review manually.'),{status:502}); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Object.assign(new Error('The model returned an invalid request. Review manually.'),{status:502});
  const requested = /^([01]\d|2[0-3]):[0-5]\d$/.test(parsed.requested_time || '') ? parsed.requested_time : null;
  const asCount=x=>Number.isInteger(x)&&x>=0&&x<=100 ? x : null;
  verifiedAt = new Date().toISOString();
  return {requestedTime:requested, breakfast:asCount(parsed.breakfast_portions), rooms:asCount(parsed.room_count), guests:asCount(parsed.guest_count), model:MODEL, provider:'Nebius Token Factory', latencyMs:Date.now()-start, usage:data.usage || null};
}
