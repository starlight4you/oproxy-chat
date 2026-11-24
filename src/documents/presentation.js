import PptxGenJS from "pptxgenjs";
import { chartSvg } from "./chart-svg.js";

const colors = { ink:"142F3A", accent:"0F766E", muted:"526878", light:"EFF5F6", white:"FFFFFF", blue:"3B82A0", gold:"D99A34" };
export { paginateSlides } from "./presentation-plan.js";
import { paginateSlides, displayWidth } from "./presentation-plan.js";
function text(slide,value,x,y,w,h,opts={}){
  slide.addText(String(value||""),{x,y,w,h,fontFace:"PingFang SC",fontSize:18,color:colors.ink,margin:0,breakLine:false,valign:"top",fit:"shrink",...opts});
}
function box(pptx,slide,x,y,w,h,color=colors.light){slide.addShape(pptx.ShapeType.rect,{x,y,w,h,fill:{color},line:{color}});}
function bulletText(slide,bullets,x,y,w,h,fontSize=19){
  if(!bullets?.length)return;
  slide.addText(bullets.map(value=>({text:value,options:{bullet:{indent:fontSize},hanging:4,breakLine:true,paraSpaceAfter:14}})),{x,y,w,h,fontFace:"PingFang SC",fontSize,color:colors.ink,margin:0,valign:"top",fit:"shrink"});
}
export async function buildPresentation(title, definitions, { renderSvg } = {}) {
  const pptx=new PptxGenJS();pptx.layout="LAYOUT_WIDE";pptx.author="Oproxy Chat";pptx.company="Oproxy";pptx.title=title;
  pptx.theme={headFontFace:"PingFang SC",bodyFontFace:"PingFang SC",lang:"zh-CN"};
  const cover=pptx.addSlide();cover.background={color:colors.ink};
  box(pptx,cover,0.7,1.2,1.1,0.08,colors.gold);
  text(cover,title,0.8,2,11.7,2.5,{fontSize:36,bold:true,color:colors.white});
  text(cover,"Oproxy Chat",0.8,6.6,10,0.35,{fontSize:12,color:"B1C8D1"});
  const deck=paginateSlides(definitions);
  for (const [index,definition] of deck.entries()) {
    const slide=pptx.addSlide();slide.background={color:colors.white};
    if(definition.notes)slide.addNotes(definition.notes);
    box(pptx,slide,0,0,0.18,7.5,colors.accent);
    text(slide,definition.title,0.6,0.38,12.0,0.85,{fontSize:26,bold:true});
    const top=definition.subtitle?1.72:1.5;
    if(definition.subtitle)text(slide,definition.subtitle,0.65,1.2,12,0.4,{fontSize:13,color:colors.muted});
    if(definition.layout==="comparison"){
      const cols=definition.columns, gap=0.3,w=(12.0-gap*(cols.length-1))/cols.length;
      cols.forEach((col,i)=>{const x=0.65+i*(w+gap);box(pptx,slide,x,top,w,4.8);text(slide,col.title,x+0.22,top+0.25,w-0.44,0.65,{bold:true,color:colors.accent,fontSize:23});bulletText(slide,col.bullets,x+0.25,top+1,w-0.5,3.4,18);});
    }else if(definition.layout==="metrics"){
      const metrics=definition.metrics, gap=0.25,w=(12-gap*(metrics.length-1))/metrics.length;
      metrics.forEach((metric,i)=>{const x=0.65+i*(w+gap);box(pptx,slide,x,top+0.35,w,3.65);text(slide,metric.value,x+0.22,top+0.7,w-0.44,1,{fontSize:38,bold:true,color:colors.accent});text(slide,metric.label,x+0.22,top+1.9,w-0.44,0.65,{fontSize:20,bold:true});text(slide,metric.detail,x+0.22,top+2.7,w-0.44,0.95,{fontSize:14,color:colors.muted});});
    }else if(definition.layout==="timeline"){
      const steps=definition.steps, w=12/steps.length;
      steps.forEach((step,i)=>{const x=0.65+i*w;box(pptx,slide,x,top+0.4,w-0.2,0.06,colors.accent);text(slide,String(step.stepNumber||i+1).padStart(2,"0"),x,top+0.7,w-0.3,0.65,{fontSize:28,color:colors.accent,bold:true});text(slide,step.title,x,top+1.5,w-0.35,1,{fontSize:19,bold:true});text(slide,step.detail,x,top+2.65,w-0.35,2,{fontSize:15,color:colors.muted});});
    }else if(definition.layout==="table"){
      const table=definition.table;
      const rows=[table.columns.map(value=>({text:String(value),options:{bold:true,color:colors.white,fill:colors.accent}})),...table.rows.map((row,i)=>row.map(value=>({text:String(value),options:{fill:i%2?colors.white:colors.light}})))];
      const rowH=[Math.max(0.45,Math.max(...table.columns.map(c=>Math.ceil(displayWidth(c)/(110/table.columns.length))))*0.23+0.2),...table.rows.map(row=>Math.max(0.45,Math.max(...row.map(c=>Math.ceil(displayWidth(c)/(110/table.columns.length))))*0.23+0.2))];
      slide.addTable(rows,{x:0.65,y:top,w:12,rowH,fontFace:"PingFang SC",fontSize:15,color:colors.ink,margin:0.12,border:{type:"solid",color:"D5E3E6",pt:0.5},autoPage:false,breakLine:false,valign:"mid"});
    }else if(definition.layout==="chart"){
      const chart=definition.chart;
      if (renderSvg) {
        const preview = await renderSvg(chartSvg(chart));
        slide.addImage({ data: `image/png;base64,${preview.toString("base64")}`, x:0.7,y:top,w:11.9,h:4.65,altText:"图表兼容预览" });
      }
      // Native editable chart overlays its preview in Office; importers that omit
      // native chart objects retain the same data's rendered preview underneath.
      slide.addChart(pptx.ChartType[chart.type],chart.series.map(s=>({name:s.name,labels:chart.categories,values:s.values})),{x:0.7,y:top,w:11.9,h:4.65,chartArea:{fill:{color:"FFFFFF"}},plotArea:{fill:{color:"FFFFFF"}},catAxisLabelFontSize:12,valAxisLabelFontSize:12,chartColors:[colors.accent,colors.blue,colors.gold,"879FA9"],showLegend:chart.series.length>1||chart.type==="pie"||chart.type==="doughnut",legendPos:"b",showTitle:!!chart.title,title:chart.title,showValue:chart.type==="pie"||chart.type==="doughnut",showCatName:chart.type==="pie"||chart.type==="doughnut",showBorder:false,showMarker:chart.type==="line",showShadow:false});
    }else if(definition.layout==="section"){
      box(pptx,slide,0.65,top,12,4.7,colors.ink);text(slide,definition.subtitle||definition.title,1,top+1.2,11.2,1.4,{fontSize:32,bold:true,color:colors.white});
    }else{bulletText(slide,definition.bullets,0.85,top,11.65,4.85);}
    if(definition.source)text(slide,definition.source,0.65,6.8,11.3,0.32,{fontSize:9,color:colors.muted});
    text(slide,`${index+1} / ${deck.length}`,11.7,7.02,0.95,0.25,{fontSize:10,color:colors.muted,align:"right"});
  }
  return Buffer.from(await pptx.write({outputType:"nodebuffer"}));
}
