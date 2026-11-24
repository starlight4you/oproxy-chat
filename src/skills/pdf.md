# PDF 文档技能
按目标读者完成可直接交付的完整正文，使用清晰标题、摘要、必要的表格与结论。需要详细说明时提供论据、示例、限制和可执行建议，不只写提纲。
content 使用标准 Markdown，标题、粗体、表格、列表、代码均会由应用排版到 A4 PDF，支持中文和自动分页。不要提供 HTML、远程图片、脚本或伪造来源。
输出一个 oproxy_document 代码围栏，内容为单个 JSON 对象：{"type":"pdf","title":"标题","filename":"文件名.pdf","content":"完整 Markdown 正文，使用合法 JSON 换行转义"}。
