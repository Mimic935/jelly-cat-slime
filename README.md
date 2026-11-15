# jelly-cat-slime

「果冻！史莱姆」的 GitHub Pages 版。创作台支持果冻猫、果冻鼠、互动音效、HSV 选色、彩绘和 JSON 保存导入。

## 本地运行

使用 Node.js 24 或更新版本。在仓库根目录运行 `node src/build.mjs` 生成 `index.html`。给服务进程设置私密的 `REVIEW_PASSWORD` 后运行 `node src/server.mjs`。访问 `http://127.0.0.1:8789/`，审核入口是同地址的 `/#review`。

## 连接线上展厅

1. 在访客能访问的主机上运行后端，配置 HTTPS。反向代理到默认的 `127.0.0.1:8789`，设置 `GALLERY_PUBLIC_URL` 为实际 HTTPS 地址，并在主机的私密配置里设置 `REVIEW_PASSWORD`。
2. 把 `GALLERY_DB` 指向持久磁盘上的 SQLite 文件，定期备份。部署在正确传递访客地址的同机反向代理之后时可设置 `GALLERY_TRUST_PROXY=1`。
3. 把后端的 HTTPS 源（例如 `https://gallery.example.com`）填到根目录 `gallery-config.js`，然后发布到 GitHub Pages。搬到自定义 Pages 域名时，把后端的 `GITHUB_PAGES_ORIGIN` 改成对应的源。
4. 用后端地址的 `/#review` 登录审核。访客在 Pages 中提交作品，批准后会出现在对应展区。

数据库和后端环境变量留在主机上。GitHub Pages 的构建文件可以公开访问。
