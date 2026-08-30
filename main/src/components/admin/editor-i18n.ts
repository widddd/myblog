type Interpolations = Record<string, string | number>;

const ZH: Record<string, string> = {
  "toolbar.blockTypes.paragraph": "正文",
  "toolbar.blockTypes.quote": "引用",
  "toolbar.blockTypes.heading": "标题 {{level}}",
  "toolbar.blockTypeSelect.placeholder": "段落样式",
  "toolbar.blockTypeSelect.selectBlockTypeTooltip": "选择段落样式",
  "toolbar.undo": "撤销 {{shortcut}}",
  "toolbar.redo": "重做 {{shortcut}}",
  "toolbar.bold": "加粗",
  "toolbar.removeBold": "取消加粗",
  "toolbar.italic": "斜体",
  "toolbar.removeItalic": "取消斜体",
  "toolbar.underline": "下划线",
  "toolbar.removeUnderline": "取消下划线",
  "toolbar.bulletedList": "无序列表",
  "toolbar.numberedList": "有序列表",
  "toolbar.checkList": "任务列表",
  "toolbar.link": "插入链接",
  "toolbar.table": "插入表格",
  "toolbar.thematicBreak": "插入分隔线",
  "toolbar.codeBlock": "插入代码块",
  "toolbar.richText": "可视化",
  "toolbar.source": "Markdown 源码",
  "toolbar.diffMode": "对比",
  "createLink.url": "链接地址",
  "createLink.urlPlaceholder": "粘贴或输入网址",
  "createLink.text": "显示文字",
  "createLink.title": "标题",
  "createLink.saveTooltip": "保存链接",
  "createLink.cancelTooltip": "取消",
  "dialogControls.save": "保存",
  "dialogControls.cancel": "取消",
  "linkPreview.edit": "编辑链接",
  "linkPreview.remove": "移除链接",
  "linkPreview.copyToClipboard": "复制链接",
  "linkPreview.copied": "已复制",
  "codeBlock.language": "代码语言",
  "codeBlock.selectLanguage": "选择代码语言",
  "codeBlock.inlineLanguage": "语言",
  "codeblock.delete": "删除代码块",
  "table.deleteTable": "删除表格",
  "table.columnMenu": "列菜单",
  "table.rowMenu": "行菜单",
  "table.alignLeft": "左对齐",
  "table.alignCenter": "居中",
  "table.alignRight": "右对齐",
  "table.insertColumnLeft": "左侧插入列",
  "table.insertColumnRight": "右侧插入列",
  "table.deleteColumn": "删除此列",
  "table.insertRowAbove": "上方插入行",
  "table.insertRowBelow": "下方插入行",
  "table.deleteRow": "删除此行",
  "contentArea.editableMarkdown": "文章正文",
};

export function editorZhTranslation(
  key: string,
  defaultValue: string,
  interpolations: Interpolations = {},
) {
  let value = ZH[key] ?? defaultValue;
  for (const [name, interpolation] of Object.entries(interpolations)) {
    value = value.replaceAll(`{{${name}}}`, String(interpolation));
  }
  return value;
}
