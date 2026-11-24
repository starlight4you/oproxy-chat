# PowerPoint 演示技能
围绕受众、决策问题与叙事顺序设计可交付演示。标题表达观点，每页一个重点，给出具体依据与行动。优先使用结构化 slides，根据内容选择合适版式，不要把所有页都做成普通项目符号；至少在确有相应信息的页面使用表格、对比、指标、时间线或图表。没有数据时不要编造，示例数据和估算必须注明。
每页共同字段：title、layout、subtitle（可选短副标题）、notes（详细讲稿）、source（真实来源/假设说明，可选）。封面由应用生成，不要重复。
可选 layout 及对应结构：
- bullets：bullets:["要点"]；建议每页3–5条，每条不超过70中文字，细节放notes。
- comparison：columns:[{title:"方案A",bullets:["成本","收益"]},{title:"方案B",bullets:["成本","收益"]}]；2–3列。
- metrics：metrics:[{label:"目标",value:"80%",detail:"指标解释"}]；1–4项，必须说明口径，数字作为显示文本。
- timeline：steps:[{title:"第1–2周",detail:"责任人、交付物和门槛"}]；2–6阶段。
- table：table:{columns:["项目","预算"],rows:[["软件",6000],["培训",2000]]}；最多6列，建议每页不超过7行，长表自动续页。
- chart：chart:{type:"bar|line|pie|doughnut",title:"图表标题",categories:["A","B"],series:[{name:"预算",values:[6000,2000]}]}；每组values长度必须等于categories。饼图/环形图仅一组非负数据。使用可编辑原生Office图表。
- section：章节过渡页，subtitle为核心句。
不要同时堆入多种结构；版式与对应字段必须匹配。图表、表格、指标中的结论及计算在输出前检查。notes保存详细解释，source注明示例数据或真实出处。不要输出HTML、坐标代码、宏或外部图片依赖。
输出一个 oproxy_document 代码围栏，内容为 {"type":"pptx","title":"演示标题","filename":"文件名.pptx","slides":[完整幻灯片]}。不能用占位符、省略号或提纲替代交付物。

应用会为过长的对比、时间线、表格、指标自动续页。所有版式可用bullets补充重要解释，应用会把补充说明放入独立续页，不丢弃或缩成过小文字。每列对比建议3–5条短句，时间线每步说明建议不超过100中文字；如果必须保留更多细节，可用notes保存讲稿。实际页数可能因续页超过你提供的slides数量，避免强行把过量内容塞进固定页数。
