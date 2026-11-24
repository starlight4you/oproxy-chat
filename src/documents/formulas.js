import { DocumentValidationError } from "./errors.js";
import FormulaParser from "fast-formula-parser";

const unwrap=arg=>arg?.value ?? arg;
function criterionMatches(value,criterion) {
  criterion=unwrap(criterion);
  const match=typeof criterion==="string" ? /^(<>|>=|<=|>|<|=)?([\s\S]*)$/.exec(criterion) : null;
  const op=match?.[1]||"=",raw=match?match[2]:criterion;
  const target=typeof raw==="string"&&raw.trim()!==""&&Number.isFinite(Number(raw))?Number(raw):raw;
  if(typeof target==="string"&&/[?*~]/.test(target)&&(op==="="||op==="<>")){
    let pattern="";
    for(let i=0;i<target.length;i++){
      let char=target[i];
      if(char==="~"&&i+1<target.length){char=target[++i];pattern+=char.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");}
      else pattern+=char==="*"?".*":char==="?"?".":char.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
    }
    const equal=new RegExp(`^${pattern}$`,"i").test(String(value??""));return op==="="?equal:!equal;
  }
  const left=typeof target==="number"?(value==null?0:value):String(value??"").toLowerCase();
  const right=typeof target==="number"?target:String(target??"").toLowerCase();
  return op==="="?left===right:op==="<>"?left!==right:op===">"?left>right:op==="<"?left<right:op===">="?left>=right:left<=right;
}
function conditionalAggregate(mode,...args) {
  const range=arg=>{const v=unwrap(arg);return Array.isArray(v)?v.flat():[v];};
  const sums=mode==="count"?null:range(args.shift());
  if(args.length<2||args.length%2)throw new Error("条件范围与条件必须成对提供。");
  const groups=[];for(let i=0;i<args.length;i+=2)groups.push([range(args[i]),unwrap(args[i+1])]);
  const length=sums?.length||groups[0][0].length;
  if(groups.some(([values])=>values.length!==length))throw new Error("条件范围长度不一致。");
  let sum=0,count=0;
  for(let i=0;i<length;i++)if(groups.every(([values,criterion])=>criterionMatches(values[i],criterion))){
    if(mode==="count")count++;
    else if(typeof sums[i]==="number"){sum+=sums[i];count++;}
  }
  if(mode==="average"&&!count)throw new Error("没有符合条件的数值。");
  return mode==="count"?count:mode==="average"?sum/count:sum;
}

// No eval or external workbook access. A fresh parser per formula is required:
// referenced cells can recursively evaluate other formulas during a parse.
export function recalculateWorkbook(workbook) {
  const memo=new Map(), visiting=new Set();let count=0,corrected=0,reads=0;
  const fail=(message)=>{throw new DocumentValidationError(`Excel 公式校验失败：${message}`);};
  function worksheet(name) {
    const sheet=workbook.worksheets.find(s=>s.name.toLowerCase()===String(name).toLowerCase());
    if(!sheet)fail(`找不到工作表 ${name}`);return sheet;
  }
  function value(sheet,row,col,depth=0) {
    if(++reads>500000)fail("引用数量超过限制，请缩小计算范围。");
    if(depth>100)fail("公式依赖层数超过100层。");
    if(row<1||row>1048576||col<1||col>16384)fail("无效的单元格引用。");
    const key=`${sheet.id}:${row}:${col}`;
    if(memo.has(key))return memo.get(key);
    const cell=sheet.getRow(row).getCell(col), input=cell.value;
    if(!input||typeof input!=="object"||!input.formula)return input ?? null;
    if(visiting.has(key))fail(`${sheet.name}!${cell.address} 存在循环引用。`);
    visiting.add(key);
    const formula=String(input.formula).replace(/^=/,"");
    const syntax=formula.replace(/"(?:[^"]|"")*"/g,'""');
    if(/[\[\]|]/.test(syntax))fail(`${sheet.name}!${cell.address} 不支持外部工作簿或结构化引用。`);
    if(/\b(?:WEBSERVICE|HYPERLINK|IMPORTXML|IMPORTDATA|RTD|CALL|REGISTER|EXEC|RAND|RANDBETWEEN|NOW|TODAY)\s*\(/i.test(syntax))fail(`${sheet.name}!${cell.address} 使用了外部访问或不确定函数。`);
    const parser=new FormulaParser({
      functions:{
        SUMIFS:(...args)=>conditionalAggregate("sum",...args),
        COUNTIFS:(...args)=>conditionalAggregate("count",...args),
        AVERAGEIFS:(...args)=>conditionalAggregate("average",...args),
      },
      onCell:ref=>value(worksheet(ref.sheet||sheet.name),ref.row,ref.col,depth+1),
      onRange:ref=>{
        const target=worksheet(ref.sheet||sheet.name),from=ref.from,to=ref.to;
        const endRow=Math.min(to.row,target.rowCount || 1),endCol=Math.min(to.col,target.columnCount || 1);
        if((endRow-from.row+1)*(endCol-from.col+1)>100000)fail("单次范围引用超过100000个单元格。");
        const result=[];for(let row=from.row;row<=endRow;row++){const cells=[];for(let col=from.col;col<=endCol;col++)cells.push(value(target,row,col,depth+1));result.push(cells);}return result.length?result:[[null]];
      },
      onVariable:name=>fail(`不支持未定义名称 ${name}`),
    });
    let result;
    try{ result=parser.parse(formula,{sheet:sheet.name,row,col}); }
    catch(error){fail(`${sheet.name}!${cell.address}：${String(error.message||error).slice(0,160)}`);}
    finally{visiting.delete(key);}
    if(!["number","string","boolean"].includes(typeof result)||typeof result==="number"&&!Number.isFinite(result))fail(`${sheet.name}!${cell.address} 无法得到有效结果：${String(result)}`);
    if(typeof result==="string" && /^#(?:REF!|DIV\/0!|VALUE!|NAME\?|NUM!|N\/A|SPILL!)/.test(result))fail(`${sheet.name}!${cell.address} 返回 ${result}`);
    const same=typeof result==="number"&&typeof input.result==="number"?Math.abs(result-input.result)<=1e-9*Math.max(1,Math.abs(result)):result===input.result;
    if(!same)corrected++;count++;
    cell.value={formula,result};memo.set(key,result);return result;
  }
  for(const sheet of workbook.worksheets){const formulas=[];sheet.eachRow((row)=>row.eachCell(cell=>{if(cell.value?.formula)formulas.push([cell.row,cell.col]);}));for(const [row,col]of formulas)value(sheet,row,col);}
  workbook.calcProperties.fullCalcOnLoad=true;
  return {formulas:count,corrected};
}
