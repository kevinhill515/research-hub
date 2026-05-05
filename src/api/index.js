export const SUPA_URL="https://vesnqbxswmggdfevqokt.supabase.co";

export async function supaGet(table,key,val){var col=table==="meta"?"value":"data";var r=await fetch(SUPA_URL+"/rest/v1/"+table+"?select="+col+"&"+key+"=eq."+val,{headers:{"apikey":"sb_publishable_7kqbGZlL_im9kIpgFXLA-A_9CdqsyiT","Authorization":"Bearer sb_publishable_7kqbGZlL_im9kIpgFXLA-A_9CdqsyiT","Accept":"application/vnd.pgrst.object+json"}});if(!r.ok)return null;try{return await r.json();}catch(e){return null;}}

/* Fetch every row of a table. Used by the per-row companies storage to
   pull all 325 company rows in one request (each row is small enough
   that the response stays well under any payload limit). Returns an
   array of {id, data} objects, or null on error. */
export async function supaGetAll(table){var col=table==="meta"?"key,value":"id,data";var r=await fetch(SUPA_URL+"/rest/v1/"+table+"?select="+col,{headers:{"apikey":"sb_publishable_7kqbGZlL_im9kIpgFXLA-A_9CdqsyiT","Authorization":"Bearer sb_publishable_7kqbGZlL_im9kIpgFXLA-A_9CdqsyiT"}});if(!r.ok)return null;try{return await r.json();}catch(e){return null;}}

/* Upsert. `obj` may be a single row OR an array of rows — PostgREST
   handles arrays as bulk upsert in a single transaction (each row's
   INSERT...ON CONFLICT is fast since the data column stays small under
   per-row storage). Same merge-duplicates resolution either way. */
export async function supaUpsert(table,obj){return fetch(SUPA_URL+"/rest/v1/"+table,{method:"POST",headers:{"apikey":"sb_publishable_7kqbGZlL_im9kIpgFXLA-A_9CdqsyiT","Authorization":"Bearer sb_publishable_7kqbGZlL_im9kIpgFXLA-A_9CdqsyiT","Content-Type":"application/json","Prefer":"resolution=merge-duplicates"},body:JSON.stringify(obj)});}

/* Delete a row by primary-key match. Used to clean up the legacy
   "shared" row after migrating to per-row companies storage. */
export async function supaDelete(table,key,val){return fetch(SUPA_URL+"/rest/v1/"+table+"?"+key+"=eq."+encodeURIComponent(val),{method:"DELETE",headers:{"apikey":"sb_publishable_7kqbGZlL_im9kIpgFXLA-A_9CdqsyiT","Authorization":"Bearer sb_publishable_7kqbGZlL_im9kIpgFXLA-A_9CdqsyiT"}});}

export var ANTHROPIC_KEY=import.meta.env.VITE_ANTHROPIC_KEY||"";

export async function apiCall(system,content,maxTokens){
  var mt=maxTokens||1200;var blocks=typeof content==="string"?[{type:"text",text:content}]:content;
  var res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":ANTHROPIC_KEY,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:mt,system,messages:[{role:"user",content:blocks}]})});
  var data=await res.json();if(data.error)throw new Error(JSON.stringify(data.error));
  return(data.content||[]).map(function(b){return b.text||"";}).join("");
}
