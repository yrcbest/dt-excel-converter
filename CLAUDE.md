# dt-excel-converter

UE DataTable ↔ Excel 双向转换网页工具。纯浏览器端运行，无需后端。

## 技术栈

- 语言：TypeScript
- 构建：Vite
- 核心库：xlsx (SheetJS) — Excel 读写
- 样式：无框架，纯 CSS

## 核心功能

1. Excel → UE DataTable（CSV/JSON 格式导出）
2. UE DataTable（CSV/JSON）→ Excel
3. 列类型映射（int32 / float / FName / FText / FVector 等 UE 类型 ↔ Excel 列格式）

## 目录结构

```
src/
  index.html
  main.ts         入口
  converter/      转换核心逻辑
    excel-to-dt.ts
    dt-to-excel.ts
    types.ts      类型定义
  ui/             界面
    app.ts        主界面
  utils/
    parser.ts     CSV/JSON 解析
```

## 启动

```bash
cd dt-excel-converter
npm install
npm run dev
```

## 发布

```bash
npm run build
dist/ 目录为纯静态文件，可部署到任何静态托管服务
```

## 设计决策记录

- 不依赖 UE 编辑器或 SDK，纯数据格式层面的转换
- 使用 xlsx 库（SheetJS Community Edition）处理 Excel，无需后端服务
- 导出格式同时支持 CSV（UE 原生）和 JSON（UE 通用格式）
