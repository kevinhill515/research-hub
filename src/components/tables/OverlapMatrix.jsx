import { PORTFOLIOS } from '../../constants/index.js';

function OverlapMatrix({companies,T}){
  var ports=PORTFOLIOS.filter(function(p){return companies.some(function(c){return(c.portfolios||[]).indexOf(p)>=0;});});
  if(ports.length<2)return <p style={{fontSize:13,color:T.textSec}}>Need at least 2 portfolios.</p>;
  function overlap(a,b){return companies.filter(function(c){return(c.portfolios||[]).indexOf(a)>=0&&(c.portfolios||[]).indexOf(b)>=0;}).length;}
  function total(p){return companies.filter(function(c){return(c.portfolios||[]).indexOf(p)>=0;}).length;}
  return(<div style={{overflowX:"auto"}}><div style={{display:"table",borderCollapse:"collapse",fontSize:11}}><div style={{display:"table-row"}}><div style={{display:"table-cell",padding:"4px 8px"}}/>{ports.map(function(p){return <div key={p} style={{display:"table-cell",padding:"4px 8px",fontWeight:600,color:T.text,textAlign:"center"}}>{p}<div style={{fontSize:10,color:T.textSec,fontWeight:400}}>{total(p)}</div></div>;})}</div>{ports.map(function(pa){return(<div key={pa} style={{display:"table-row"}}><div style={{display:"table-cell",padding:"4px 8px",fontWeight:600,color:T.text,whiteSpace:"nowrap"}}>{pa}</div>{ports.map(function(pb){var n=pa===pb?total(pa):overlap(pa,pb);var pct=pa===pb?100:total(pa)>0?Math.round(n/total(pa)*100):0;var bg=pa===pb?T.bgTer:n===0?T.bg:"rgba(99,102,241,"+(0.1+pct/100*0.6)+")";return <div key={pb} style={{display:"table-cell",padding:"6px 10px",textAlign:"center",background:bg,color:T.text,border:"1px solid "+T.border,borderRadius:4}}>{pa===pb?<span style={{color:T.textSec}}>—</span>:n>0?<span><strong>{n}</strong><span style={{color:T.textSec}}> ({pct}%)</span></span>:<span style={{color:T.border}}>0</span>}</div>;})})}</div>);})}</div><div style={{fontSize:11,color:T.textSec,marginTop:8}}>Numbers = shared companies. % = relative to row portfolio.</div></div>);
}

export default OverlapMatrix;
