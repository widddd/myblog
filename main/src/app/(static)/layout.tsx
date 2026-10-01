/**
 * 静态页面路由组的壳。
 *
 * 静态页是管理员自定义的独立页面，不套站点页头/页脚。但 Next 里 `RootLayout` 已经在最外层
 * 渲染了 `SiteHeader` / `Footer`，而**父布局无法被嵌套布局卸载**——所以这里用一段作用域内联样式
 * 把这三块（页头、手机抽屉、页脚）藏掉，并复位正文的上下留白。样式只在静态页这一棵子里生效：
 * 选择器带 `.static-page-shell` 前缀，其余页面 DOM 里没有这个类。
 *
 * 为什么不改 `RootLayout` 把页头挪进路由组：那要动全站每个路由的文件位置，收益与风险不成比例。
 *
 * 顺带说明：`NavigationProgress`（顶栏 2px 进度条）与 `TransferHud`（传输进度）是固定定位的
 * 浮层，只在有导航/上传时短暂出现，不清除——站内跳转时它们本来就该照常工作。
 */
export default function StaticPagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="static-page-shell">
      <style>{`
        body:has(.static-page-shell) .site-navbar,
        body:has(.static-page-shell) .mobile-drawer,
        body:has(.static-page-shell) .site-footer { display: none !important; }
        body:has(.static-page-shell) { padding-top: 0 !important; }
      `}</style>
      {children}
    </div>
  );
}
