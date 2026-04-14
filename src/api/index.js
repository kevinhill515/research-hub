export const SUPA_URL="https://vesnqbxswmggdfevqokt.supabase.co";

export async function supaGet(table,key,val){var col=table==="meta"?"value":"data";var r=await fetch(SUPA_URL+"/rest/v1/"+table+"?select="+col+"&"+key+"=eq."+val,{headers:{"apikey":"sb_publishable_7kqbGZlL_im9kIpgFXLA-A_9CdqsyiT","Authorization":"Bearer sb_publishable_7kqbGZlL_im9kIpgFXLA-A_9CdqsyiT","Accept":"application/vnd.pgrst.object+json"}});if(!r.ok)return null;try{return await r.json();}catch(e){return null;}}

export async function supaUpsert(table,obj){return fetch(SUPA_URL+"/rest/v1/"+table,{method:"POST",headers:{"apikey":"sb_publishable_7kqbGZlL_im9kIpgFXLA-A_9CdqsyiT","Authorization":"Bearer sb_publishable_7kqbGZlL_im9kIpgFXLA-A_9CdqsyiT","Content-Type":"application/json","Prefer":"resolution=merge-duplicates"},body:JSON.stringify(obj)});}

export function getAnthropicKey(){try{return localStorage.getItem("rh_anthropic_key")||"";}catch(e){return "";}}
export function setAnthropicKey(key){try{localStorage.setItem("rh_anthropic_key",key);}catch(e){}}

export async function apiCall(system,content,maxTokens){
  var key=getAnthropicKey();
  if(!key)throw new Error("No API key set. Click 'Keys' in the header to add your Anthropic API key.");
  var mt=maxTokens||1200;var blocks=typeof content==="string"?[{type:"text",text:content}]:content;
  var res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":key,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:mt,system,messages:[{role:"user",content:blocks}]})});
  var data=await res.json();if(data.error)throw new Error(JSON.stringify(data.error));
  return(data.content||[]).map(function(b){return b.text||"";}).join("");
}
