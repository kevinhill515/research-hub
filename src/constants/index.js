export const PORTFOLIOS=["FIN","IN","FGL","GL","EM","SC"];
export const TIER_ORDER=["FIN1","FIN2","FIN3","INGL1","INGL2","IN1","IN2","US1","US2","EM1","EM2","EM3","EM4","EM5","SC1","SC2","SC3","SC4","SC5","F MC","W MC","F EM","W EM","F SC","W SC","Hit TP","Gave Up","Remove"];
export const SECTOR_ORDER=["Industrials","Information Technology","Energy","Consumer Discretionary","Materials","Consumer Staples","Financials","Health Care","Communication Services","Utilities","Real Estate"];
export const COUNTRY_ORDER=["United States","Britain","Japan","Netherlands","France","Canada","Taiwan","Germany","Mexico","Singapore","China","Italy","Norway","Luxembourg","Ireland","Australia","Austria","Spain","Sweden","Switzerland","South Korea","Brazil","Indonesia","Chile","South Africa","India","Greece","Panama","Jordan","Denmark","Israel","Belgium","Egypt","Hungary","Russia"];
export const SECTOR_COLORS={"Industrials":{bg:"#ffedd5",color:"#9a3412"},"Information Technology":{bg:"#fef9c3",color:"#854d0e"},"Energy":{bg:"#dcfce7",color:"#166534"},"Consumer Discretionary":{bg:"#dbeafe",color:"#1e40af"},"Materials":{bg:"#f3e8ff",color:"#6b21a8"},"Consumer Staples":{bg:"#fce7f3",color:"#9d174d"},"Financials":{bg:"#fee2e2",color:"#991b1b"},"Health Care":{bg:"#f1f5f9",color:"#475569"},"Communication Services":{bg:"#ccfbf1",color:"#0f766e"},"Utilities":{bg:"#e0e7ff",color:"#3730a3"},"Real Estate":{bg:"#fef3c7",color:"#92400e"}};
export const SECTOR_SHORT={"Consumer Discretionary":"Cons Disc","Information Technology":"Info Tech","Communication Services":"Comm Svcs","Consumer Staples":"Cons Staples"};
export const COUNTRY_GROUPS={"United States":"us","Canada":"us","Mexico":"amer","Brazil":"amer","Chile":"amer","Panama":"amer","Britain":"europe","Netherlands":"europe","France":"europe","Germany":"europe","Italy":"europe","Norway":"europe","Luxembourg":"europe","Ireland":"europe","Austria":"europe","Spain":"europe","Sweden":"europe","Switzerland":"europe","Greece":"europe","Denmark":"europe","Belgium":"europe","Hungary":"europe","Russia":"europe","Japan":"asia","Taiwan":"asia","Singapore":"asia","China":"asia","South Korea":"asia","Indonesia":"asia","India":"asia","Australia":"asia","South Africa":"africa","Jordan":"africa","Israel":"africa","Egypt":"africa"};
export const COUNTRY_COLORS={us:{bg:"#ede9fe",color:"#5b21b6"},amer:{bg:"#dcfce7",color:"#166534"},europe:{bg:"#dbeafe",color:"#1e40af"},asia:{bg:"#ffe4e6",color:"#9f1239"},africa:{bg:"#fef9c3",color:"#854d0e"}};
export const REGION_COLORS={"US & Canada":"#5b21b6","Other Americas":"#166534","Europe":"#1e40af","Asia":"#9f1239","Africa & Middle East":"#854d0e"};
export const REGION_GROUPS={"US & Canada":["us"],"Other Americas":["amer"],"Europe":["europe"],"Asia":["asia"],"Africa & Middle East":["africa"]};
export const STATUS_RANK={"Own":0,"Focus":1,"Watch":2,"Sold":3,"":4};
export const CURRENCY_MAP={"United States":"USD","Canada":"CAD","Britain":"GBP","Australia":"AUD","Japan":"JPY","Switzerland":"CHF","Sweden":"SEK","Norway":"NOK","Denmark":"DKK","South Korea":"KRW","Netherlands":"EUR","France":"EUR","Germany":"EUR","Italy":"EUR","Spain":"EUR","Luxembourg":"EUR","Ireland":"EUR","Austria":"EUR","Belgium":"EUR","Greece":"EUR","Taiwan":"TWD","China":"CNY","Singapore":"SGD","India":"INR","Brazil":"BRL","Mexico":"MXN","Chile":"CLP","South Africa":"ZAR","Indonesia":"IDR","Russia":"RUB","Hungary":"HUF","Israel":"ILS","Egypt":"EGP","Jordan":"JOD","Panama":"USD","Hong Kong":"HKD"};
export const ALL_CURRENCIES=["USD","EUR","GBP","JPY","CHF","SEK","NOK","DKK","CAD","AUD","TWD","CNY","HKD","SGD","INR","BRL","MXN","CLP","ZAR","IDR","KRW","HUF","ILS","EGP","JOD","RUB"];
export const MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
export const CO_SORTS=["Tier","Last Reviewed","Last Updated","Sector","Country","Name","MOS","5D%"];
export const FORMATS=["Key Takeaways","Executive Summary","Bullet Points","Q&A","Timeline","Conflict Detector","Custom"];
export const TONES=["Academic","Professional","Plain English"];
export const LIB_SORTS=["Pinned first","Newest","Oldest","Format","Tag"];
export const PRESET_TAGS=["Company Template","Macro","FIN","IN","FGL","GL","EM","SC"];
export const UPLOAD_TYPES=["Earnings Report","Sell Side Research","Company Release","News Article","Analyst Note","Other"];
export const TEMPLATE_SECTIONS=["Valuation","Overview","Thesis","Segments","Guidance / KPIs","Key Challenges"];
export const SECTION_SUBHEADINGS={
  "Valuation":["Method:","Multiple:","Target EPS:","Target Price:","Key Assumptions:"],
  "Overview":["Business:","Geography:","Market Position:","Key Products/Segments:"],
  "Thesis":["Core Thesis:","Bull Case:","Bear Case:","Key Catalysts:"],
  "Segments":["Segment Breakdown:","Growth Drivers:","Margins by Segment:"],
  "Guidance / KPIs":["Revenue Guidance:","Margin Guidance:","Key KPIs:","Management Targets:"],
  "Key Challenges":["Key Risks:","Competitive Threats:","Macro Headwinds:","Execution Risk:"]
};
export const THESIS_STATUSES=["On track","Watch","Broken"];
export const TP_CHANGES=["Increased","Decreased","Unchanged"];
export const AVG_WPM=200;
export const ALL_COLS=["Tier(s)","Name","5D%","MOS","FPE Range","Country","Sector","Portfolio","Action","Notes","Reviewed","Updated","Status","Flag","Del"];
export const COMPACT_COLS=new Set(["Tier(s)","Name","5D%","MOS","FPE Range","Status","Reviewed","Flag","Del"]);
export const SHORTCUTS=[{key:"/",desc:"Focus search"},{key:"n",desc:"New company"},{key:"b",desc:"Bulk import"},{key:"d",desc:"Dashboard"},{key:"c",desc:"Companies"},{key:"s",desc:"Synthesize"},{key:"l",desc:"Library"},{key:"r",desc:"Recall"},{key:"Escape",desc:"Close/deselect"},{key:"?",desc:"Show shortcuts"}];
export const CONF_BG={"High":"#dcfce7","Medium":"#fef9c3","Low":"#fee2e2"};
export const CONF_COLOR={"High":"#166534","Medium":"#854d0e","Low":"#991b1b"};
export const ACTIONS=["Increase TP","No Action","Decrease TP"];
export const TEAM_MEMBERS=["Chris","Al","Bob","Kevin","Ron","Emily"];
export const TEAM_COLORS={"Chris":"#7c3aed","Al":"#dc2626","Bob":"#16a34a","Kevin":"#2563eb","Ron":"#ea580c","Emily":"#ca8a04"};
export const REP_ACCOUNTS={"LWGA0013":"GL","LWFOCGL1":"FGL","LWIV0004":"IN","LWIF0001":"FIN","LWEA0001":"EM","LWSC0003":"SC"};
export const PORT_NAMES={"GL":"Global Value","FGL":"Focused Global Value","IN":"International Value","FIN":"Focused International Value","EM":"Emerging Markets Value","SC":"International Small Cap Value"};
export const FLAG_STYLES={"Needs Review":{bg:"#fef9c3",color:"#854d0e",icon:"⚑"},"Urgent":{bg:"#fee2e2",color:"#991b1b",icon:"🔴"}};
