// Real-model acceptance corpus. The harness must assert Oproxy gpt-6.1-sol
// before submission; no fixed/mock output is used to satisfy these cases.
export const acceptanceCases=[
  {id:"chat",prompt:"这是安装版普通聊天验收。请用中文简洁说明团队交接时为什么需要验证接收方能独立操作，三句话即可，不生成文件。",format:null,checks:["普通聊天可读","不自动生成文档"]},
  {id:"docx",format:"docx",filename:"Final61_团队交接.docx",prompt:"生成一份中文Word《团队知识交接实施方案》，约1000字，面向10人团队。包含摘要、责任矩阵表、五日计划、两段引用、带勾选状态的交付清单、风险和验收标准。所有计划写成建议或假设，不能伪造已完成状态。文件名Final61_团队交接.docx。无需提问。",checks:["完整正文与结尾","原生表格","引用两段","任务状态","App内预览"]},
  {id:"pdf",format:"pdf",filename:"Final61_交付检查.pdf",prompt:"生成中文PDF《团队文档交付检查表》，约700字，可直接打印。包含适用范围、核对步骤、两张表格（检查项/证据/结果和整改事项/负责人/期限/复核）、签字区。姓名和日期等填写位置使用________，不得预填验收通过。文件名Final61_交付检查.pdf。无需提问。",checks:["PDF完整页","表格及填写线","结尾签字","App内预览"]},
  {id:"xlsx",format:"xlsx",filename:"Final61_培训预算.xlsx",prompt:"生成Excel《季度培训预算》，三张表：假设、明细、汇总。明细8项示例培训，含部门、人数、单价、预算、实际、差额和执行率；汇总按部门用SUMIF或SUMIFS计算，预算上限跨表引用，用IF显示预算状态。金额两位小数、百分比格式正确。示例数据明确标注，不冒充真实业务。文件名Final61_培训预算.xlsx。无需提问。",checks:["三工作表","数字类型","跨表公式独立重算","金额和百分比格式","App内预览"]},
  {id:"pptx",format:"pptx",filename:"Final61_交付汇报.pptx",prompt:"制作中文PPT《团队知识交接交付汇报》，封面外6个逻辑页：关键指标、两方案对比、五日时间线、交付验收表、预算柱状图、下一步。预算示例软件3000、培训2000、整理4000、预备费900元，明确假设且图表合计正确。各页有详细演讲备注，对比/表格/图表页各附2条bullets重要解读，必须可见保留，允许自动续页。文件名Final61_交付汇报.pptx。无需提问。",checks:["多版式","全部说明可见","可编辑图表与预览","讲稿","App内预览"]},
];
