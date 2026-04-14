function BarRow({label,clr,own,focus,watch,max,T}){
  var op=max>0?(own/max*100):0,fp=max>0?(focus/max*100):0,wp=max>0?(watch/max*100):0;
  return(<div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:11,fontWeight:500,color:clr,width:140,flexShrink:0}}>{label}</span><div style={{flex:1,height:14,background:"#f1f5f9",borderRadius:4,overflow:"hidden",position:"relative"}}><div style={{position:"absolute",left:0,top:0,width:op+"%",height:"100%",background:clr}}/><div style={{position:"absolute",left:op+"%",top:0,width:fp+"%",height:"100%",background:clr,opacity:0.45}}/><div style={{position:"absolute",left:(op+fp)+"%",top:0,width:wp+"%",height:"100%",background:clr,opacity:0.2}}/></div><div style={{fontSize:11,width:130,flexShrink:0,textAlign:"right"}}>{own>0&&<span style={{color:"#166534",fontWeight:500}}>{own} own</span>}{focus>0&&<span style={{color:"#1e40af"}}>{own>0?" · ":""}{focus} foc</span>}{watch>0&&<span style={{color:"#854d0e"}}>{(own>0||focus>0)?" · ":""}{watch} w</span>}</div></div>);
}

export default BarRow;
