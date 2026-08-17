# dsh-feed — 跨生态聚合底座

开放数据层：GitHub `dsh-plugin` topic + npm registry → 一份开放 JSON 索引，供模型工具 / CLI / MCP / 未来 UI 消费。"聚合的聚合"——成为数据源，不做 UI。

## 用法

- 模型工具：`feed_sync`（同步）、`feed_search`（自然语言查询）、`feed_stats`（统计）
- CLI：`dsh-feed sync|search|stats|mcp`
- MCP：任意 MCP 客户端配置 `{ "command": "dsh-feed", "args": ["mcp"] }`

索引为开放 JSON（默认 `.dsh/dsh-feed.json`），明文可 diff，任何工具可读。

## 设计

`lib/sync.js` 抓取归一化；`lib/query.js` 纯查询逻辑；`lib/index-store.js` 索引读写（防逃逸）；`bin/dsh-feed.js` CLI + 极简 MCP。安全：仅写工作区 `.dsh/`，网络仅在显式 `feed_sync` 时发生。

## License

MIT
