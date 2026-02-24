# 全能记账台

一个可直接离线使用的 PWA 记账应用（数据保存在浏览器 `localStorage`）。支持安装到手机桌面，体验接近原生 APP。

## 已实现功能

- 收入 / 支出 / 转账 三种交易类型
- 多账户管理（期初余额 + 实时结余）
- 收支分类管理
- 交易流水：新增、编辑、删除、筛选、关键词搜索
- 预算管理：按月 + 分类，实时预算执行率
- 统计分析：近 6 个月收支趋势、本月支出分类占比
- 数据导出：JSON 备份、CSV 交易导出
- 数据导入：JSON 恢复
- PWA：可安装到手机/电脑桌面，支持离线访问（已接入 `manifest + service worker`）

## 本地使用

1. 直接双击 `index.html` 在浏览器打开。
2. 或使用任意静态服务器在项目目录启动后访问页面（推荐，便于测试 PWA）：  
   `python -m http.server 8080`

## 发给别人能打开（推荐方式）

1. 把整个项目目录部署到任意 HTTPS 静态托管（GitHub Pages / Netlify / Vercel / Cloudflare Pages 都行）。
2. 把生成的 HTTPS 链接发给别人。
3. 对方手机打开后可“添加到主屏幕”安装为 APP；桌面浏览器可点击页面右上角“安装 APP”。

说明：
- 必须是 `HTTPS`（或 `localhost`）才能显示安装能力。
- 如果只把单个 `index.html` 发给别人，会缺少图标/缓存文件，建议发整个目录或发部署链接。

## GitHub Pages 一键发布

项目已内置自动发布工作流：`.github/workflows/deploy-pages.yml`。

1. 新建 GitHub 仓库并把当前项目推送到 `main` 分支。
2. 打开仓库 `Settings -> Pages -> Build and deployment`。
3. `Source` 选择 `GitHub Actions`。
4. 等待仓库 `Actions` 里的 `Deploy To GitHub Pages` 执行完成。
5. 访问链接：`https://<你的GitHub用户名>.github.io/<仓库名>/`。

之后每次你 `git push`，网站会自动更新。

## 文件结构

- `index.html`：页面结构
- `styles.css`：样式
- `app.js`：业务逻辑与数据持久化
- `app.webmanifest`：PWA 安装配置
- `sw.js`：离线缓存
- `icons/`：APP 图标
