# Mini Arcade · 迷你游戏站

纯静态页面：扫雷、弹珠台、纸牌（克朗代克）、贪吃蛇。可直接托管在 **GitHub Pages**，无需构建。

## 本地预览

用任意静态服务器打开项目根目录（双击 `index.html` 在部分浏览器下 ES 模块可能被拦截，建议用本地服务器）：

```bash
cd mini-games-site
python3 -m http.server 8080
```

浏览器访问：<http://127.0.0.1:8080>

## 部署到 GitHub Pages

1. 在 GitHub 新建仓库（例如 `mini-games-site`），不要勾选添加 README（本仓库已有文件）。
2. 在项目目录执行：

```bash
cd mini-games-site
git init
git add .
git commit -m "Initial mini arcade site"
git branch -M main
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

3. 打开仓库 **Settings → Pages**：
   - **Source** 选 **Deploy from a branch**
   - **Branch** 选 `main`，文件夹选 **`/ (root)`**
   - 保存后等待一两分钟，站点地址为：  
     `https://<你的用户名>.github.io/<仓库名>/`

若仓库名为 `<用户名>.github.io` 且放在根目录，则站点为 `https://<用户名>.github.io/`。

## 项目结构

```
mini-games-site/
├── index.html
├── css/style.css
├── js/app.js
├── js/snake.js
├── js/minesweeper.js
├── js/pinball.js
└── js/solitaire.js
```

## 许可

仅供学习与个人使用，随意修改。
