# API 契约

统一错误与后续业务入口见 `docs/product.md` 第 6 节。已实现：

- `GET /api/healthz`：200，`{"status":"ok"}`，只检查 Web 进程。
- `GET /api/readyz`：数据库可连接时 200，`{"status":"ready","database":true}`；不可连接时 503，`{"status":"unavailable","database":false}`。
- `GET /api/me`：需要会话，返回 `{user:{id,name,email,role}}`；未登录返回 401 与统一错误结构。忽略客户端传入的用户 ID。
- `/api/auth/*`：Better Auth 会话接口。支持邮箱密码登录、退出及管理员创建受邀用户；公开注册返回 400。认证写入请求校验 Origin，普通用户调用管理员创建接口返回 403。详细请求结构遵循项目锁定的 Better Auth 版本。

业务路由在对应任务实现，不把尚未实现的接口声明为可用。
