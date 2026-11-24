import test from "node:test";
import assert from "node:assert/strict";
import {paginateSlides} from "../src/documents/presentation-plan.js";

test("Rich slide commentary is retained as visible continuation pages",()=>{
  const slide={title:"图表结论",layout:"chart",chart:{type:"bar",categories:["A"],series:[{name:"量",values:[1]}]},bullets:["必须保留的解释","数字基于示例假设"],notes:"详细讲稿",source:"内部示例"};
  const pages=paginateSlides([slide]);assert.equal(pages.length,2);assert.equal(pages[0].layout,"chart");assert.equal(pages[1].layout,"bullets");
  assert.deepEqual(pages[1].bullets,slide.bullets);assert.equal(pages[1].notes,slide.notes);assert.equal(pages[1].source,slide.source);
});
test("Long comparisons paginate every column without losing or duplicating text",()=>{
  const columns=Array.from({length:3},(_,i)=>({title:`方案${i}`,bullets:Array.from({length:6},(_,j)=>`第${i}列第${j}条`+"实施要求与具体交付证据".repeat(15))}));
  const pages=paginateSlides([{title:"对比",layout:"comparison",columns,notes:"备注"}]);
  assert.ok(pages.length>2);
  columns.forEach((col,i)=>assert.equal(pages.map(p=>p.columns[i].bullets.join("")).join(""),col.bullets.join("")));
  assert.ok(pages.every(p=>p.notes==="备注"));
});
test("Long tables and timeline steps preserve complete content through continuation",()=>{
  const table={columns:["角色","责任","证据"],rows:[["测试角色","复杂责任".repeat(100),"完整证据".repeat(60)],["第二角色","短说明","证据"]]};
  const pages=paginateSlides([{title:"长表",layout:"table",table}]);assert.ok(pages.length>1);
  for(let c=0;c<3;c++)assert.equal(pages.flatMap(p=>p.table.rows.map(r=>String(r[c]))).join(""),table.rows.map(r=>String(r[c])).join(""));
  const steps=Array.from({length:6},(_,i)=>({title:`阶段${i}`,detail:`第${i}阶段`+"负责人须核验输入与输出证据".repeat(20)}));
  const timeline=paginateSlides([{title:"时间线",layout:"timeline",steps}]);assert.ok(timeline.length>2);
  assert.equal(timeline.flatMap(p=>p.steps).map(s=>s.detail).join(""),steps.map(s=>s.detail).join(""));
  assert.ok(timeline.every(p=>p.steps.length<=3));
});
