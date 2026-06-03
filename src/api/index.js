/* Supabase + Anthropic API helpers.
 *
 * Connection config — Supabase URL + publishable (anon) key — lives in
 * Vite env vars so dev/staging/prod can point at different projects
 * without a code change. The publishable key is safe to ship in the
 * client bundle (it's the anon role, RLS-restricted to public-readable
 * tables). The .env.local file is gitignored so per-environment values
 * stay out of source control; the build embeds VITE_-prefixed values
 * into the bundle at compile time.
 *
 * Fallback: if env vars aren't set (e.g. someone clones the repo
 * without a .env file), we fall back to the original hardcoded
 * production values so the app still works in the default deploy.
 * Keeps onboarding simple for read-only dev work; pointing at a
 * different project just requires setting the env vars.
 */
const FALLBACK_URL = "https://vesnqbxswmggdfevqokt.supabase.co";
const FALLBACK_KEY = "sb_publishable_7kqbGZlL_im9kIpgFXLA-A_9CdqsyiT";

export const SUPA_URL = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_SUPABASE_URL) || FALLBACK_URL;
const SUPA_KEY = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_SUPABASE_ANON_KEY) || FALLBACK_KEY;

/* Common auth headers used by every Supabase REST call. */
function authHeaders(extra) {
  var base = { "apikey": SUPA_KEY, "Authorization": "Bearer " + SUPA_KEY };
  return extra ? Object.assign(base, extra) : base;
}

export async function supaGet(table,key,val){var col=table==="meta"?"value":"data";var r=await fetch(SUPA_URL+"/rest/v1/"+table+"?select="+col+"&"+key+"=eq."+val,{headers:authHeaders({"Accept":"application/vnd.pgrst.object+json"})});if(!r.ok)return null;try{return await r.json();}catch(e){return null;}}

/* Fetch every row of a table. Used by the per-row companies storage to
   pull all 325 company rows in one request (each row is small enough
   that the response stays well under any payload limit). Returns an
   array of {id, data} objects, or null on error. */
export async function supaGetAll(table){var col=table==="meta"?"key,value":"id,data";var r=await fetch(SUPA_URL+"/rest/v1/"+table+"?select="+col,{headers:authHeaders()});if(!r.ok)return null;try{return await r.json();}catch(e){return null;}}

/* Bulk-fetch a set of meta keys in ONE request using PostgREST's
   in.(...) filter. Returns a Map<key, {value}> for easy lookup, matching
   the shape supaGet returns (so callers can drop in by reading .value).
   Replaces the load-time pattern of firing 15+ parallel supaGet calls
   (one per key), which spiked the Supabase connection pool on every
   reload and contributed to "unhealthy project" failures when multiple
   teammates reloaded simultaneously. A single combined request keeps
   per-reload concurrent connections to ~3 (library + companies + meta).
   Returns null on transport error so the caller can fall back. */
export async function supaGetMetaMany(keys){
  if(!keys || !keys.length) return new Map();
  /* PostgREST's in.() takes a comma-separated list inside parens. URL-encode
     each key so any unusual characters can't break the filter. */
  var encoded = keys.map(function(k){ return encodeURIComponent(k); }).join(",");
  var url = SUPA_URL + "/rest/v1/meta?select=key,value&key=in.(" + encoded + ")";
  try {
    var r = await fetch(url, { headers: authHeaders() });
    if(!r.ok) return null;
    var arr = await r.json();
    var m = new Map();
    if(Array.isArray(arr)) arr.forEach(function(row){ m.set(row.key, { value: row.value }); });
    return m;
  } catch(e){ return null; }
}

/* Upsert. `obj` may be a single row OR an array of rows — PostgREST
   handles arrays as bulk upsert in a single transaction (each row's
   INSERT...ON CONFLICT is fast since the data column stays small under
   per-row storage). Same merge-duplicates resolution either way. */
export async function supaUpsert(table,obj){return fetch(SUPA_URL+"/rest/v1/"+table,{method:"POST",headers:authHeaders({"Content-Type":"application/json","Prefer":"resolution=merge-duplicates"}),body:JSON.stringify(obj)});}

/* Delete a row by primary-key match. Used to clean up the legacy
   "shared" row after migrating to per-row companies storage. */
export async function supaDelete(table,key,val){return fetch(SUPA_URL+"/rest/v1/"+table+"?"+key+"=eq."+encodeURIComponent(val),{method:"DELETE",headers:authHeaders()});}

/* Anthropic API key — stored per-browser in localStorage and NEVER
   bundled into the production JS. Reading the env var at build time
   embedded the key in the public Pages bundle (GitHub's secret
   scanning correctly blocked the deploy). Now: each user pastes
   their own key into the in-app Settings modal once; it persists
   per-browser. No secrets in any build artifact.
   ANTHROPIC_KEY is a live-binding export — apiCall reads it on each
   call so users picking up a new key don't need to reload. */
export var ANTHROPIC_KEY = "";
const ANTHROPIC_KEY_LS = "ccd:anthropicKey";
try { ANTHROPIC_KEY = localStorage.getItem(ANTHROPIC_KEY_LS) || ""; } catch (e) {}
export function setAnthropicKey(k) {
  ANTHROPIC_KEY = (k || "").trim();
  try {
    if (ANTHROPIC_KEY) localStorage.setItem(ANTHROPIC_KEY_LS, ANTHROPIC_KEY);
    else localStorage.removeItem(ANTHROPIC_KEY_LS);
  } catch (e) {}
}
export function hasAnthropicKey() { return !!ANTHROPIC_KEY; }

export async function apiCall(system,content,maxTokens){
  if(!ANTHROPIC_KEY) throw new Error("Anthropic API key not set. Open Settings (top-right ⚙) and paste your key.");
  var mt=maxTokens||1200;var blocks=typeof content==="string"?[{type:"text",text:content}]:content;
  var res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":ANTHROPIC_KEY,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:mt,system,messages:[{role:"user",content:blocks}]})});
  var data=await res.json();if(data.error)throw new Error(JSON.stringify(data.error));
  return(data.content||[]).map(function(b){return b.text||"";}).join("");
}
