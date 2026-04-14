import { parseDate } from '../../utils/index.js';

function PriceAgeIndicator({lastPriceUpdate,T}){   if(!lastPriceUpdate)return <span style={{fontSize:10,color:T.textSec}}>Prices: never updated</span>;   var d=parseDate(lastPriceUpdate);if(!d)return null;   var days=Math.floor((Date.now()-d.getTime())/86400000);   var color=days>14?"#dc2626":days>7?"#d97706":T.textSuccess;   var label=days===0?"today":days===1?"yesterday":days+"d ago";   return <span style={{fontSize:10,color,fontWeight:days>7?600:400}}>Prices updated: {lastPriceUpdate} ({label}){days>14?" ⚠":""}</span>; }

export default PriceAgeIndicator;
