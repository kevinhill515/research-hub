function StatusPill({status}){
  var cfg={"Own":{bg:"#dcfce7",color:"#166534"},"Focus":{bg:"#dbeafe",color:"#1e40af"},"Watch":{bg:"#fef9c3",color:"#854d0e"},"Sold":{bg:"#fee2e2",color:"#991b1b"}}[status]||{bg:"#f1f5f9",color:"#6b7280"};
  return <span style={{fontSize:11,padding:"2px 7px",borderRadius:99,background:cfg.bg,color:cfg.color,fontWeight:500,whiteSpace:"nowrap"}}>{status||"--"}</span>;
}

export default StatusPill;
