import { Document, HeadingLevel, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ExternalHyperlink, AlignmentType, Footer, PageNumber, LevelFormat, BorderStyle, TableOfContents, NumberFormat } from "docx";
import { Lexer } from "marked";
import { decodeHTML } from "entities";
import { markdown } from "./markdown.js";

export function inlineRuns(text,inherited={}) {
  return inlineTokens(new Lexer(markdown.defaults).inlineTokens(String(text??"")),inherited);
}
function inlineTokens(tokens,inherited={}) {
  return tokens.flatMap(token=>{
    if(token.type==="strong")return inlineTokens(token.tokens,{...inherited,bold:true});
    if(token.type==="em")return inlineTokens(token.tokens,{...inherited,italics:true});
    if(token.type==="del")return inlineTokens(token.tokens,{...inherited,strike:true});
    if(token.type==="link"){
      const runs=inlineTokens(token.tokens,{...inherited,...(/^(https?:|mailto:)/i.test(token.href)?{style:"Hyperlink"}:{})});
      return /^(https?:|mailto:)/i.test(token.href)?[new ExternalHyperlink({link:token.href,children:runs})]:runs;
    }
    if(token.type==="br")return [new TextRun({...inherited,break:1})];
    if(token.type==="html")return [];
    // Text tokens can contain nested inline tokens (e.g. hard line breaks).
    if(token.tokens)return inlineTokens(token.tokens,inherited);
    const value=token.type==="codespan"?token.text:decodeHTML(token.text??token.raw??"");
    return String(value).split("\n").flatMap((line,index)=>[
      ...(index?[new TextRun({...inherited,break:1})]:[]),
      new TextRun({...inherited,text:line,...(token.type==="codespan"?{font:"Menlo",size:19,shading:{fill:"F1F5F9"}}:{})}),
    ]);
  });
}
function displayWidth(value){return [...String(value)].reduce((n,c)=>n+(/[\u3000-\u9fff\uff00-\uffef]/.test(c)?2:1),0);}
export function isThesisDocument(spec) {
  return spec.documentStyle === 'thesis' || (spec.type === 'docx' && /(?:^|\n)#{1,2}\s*(?:本科(?:生)?毕业论文|毕业论文)\s*(?:\n|$)/.test(spec.content || ''));
}
export function buildWordDocument(title,content,options={}) {
  const academic=options.documentStyle==='thesis';
  const bodyFont={ascii:'Times New Roman',hAnsi:'Times New Roman',eastAsia:'宋体',cs:'Times New Roman'};
  const headingFont={ascii:'Times New Roman',hAnsi:'Times New Roman',eastAsia:'黑体',cs:'Times New Roman'};
  let references=false, chapter=0;
  const numbering=[];
  const tokens=markdown.lexer(content);
  if(tokens[0]?.type==="heading"&&tokens[0].depth===1&&decodeHTML(tokens[0].text)===title)tokens.shift();
  function paragraph(children,context={},extra={}) {
    const {depth=0,quote=0}=context;
    return new Paragraph({children,spacing:{after:140,line:340},widowControl:true,
      ...(academic?{alignment:AlignmentType.JUSTIFIED,indent:{firstLine:480},spacing:{after:120,line:360}}:{}),
      ...(depth||quote?{indent:{left:360*depth+300*quote}}:{}),
      ...(quote?{border:{left:{style:BorderStyle.SINGLE,size:12,color:"94A3B8",space:8}}}:{}),...extra});
  }
  function convert(items,context={}){
    const blocks=[];
    for(const token of items){
      if(token.type==="space")continue;
      if(token.type==="heading"){
        if(academic&&/参考文献|致谢/.test(token.text))references=/参考文献/.test(token.text);
        const headingRuns=inlineRuns(token.text,academic?{font:headingFont,color:'000000',bold:true}:{});
        blocks.push(paragraph(headingRuns,context,{heading:[HeadingLevel.HEADING_1,HeadingLevel.HEADING_2,HeadingLevel.HEADING_3,HeadingLevel.HEADING_4,HeadingLevel.HEADING_5,HeadingLevel.HEADING_6][Math.min(token.depth,6)-1],keepNext:true,spacing:{before:240,after:120},...(academic?{indent:{firstLine:0},pageBreakBefore:token.depth===1&&chapter++>0,alignment:token.depth===1?AlignmentType.CENTER:AlignmentType.LEFT}:{} )}));
      }
      else if(token.type==="paragraph"||token.type==="text")blocks.push(paragraph(inlineRuns(token.text,context.quote?{italics:true,color:"52606D"}:{}),context,academic&&references?{indent:{firstLine:0},spacing:{after:120,line:300},run:{size:21}}:{}));
      else if(token.type==="blockquote")blocks.push(...convert(token.tokens||markdown.lexer(token.text),{...context,quote:(context.quote||0)+1}));
      else if(token.type==="list"){
        const depth=context.depth||0,reference=`oproxy-list-${numbering.length}`;
        if(token.ordered)numbering.push({reference,levels:[{level:0,format:LevelFormat.DECIMAL,text:"%1.",start:Number(token.start)||1,alignment:AlignmentType.LEFT,style:{paragraph:{indent:{left:360*(depth+1),hanging:260}}}}]});
        for(const item of token.items){
          let first=true;
          for(const child of item.tokens||[]){
            if(child.type==="space"||child.type==="checkbox")continue;
            if(first&&(child.type==="paragraph"||child.type==="text")){
              const runs=[...(item.task?[new TextRun({text:item.checked?"☑ ":"☐ "})]:[]),...inlineRuns(child.text)];
              blocks.push(paragraph(runs,context,{...(token.ordered?{numbering:{reference,level:0}}:item.task?{}:{bullet:{level:Math.min(depth,8)}}),indent:{left:360*(depth+1)+(context.quote||0)*300,hanging:260},spacing:{after:100,line:330}}));first=false;
            }else{blocks.push(...convert([child],{...context,depth:depth+1}));first=false;}
          }
          if(first)blocks.push(paragraph(inlineRuns(item.text),context));
        }
      }else if(token.type==="table"){
        const rows=[token.header,...token.rows];
        const weights=token.header.map((_,i)=>Math.max(8,Math.min(40,Math.max(...rows.map(r=>displayWidth(r[i]?.text||""))))));
        const sum=weights.reduce((a,b)=>a+b,0),columnWidths=weights.map(n=>Math.round(n/sum*(academic?8787:9638)));
        blocks.push(new Table({width:{size:100,type:WidthType.PERCENTAGE},columnWidths,
          rows:rows.map((cells,index)=>new TableRow({tableHeader:index===0,cantSplit:true,children:cells.map((cell,i)=>new TableCell({width:{size:columnWidths[i],type:WidthType.DXA},shading:index===0?{fill:academic?"F2F2F2":"E2E8F0"}:undefined,margins:{top:90,bottom:90,left:110,right:110},children:[paragraph(inlineRuns(cell.text,{bold:index===0,...(academic?{size:21}:{} )}),{}, {alignment:token.align?.[i]==="center"?AlignmentType.CENTER:token.align?.[i]==="right"?AlignmentType.RIGHT:AlignmentType.LEFT,spacing:{after:40,line:300},...(academic?{indent:{firstLine:0}}:{})})]}))}))}));
        blocks.push(new Paragraph({text:"",spacing:{after:120}}));
      }else if(token.type==="code"){
        for(const line of token.text.split("\n"))blocks.push(paragraph([new TextRun({text:line,font:"Menlo",size:19})],context,{shading:{fill:"F1F5F9"},spacing:{after:0,line:280}}));
      }else if(token.type==="hr")blocks.push(new Paragraph({text:"",border:{bottom:{style:BorderStyle.SINGLE,color:"CBD5E1",size:6}},spacing:{before:120,after:120}}));
    }
    return blocks;
  }
  const footer={default:new Footer({children:[new Paragraph({alignment:AlignmentType.CENTER,children:[new TextRun({children:[PageNumber.CURRENT],size:18,color:"64748B"})]})]})};
  const margins={top:1417,bottom:1417,left:1701,right:1417};
  const properties={page:{size:{width:11906,height:16838},margin:margins}};
  if(!academic){
    const children=[new Paragraph({text:title,heading:HeadingLevel.TITLE,spacing:{after:320}}),...convert(tokens)];
    return new Document({creator:"Oproxy Chat",title,numbering:{config:numbering},styles:{default:{document:{run:{font:"PingFang SC",size:24}}}},sections:[{properties:{page:{margin:{top:1134,bottom:1134,left:1134,right:1134}}},footers:footer,children}]});
  }
  const abstractIndex=tokens.findIndex(t=>t.type==='heading'&&/^摘要$/.test(t.text.trim()));
  const tocIndex=tokens.findIndex(t=>t.type==='heading'&&/^目\s*录$/.test(t.text.trim()));
  const bodyIndex=tokens.findIndex((t,i)=>i>Math.max(abstractIndex,tocIndex)&&t.type==='heading'&&t.depth===1&&!/毕业论文/.test(t.text));
  const hasFront=abstractIndex>=0&&bodyIndex>abstractIndex;
  const coverTokens=hasFront?tokens.slice(0,abstractIndex).filter(t=>t.type!=='hr'&&t.type!=='heading'):[];
  const bodyTokens=hasFront?tokens.slice(bodyIndex):tokens;
  const abstractTokens=hasFront?tokens.slice(abstractIndex+1,tocIndex>=0?tocIndex:bodyIndex).filter(t=>t.type!=='hr'):[];
  const cover=[new Paragraph({children:[new TextRun({text:'本科毕业论文',font:headingFont,size:44,bold:true})],alignment:AlignmentType.CENTER,spacing:{before:1800,after:720}}),new Paragraph({children:[new TextRun({text:title,font:headingFont,size:36,bold:true})],alignment:AlignmentType.CENTER,spacing:{after:1200,line:480}}),...convert(coverTokens)];
  const cachedEntries=bodyTokens.filter(t=>t.type==='heading'&&t.depth<=3).map(t=>({title:decodeHTML(t.text),level:t.depth}));
  const contents=new TableOfContents('目录',{headingStyleRange:'1-3',hyperlink:true,beginDirty:true,cachedEntries});
  const sections=[];
  if(hasFront){
    sections.push({properties,children:cover});
    sections.push({properties:{...properties,page:{...properties.page,pageNumbers:{start:1,formatType:NumberFormat.UPPER_ROMAN}}},footers:footer,children:[new Paragraph({text:'摘要',style:'FrontMatterTitle',pageBreakBefore:true}),...convert(abstractTokens)]});
    sections.push({properties,footers:footer,children:[new Paragraph({text:'目录',style:'FrontMatterTitle',pageBreakBefore:true}),contents]});
  }
  sections.push({properties:{...properties,page:{...properties.page,pageNumbers:{start:1,formatType:NumberFormat.DECIMAL}}},footers:footer,children:hasFront?convert(bodyTokens):[new Paragraph({text:title,style:'FrontMatterTitle'}),...convert(bodyTokens)]});
  const heading=(size,center=false)=>({run:{font:headingFont,size,bold:true,color:'000000'},paragraph:{indent:{firstLine:0},alignment:center?AlignmentType.CENTER:AlignmentType.LEFT,spacing:{before:240,after:180,line:360},keepNext:true}});
  return new Document({creator:'Oproxy Chat',title,features:{updateFields:true},numbering:{config:numbering},styles:{default:{document:{run:{font:bodyFont,size:24,color:'000000'},paragraph:{spacing:{line:360},indent:{firstLine:480}}},heading1:heading(32,true),heading2:heading(28),heading3:heading(24),heading4:heading(24),heading5:heading(24),heading6:heading(24)},paragraphStyles:[{id:'FrontMatterTitle',name:'前置部分标题',...heading(32,true)},{id:'TOC1',name:'TOC 1',run:{font:bodyFont,size:24},paragraph:{indent:{left:0,firstLine:0},spacing:{line:360}}},{id:'TOC2',name:'TOC 2',run:{font:bodyFont,size:22},paragraph:{indent:{left:240,firstLine:0},spacing:{line:330}}},{id:'TOC3',name:'TOC 3',run:{font:bodyFont,size:21},paragraph:{indent:{left:480,firstLine:0},spacing:{line:300}}}]},sections});
}
export async function renderWord(title,content,options){return Packer.toBuffer(buildWordDocument(title,content,options));}
