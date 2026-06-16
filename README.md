# 回声岛社交小程序

## 🛠 技术栈
- Frontend: 微信小程序原生框架 (WXML + WXSS + JS)
- Backend: Node.js + Express + Mongoose ORM
- Database: MongoDB 7.0
- Realtime: WebSocket (`ws`)

## 🚀 启动指南 (How to Run)
1. 确保 Docker Desktop 已启动。
2. 在 `label-223` 目录执行：`docker compose up --build`
3. 等待容器启动完成，`seed` 容器会自动写入演示数据。
4. 小程序端在微信开发者工具导入 `label-223/miniprogram`。
5. 微信开发者工具中勾选“不校验合法域名”，即可连接本地后端。

## 🔗 服务地址 (Services)
- Backend API: http://localhost:8223
- Health Check: http://localhost:8223/health
- WebSocket: ws://localhost:8223/ws
- MongoDB: localhost:27223

## 👤 账号体系
- 后端已启用账号唯一校验、密码哈希存储和 JWT 鉴权。
- `seed` 容器启动时会自动写入演示账号与社区数据，可直接登录体验。
- 也可在小程序登录页自行注册新账号。

### 预置演示账号

| 账号 | 密码 | 昵称 | 说明 |
|------|------|------|------|
| `fogdao` | `password1` | 雾岛慢声 | 月度会员，含收藏、私人小组、私信会话 |
| `tide_writer` | `password1` | 潮汐写作者 | 与雾岛慢声有进行中私信，可体验身份揭示 |
| `lowfreq_fan` | `password1` | 低频乐器控 | 普通用户，已发布音乐类频率 |
| `calm_asker` | `password1` | 沉静提问者 | 普通用户，已发布阅读类频率 |
| `admin` | `password1` | 回声岛管理员 | 管理员账号，登录后岛屿页可见「管理后台」入口 |

> 以上账号统一密码为 `password1`，仅用于本地演示。

## ✅ 已实现核心功能
- 频率发射站：动态标签发布，支持图文、音频链接、外链混合内容。
- 声纳探索系统：海洋流推荐、热点频率榜（每小时窗口）与多标签深海检索。
- 共鸣机制：共鸣、回声评论、合鸣谱系树。
- 私密海浪：首条私信必须基于已共鸣内容发起，双方各≥3条消息后可揭示身份并查看公开主页。
- 岛屿空间：共鸣指数、兴趣星云图、按标签归类收藏夹。
- 商业化模块：会员支付、标签皮肤、数据洞察报告、私人小组创建、内容衍生品与品牌频率营地展示。

---

## 🐳 Docker 镜像源配置 (Docker Registry Configuration)

### 推荐配置（基于实际项目验证）

#### 1. Docker 镜像源
本项目使用官方 Docker Hub 镜像：
- `mongo:7.0`
- `node:20-slim`

#### 2. npm 依赖源
`backend/Dockerfile` 内已配置淘宝镜像源：
```dockerfile
RUN npm config set registry https://registry.npmmirror.com
```

#### 3. 服务说明
- `db`: MongoDB 数据库，挂载 `mongo_data` 卷实现持久化
- `backend`: 回声岛后端 API 服务
- `seed`: 启动时自动初始化演示数据（仅执行一次）
- 可选环境变量：
  - `JWT_SECRET`: 建议在部署环境中显式设置
  - `JWT_EXPIRES_IN`: 默认 `7d`

### 小程序后端地址切换
编辑 `miniprogram/config/index.js`：
- 模拟器：`BASE_URL: 'http://localhost:8223'`
- Android 模拟器：`BASE_URL: 'http://10.0.2.2:8223'`
- 真机调试：替换为局域网 IP
