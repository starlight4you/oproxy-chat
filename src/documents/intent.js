// Shared by the main-process injection bundle and tests. No DOM or model calls.
// A document mention alone is not a request to create a deliverable.
export function classifyDocumentIntent(text, previousType = null) {
  const value=String(text||"").trim();
  const types=[[/\b(?:docx|word)\b|\.docx\b/i,"docx"],[/\bpdf\b|\.pdf\b/i,"pdf"],[/\b(?:xlsx|excel)\b|电子表格|工作簿/i,"xlsx"],[/\b(?:pptx?|powerpoint)\b|幻灯片|演示文稿/i,"pptx"]];
  const type=types.find(([pattern])=>pattern.test(value))?.[1]||null;
  const prior=/^(docx|pdf|xlsx|pptx)$/.test(previousType||"")?previousType:null;
  const discussion=/^(?:请|帮我|能否|可以|想了解|我想知道|please\s+)*(?:解释|讲解|说明|分析|比较|讨论|介绍|如何|怎么|为什么|什么是|explain\b|describe\b|what\b|why\b|how\b|compare\b)/i.test(value);
  const negative=/(?:不用|不要|无需|不需要|不必|先别|别再).{0,3}(?:修改|调整|重写|生成|转换)|(?:do not|don't|no need to).{0,6}(?:revise|modify|change|generate|create)/i.test(value);
  const explicitlyNoFile=/(?:不用|不要|无需|不需要|不必|先别|别再)[^。！？；\n]{0,8}(?:生成|制作|创建|输出|导出|下载|文件|文档)|(?:do not|don't|no need to).{0,16}(?:create|generate|export|make|file|document)/i.test(value);
  if(!value||explicitlyNoFile)return {create:false,type:null};
  const delivery=/生成|制作|创建|完成|成稿|导出|下载|保存为|做(?:一|个|份)|写(?:一|个|份)|撰写|整理成|转(?:成|为)|改(?:成|为)|输出|(?:再|另)?给(?:我)?(?:一|个|份)|create\b|generate\b|export\b|download\b|make\b|write\b|save as\b|convert\b/i.test(value);
  const artifact=type||/文档|报告|表格|演示|简历|合同|方案|手册|清单|文件|document\b|report\b|spreadsheet\b|presentation\b|slides\b|proposal\b|resume\b|checklist\b/i.test(value);
  const revision=/修改|改成|改为|调整|补充|扩写|精简|压缩|润色|重写|重新生成|再.{0,12}(?:详细|具体|简短|简洁|增加)|增加|加一(?:列|行|页)|删(?:掉|除)|去掉|替换|合并|第二|第三|标题|字体|字号|排版|更详细|更简洁|revise\b|update\b|expand\b|shorten\b|rewrite\b|change\b|add\b|remove\b|more detail/i.test(value);
  const bareFormat=!!type&&/^(?:再|另|换|要|请|给|一个|一份|给我|也|用|为|版|格式|版本|导出|转成|改成|保存|做|\s|[.,!，。！])*$/i.test(value.replace(types.find(([p])=>p.test(value))?.[0]||/$^/,""));
  const create=!!((delivery&&artifact&&!explicitlyNoFile&&!discussion)||(!discussion&&!negative&&bareFormat)||(prior&&!discussion&&!negative&&revision));
  return {create,type:create?(type||prior):null};
}
