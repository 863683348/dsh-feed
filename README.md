# dsh-feed — 跨生态聚合底座（"聚合的聚合"）

不直接做 UI，做**开放数据层**：把 GitHub `dsh-plugin` topic 和 npm registry 归一化成一份开放 JSON 索引，交给任何 Agent / CLI / MCP / 未来 UI 消费。你的插件只做"同步 + 查询"——别人基于这份数据再建 UI。

## 为什么需要它

- 现有市场各自抓数据、各自维护，闭源且重复。`dsh-feed` 成为**数据源**：同步一次，全生态可查。
- 一个插件，三种消费面：
  - **模型工具**：`feed_sync` / `feed_search` / `feed_stats`
  - **CLI**：`dsh-feed sync|search|stats|mcp`
  - **MCP server**（实验性）：任何 MCP 客户端（Cursor、Claude Desktop…）都能查
- 索引是**开放 JSON 文件**（默认 `.dsh/dsh-feed.json`），明文、可 diff、可被任何工具读。

## 安装

```bash
dsh plugin --profile <profile> add dsh-feed
# 或只用 CLI（npm 全局）：npm i -g dsh-feed
```

## 用法

### 模型侧

| 工具 | 说明 |
| --- | --- |
| `feed_sync` | 拉取 GitHub topic + npm → 写索引（需网络） |
| `feed_search` | 自然语言查索引（英文词 + 中文 2-gram） |
| `feed_stats` | 索引统计：总数、来源、热门 topic、npm 覆盖 |

### CLI

```bash
dsh-feed sync                      # 同步（可选 GITHUB_TOKEN 提升限额）
dsh-feed search "移动端 远程"      # 查询
dsh-feed stats
dsh-feed mcp                       # 极简 stdio MCP server（实验性）
```

### MCP 配置示例（任意 MCP 客户端）

```json
{ "mcpServers": { "dsh-feed": { "command": "dsh-feed", "args": ["mcp"] } } }
```

## 索引格式（开放数据层）

```json
{
  "updated": "2026-08-16T...",
  "sources": { "github": 200, "npm": 180 },
  "count": 380,
  "plugins": [
    { "name": "owner/repo", "url": "...", "description": "...", "stars": 42, "topics": ["dsh-plugin", "notify"], "npmName": "dsh-xxx" }
  ]
}
```

## 设计

- `lib/sync.js` — 抓取 + 归一化（GitHub search API + npm search API，可注入 token）。
- `lib/query.js` — 纯查询逻辑（分词/评分/统计），零依赖可单测。
- `lib/index-store.js` — 索引文件读写（相对路径 + 防逃逸校验）。
- `bin/dsh-feed.js` — CLI + 极简 stdio MCP server（JSON-RPC 2.0）。
- **安全**：索引只写会话工作区内的 `.dsh/`；网络请求仅发生在 `feed_sync`（显式触发）。

## Roadmap

- 每小时定时同步（`dsh-schedule` 接入）。
- Web API 只读端点 + 更完整的 MCP 工具（分页/过滤/详情）。
- 与 dsh-need-finder / dsh-recipe 共享同一数据层（去重复抓取）。

## 测试

```bash
node test/feed.test.mjs
```

## License

MIT
