function PillEl({label,bg,color,border,onRemove}){
  return <span style={{fontSize:11,padding:"2px 7px",borderRadius:99,background:bg||"#f1f5f9",color:color||"#6b7280",border:border||"1px solid #e2e8f0",display:"flex",alignItems:"center",gap:3,whiteSpace:"nowrap"}}>{label}{onRemove&&<span onClick={function(e){e.stopPropagation();onRemove();}} style={{cursor:"pointer",opacity:0.7,fontSize:10}}>×</span>}</span>;
}

export default PillEl;
