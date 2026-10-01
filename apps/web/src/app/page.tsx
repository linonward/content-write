const apiOrigin = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function Home() {
  return (
    <main className="shell">
      <div className="masthead">
        <span className="mark">文</span>
        <span>公众号内容工作台</span>
      </div>
      <section className="intro">
        <p className="stage">基础工程 · T001</p>
        <h1>从自己的素材，写出自己的文章。</h1>
        <p className="lead">
          项目基础服务已搭建。邀请登录、素材箱和写作流程将在后续任务逐步开放。
        </p>
      </section>
      <section className="status" aria-labelledby="status-heading">
        <div>
          <h2 id="status-heading">当前可用</h2>
          <p>服务状态与开发入口</p>
        </div>
        <div className="status-links">
          <a href={`${apiOrigin}/api/healthz`}>API 健康检查</a>
          <a href={`${apiOrigin}/api/readyz`}>数据库就绪检查</a>
        </div>
      </section>
      <p className="note">尚未开放账号注册或文章生成。</p>
    </main>
  );
}
