# 项目经济评估平台

通用可配置的项目经济评估平台，支持零代码构建财务评价模型。已通过光储、数据中心、风储 3 个 Excel 模板的工程财务评价验证。

## 技术栈

### 架构

- **Monorepo**：pnpm v8 workspaces
- **核心包**：
  - `core`：公式引擎 + DAG + 财务函数 + 编码体系
  - `executor`：AST→JS 编译器 + VM2 沙箱执行
  - `backend`：Fastify + SQLite 仓库 + Excel 导出
  - `frontend`：React + Vite

### 技术选型

| 层级       | 技术                                      |
|-----------|------------------------------------------|
| 计算引擎   | 自定义 AST 解释器 + DAG 拓扑排序          |
| 沙箱执行   | VM2                                      |
| 后端服务   | Fastify (Node.js)                        |
| 数据存储   | SQLite（支持 `:memory:` 模式）           |
| 前端框架   | React 18 + Vite                          |
| 公式编辑   | 自定义 Tokenizer + 自动补全               |
| 测试框架   | Vitest                                   |

## 安装步骤

### 前置要求

- Node.js >= 18
- pnpm v8

### 开发环境

```bash
# 1. 克隆仓库
git clone <仓库地址>
cd Economic_Appraisal

# 2. 安装依赖
pnpm install

# 3. 启动后端服务（默认端口 3001）
pnpm server

# 4. 启动前端开发服务器（默认端口 5173）
pnpm dev

# 5. 运行全部测试
pnpm test
```

### 生产构建

```bash
pnpm build
```

前端构建产物位于 `packages/frontend/dist/`，后端构建产物位于 `packages/backend/dist/`。

## 功能列表

- **时间线引擎**：支持建设期、运营期、起始年份的灵活配置
- **零代码公式编辑**：支持 `PMT`、`SLN`、`NPV`、`IRR`、`PAYBACK`、`POWER`、`IF` 等财务函数
- **时间偏移**：支持 `[t-1]` / `[t+1]` 等时间表达式
- **子级指标编码体系**：层级缩进 + 自动汇总（Σ）功能
- **DAG 依赖解析**：自动拓扑排序，确保计算顺序正确
- **参数树编辑器**：右键复制并插入、同父节点同名检测
- **多表表格视图**：编码列显示、行级折叠展开
- **计算预览**：实时展示计算成功数、错误数与耗时
- **Excel 导入 / 导出**：支持模型数据和计算结果导出为 Excel

## API 文档摘录

### 模型 CRUD

| 方法   | 路径                    | 说明               |
|-------|------------------------|-------------------|
| GET   | `/api/models`          | 获取模型列表        |
| GET   | `/api/models/:id`      | 获取模型详情        |
| POST  | `/api/models`          | 创建新模型          |
| PUT   | `/api/models/:id`      | 更新模型（计算也走此接口） |
| DELETE| `/api/models/:id`      | 删除模型            |

### 计算与导出

| 方法   | 路径                          | 说明                         |
|-------|------------------------------|-----------------------------|
| POST  | `/api/models/:id/compute`    | 执行计算（DAG → ASTCompiler → VM2） |
| GET   | `/api/models/:id/export`     | 导出模型为 Excel 文件        |

## 测试覆盖

- **25** 个测试文件，**311+** 测试通过
- **E2E 验证**：光储 / 数据中心 / 风储 3 个完整模板

各包测试分布：

| 包        | 测试文件 | 说明                       |
|----------|---------|---------------------------|
| core     | 12      | 公式引擎、DAG、编码、复制等  |
| backend  | 3       | 仓库、Excel 导出、计算 API   |
| frontend | 1       | 组件渲染测试                 |

运行单包测试：

```bash
pnpm --filter core test
pnpm --filter backend test
pnpm --filter frontend test
```

## 数据管理

### 自动初始化

首次启动后端服务（`pnpm server`）时，若 `data.db` 不存在或为空，系统会自动从 `packages/backend/src/seed.ts` 注入演示模型。

> `data.db` 为 SQLite 二进制文件，已列入 `.gitignore`，**请勿直接提交到版本控制**。

### 导出种子

当你通过前端界面修改了模型数据并保存到 `data.db` 后，需要导出为种子文件以便团队同步：

```bash
npx tsx packages/backend/src/scripts/exportSeed.ts
```

这会读取 `data.db` 中的"测试模型-副本"，更新 `packages/backend/src/seed.ts`。随后提交此文件即可：

```bash
git add packages/backend/src/seed.ts
git commit -m "data: 更新种子数据"
git push
```

### 手动恢复

如果本地 `data.db` 损坏或需要重置：

```bash
# 删除现有数据库文件
rm data.db data.db-*

# 重新启动后端，自动从 seed.ts 重建
pnpm server
# 控制台会输出：[seed] seeded model ... on fresh file DB
```

> 生产环境建议定期备份 `data.db` 与 `backups/` 目录。

## 项目结构

```
Economic_Appraisal/
├── packages/
│   ├── core/           # 核心引擎（公式解析、DAG、财务函数）
│   ├── executor/       # AST 编译器 + VM2 沙箱
│   ├── backend/        # Fastify 后端（SQLite + Excel 导出）
│   └── frontend/       # React + Vite 前端
├── data.db             # SQLite 数据库文件
├── pnpm-workspace.yaml
└── package.json
```

## License

待指定
