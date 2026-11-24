const escape = value => String(value ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"})[c]);
const palette=["#0F766E","#3B82A0","#D99A34","#879FA9","#A46B8C","#78974B"];
export function chartSvg(chart) {
  const W=1200,H=470, left=90,right=1160,top=55,bottom=365;
  const parts=[`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="1200" height="470" fill="white"/>`];
  const text=(value,x,y,size=17,anchor="middle",color="#526878")=>parts.push(`<text x="${x}" y="${y}" font-family="PingFang SC, sans-serif" font-size="${size}" fill="${color}" text-anchor="${anchor}">${escape(value)}</text>`);
  if(chart.title)text(chart.title,600,28,22,"middle","#142F3A");
  if(chart.type==="pie"||chart.type==="doughnut"){
    const values=chart.series[0].values,total=values.reduce((a,b)=>a+b,0),cx=450,cy=235,r=170;
    let angle=-Math.PI/2;
    values.forEach((value,i)=>{
      const next=angle+2*Math.PI*value/total,span=next-angle;
      if(value>0){
        if(span>=2*Math.PI-1e-8)parts.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${palette[i%palette.length]}"/>`);
        else parts.push(`<path d="M ${cx} ${cy} L ${cx+r*Math.cos(angle)} ${cy+r*Math.sin(angle)} A ${r} ${r} 0 ${span>Math.PI?1:0} 1 ${cx+r*Math.cos(next)} ${cy+r*Math.sin(next)} Z" fill="${palette[i%palette.length]}"/>`);
      }
      const columns=values.length>10?2:1, x=columns===1?710:690+(i>=10?250:0), y=70+(i%10)*36;
      parts.push(`<rect x="${x}" y="${y-12}" width="14" height="14" fill="${palette[i%palette.length]}"/>`);
      const label=chart.categories[i].length>10?chart.categories[i].slice(0,9)+"…":chart.categories[i];
      text(`${label} ${(value/total*100).toFixed(1)}%`,x+22,y,columns===1?17:13,"start");angle=next;
    });
    if(chart.type==="doughnut")parts.push(`<circle cx="${cx}" cy="${cy}" r="90" fill="white"/>`);
  }else{
    const all=chart.series.flatMap(s=>s.values),min=Math.min(0,...all),max=Math.max(1,...all),range=max-min;
    const y=value=>bottom-(value-min)/range*(bottom-top),zero=y(0),step=(right-left)/chart.categories.length;
    for(let i=0;i<=4;i++){const value=min+range*i/4,yy=y(value);parts.push(`<line x1="${left}" y1="${yy}" x2="${right}" y2="${yy}" stroke="#D5E3E6"/>`);text(Number(value.toFixed(1)).toLocaleString("en-US"),left-12,yy+6,16,"end");}
    chart.categories.forEach((label,i)=>text(label,left+step*(i+0.5),bottom+30,chart.categories.length>10?12:17));
    chart.series.forEach((series,j)=>{
      if(chart.type==="line"){
        const points=series.values.map((v,i)=>`${left+step*(i+0.5)},${y(v)}`).join(" ");parts.push(`<polyline points="${points}" fill="none" stroke="${palette[j%6]}" stroke-width="4"/>`);
        series.values.forEach((v,i)=>parts.push(`<circle cx="${left+step*(i+0.5)}" cy="${y(v)}" r="5" fill="${palette[j%6]}"/>`));
      }else{
        const bw=Math.min(90,step*0.75/chart.series.length);
        series.values.forEach((value,i)=>{const x=left+step*(i+0.5)-bw*chart.series.length/2+bw*j,yy=y(value);parts.push(`<rect x="${x}" y="${Math.min(yy,zero)}" width="${Math.max(bw-4,2)}" height="${Math.max(Math.abs(zero-yy),1)}" fill="${palette[j%6]}"/>`);if(chart.series.length===1)text(value.toLocaleString("en-US"),x+bw/2,yy+(value<0?20:-9),16);});
      }
      const x=180+(j%3)*340, yy=chart.series.length>3?(j<3?410:447):435;parts.push(`<rect x="${x}" y="${yy}" width="16" height="16" fill="${palette[j%6]}"/>`);text(series.name,x+23,yy+14,15,"start");
    });
  }
  return parts.join("")+"</svg>";
}
