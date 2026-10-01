# API 契约

统一错误与后续业务入口见 `docs/product.md` 第 6 节。T001 已实现：

- `GET /api/healthz`：200，`{"status":"ok"}`，只检查 Web 进程。
- `GET /api/readyz`：数据库可连接时 200，`{"status":"ready","database":true}`；不可连接时 503，`{"status":"unavailable","database":false}`。

业务路由在对应任务实现，不把尚未实现的接口声明为可用。
