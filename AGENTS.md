# 项目评估平台开发进度

## 总体目标
构建通用可配置的项目经济评估平台：先做通用计算引擎和零代码领域模板，v0.1 通过工程财务评价验证（光储/数据中心/风储 3 个 Excel 模板）。

## 已完成（Tasks 1-13 + v0.2 全部 9 个 Tasks）

### 基础设施
- [1] pnpm v8 monorepo，5 个包：core, executor, backend, frontend, types（已合并到 core）
- 统一类型：`packages/core/src/types.ts`（27 测试）

### 核心引擎（packages/core）
- [2] 时间线引擎：`packages/core/src/timeline.ts`（11 测试）
- [3] 公式分词器：`packages/core/src/formula/tokenizer.ts`（23 测试）
- [4] AST 解析器：`packages/core/src/formula/parser.ts`（33 测试）
- [5] DAG 引擎 + 依赖提取：`packages/core/src/dag/engine.ts`, `dependencyExtractor.ts`（8 测试）
- [6] AST 解释器：`packages/core/src/formula/interpreter.ts`（27 测试）
- [7] 财务函数：PMT/SLN/NPV/IRR/PAYBACK/POWER/IF，`packages/core/src/formula/financialFunctions.ts`（22 测试）
- **时间偏移 `[t-1]`/`[t+1]`：`interpreter.ts` 支持 dynamic `timeExpression`；`tokenizer.ts` 支持 Number→Field 用于表码引用**

### 执行器（packages/executor）
- [8] AST→JS 编译器：`packages/executor/src/compiler/ASTCompiler.ts`（13 测试）
- [9] VM2 沙箱：`packages/executor/src/vm/SafeVM.ts`（7 测试）
- [10] 编译+VM 集成测试：`packages/executor/tests/integration.test.ts`（5 测试）
- [11] E2E 验证（3 模板）：光储/数据中心/风储，`packages/executor/tests/endToEnd.test.ts`（19 测试）

### 后端（packages/backend）
- [12] SQLite 仓库：`packages/backend/src/repository/initDb.ts`, `ModelRepository.ts`, `ResultRepository.ts`（12 测试：initDb 2 + ModelRepository 6 + ResultRepository 4）
- [13] Excel 导出：`packages/backend/src/export/ExcelExporter.ts`（9 测试）
- Fastify 服务器：`packages/backend/src/server.ts`（支持 `:memory:` 和 seeded 数据）
- 导出 API：`GET /api/models`, `GET /api/models/:id`, `GET /api/models/:id/export`
- CRUD API：`POST /api/models`, `PUT /api/models/:id`, `DELETE /api/models/:id`
- **计算 API：`POST /api/models/:id/compute`（DAG → ASTCompiler → VM2）**
  - 支持 `参数.名称` 引用（Stage 1）：`ComputeService` 注入 `ctx.参数` 命名空间
  - 支持派生参数计算（Stage 2）：参数级 DAG 拓扑排序，`formula` 仅允许引用其他参数
  - `ModelRepository` 完整读写 `parameters.formula` 列
- 导出 API 集成测试：`packages/backend/tests/exportApi.test.ts`（6 测试）
- CRUD API 集成测试：`packages/backend/tests/api.test.ts`（5 测试）
- **计算 API 集成测试：`packages/backend/tests/computeApi.test.ts`（6 测试）**
- **E2E 验证时间偏移：`cumsum-test` 模型验证 `合计[t-1] + 当年[t]` 累积求和**

### 前端（packages/frontend）
- 骨架：React + Vite
- **v0.2 Model Definer UI（完整实现）：**
  - `App.tsx` → `ModelWorkspace` 三栏布局（模型列表 | 编辑区）
  - `hooks/useApi.ts`：REST API 封装（get/post/put/delete）
  - `types/workspace.ts`：`useReducer` 状态管理（WorkspaceState / Action）
  - `components/ModelListPanel.tsx`：左栏模型列表（新建/打开/删除）
  - `editor/ModelWorkspace.tsx`：核心编排组件（加载/保存/计算/导出）
  - `editor/ParameterEditor.tsx`：参数卡片列表（CRUD，支持 6 种类型）
  - `editor/TimelineEditor.tsx`：时间线 3 个 input（建设期/运营期/起始年份）
  - `components/TableNavigator.tsx`：表标签栏（新建/切换/重命名/删除）
  - `components/CellGrid.tsx`：单元格表格（inline edit，名称/类型/单位/公式/默认值/数组标记）
  - `components/FormulaEditor.tsx`：轻量级公式自动补全（表名. 提示单元格 + **参数. 提示参数名**）
  - `editor/ModelToolbar.tsx`：顶部工具栏（保存并计算 / 导出 Excel / 验证）
  - `components/ComputePreview.tsx`：计算结果摘要（成功/错误数/耗时）
  - `components/ValidationPanel.tsx`：校验错误列表（空名称/公式格式/DAG 循环）
- 测试：`packages/frontend/tests/*.test.tsx`（9 测试）

## 总测试数
**25 测试文件，311 测试通过**

## 语言偏好
- **所有交流使用中文（简体）**，包括代码注释、commit message、文档更新。
- 用户指令以中文为准。

## v0.3 子级指标与编码体系 (已完成)
- 编码引擎: `packages/core/src/utils/coding.ts` — `recomputeCodes` / `getCodeDepth` / `generateSummaryFormula` / `adjustIndentation` (20 测试)
- 类型扩展: `CellDefinition` 新增 `code` / `parentId` / `sortOrder`
- DB schema: `cells` 表新增 `code TEXT`, `parent_id TEXT`, `sort_order INTEGER`
- 后端 CRUD: `ModelRepository` 读写新增字段，`findCellsByModel` 按 `sort_order` 排序
- 计算层: `ComputeService.getCell()` / `getCellArray()` 增加 code fallback（先匹配 name，再匹配 code）
- UI 改造: `TableExcelView` 新增
  - 编码列 (sticky, 显示/折叠展开)
  - 名称列层级缩进 (`(depth-1)*16px`)
  - 缩进/反缩进按钮 (→ / ←)
  - Σ 一键生成子级汇总公式
  - 折叠展开 (▶/▼) 控制行可见性

## 当前阻塞
- (无)
