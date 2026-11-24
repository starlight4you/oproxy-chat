// Conservative layout estimates keep dense CJK text readable. Pagination never
// drops a supplied field: extra commentary becomes an explicit continuation.
export const displayWidth = value => [...String(value ?? "")].reduce((n,c)=>n+(/[\u3000-\u9fff\uff00-\uffef]/.test(c)?2:1),0);
export function splitText(value, limit) {
  const result=[];let text="",size=0;
  for(const char of String(value)){const width=displayWidth(char);if(size+width>limit&&text){result.push(text);text="";size=0;}text+=char;size+=width;}
  if(text)result.push(text);return result;
}
function packBullets(values,width,budget,maxItems=5) {
  const result=[];let group=[],weight=0;
  for(const value of values||[])for(const text of splitText(value,Math.floor(width*Math.max(2,budget-2)))){
    const size=Math.ceil(displayWidth(text)/width)+0.8;
    if(group.length&&(weight+size>budget||group.length>=maxItems)){result.push(group);group=[];weight=0;}
    group.push(text);weight+=size;
  }
  if(group.length)result.push(group);return result;
}
export function paginateSlides(slides) {
  const output=[];
  for(const original of slides){
    const layout=original.layout||(original.chart?"chart":original.table?"table":original.columns?"comparison":original.metrics?"metrics":original.steps?"timeline":"bullets");
    const base={...original,layout};let pages=[];
    if(layout==="bullets")pages=packBullets(base.bullets,90,11).map(bullets=>({...base,bullets}));
    else if(layout==="comparison"){
      const width=base.columns.length===3?25:40;
      const chunks=base.columns.map(col=>packBullets(col.bullets,width,7.5,4));
      for(let part=0;part<Math.max(...chunks.map(c=>c.length));part++)pages.push({...base,columns:base.columns.map((col,i)=>({...col,bullets:chunks[i][part]||[]})),bullets:[]});
    }else if(layout==="timeline"){
      let group=[];
      for(const [stepIndex,step] of base.steps.entries()){
        const pieces=splitText(step.detail,240);
        for(const detail of pieces.length?pieces:[""]){
          if(group.length===3){pages.push({...base,steps:group,bullets:[]});group=[];}
          group.push({...step,detail,stepNumber:stepIndex+1});
        }
      }
      if(group.length)pages.push({...base,steps:group,bullets:[]});
    }else if(layout==="metrics"){
      const count=base.metrics.some(m=>displayWidth(m.label)>45||displayWidth(m.detail)>120)?2:4;
      for(let i=0;i<base.metrics.length;i+=count)pages.push({...base,metrics:base.metrics.slice(i,i+count),bullets:[]});
    }else if(layout==="table"){
      const columnWidth=110/base.table.columns.length,headerWeight=Math.max(...base.table.columns.map(c=>Math.ceil(displayWidth(c)/columnWidth)))+0.8;
      const budget=Math.max(4,14-headerWeight),cellLimit=Math.floor(columnWidth*Math.max(2,budget-1));
      let rows=[],weight=0;
      const flush=()=>{pages.push({...base,table:{...base.table,rows},bullets:[]});rows=[];weight=0;};
      for(const row of base.table.rows){
        const cells=row.map(cell=>splitText(String(cell),cellLimit));
        for(let part=0;part<Math.max(...cells.map(c=>c.length));part++){
          const piece=cells.map(c=>c[part]??"");
          const size=Math.max(1,...piece.map(c=>Math.ceil(displayWidth(c)/columnWidth)))+0.8;
          if(rows.length&&(weight+size>budget||rows.length>=7))flush();
          rows.push(part===0&&cells.every(c=>c.length<=1)?row:piece);weight+=size;
        }
      }
      if(rows.length)flush();
    }else pages=[{...base,bullets:[]}];
    if(!pages.length)pages=[base];
    pages=pages.map((page,index)=>({...page,title:base.title+(index?"（续）":"")}));
    output.push(...pages);
    if(layout!=="bullets"&&base.bullets?.length){
      for(const bullets of packBullets(base.bullets,90,11))output.push({...base,layout:"bullets",title:`${base.title}（补充说明）`,bullets,columns:undefined,metrics:undefined,steps:undefined,table:undefined,chart:undefined});
    }
  }
  return output;
}
