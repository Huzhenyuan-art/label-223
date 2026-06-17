# 回声岛环境变量与配置规范

## 一、环境说明

本项目支持多种运行环境，各环境配置如下：

| 环境 | 说明 | 典型使用场景 |
|--------|------|----------------|
| `development` | 本地开发环境 | 开发者本地调试 |
| `test` | 测试环境 | CI/CD 自动化测试 |
| `staging` | 预发布环境 | 生产发布前验证 |
| `production` | 生产环境 | 正式对外服务 |

---

## 二、环境变量总览

### 2.1 基础配置

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| `NODE_ENV` | 否 | `development` | Node.js 运行环境，可选值：`development` / `test` / `staging` / `production` |
| `LOG_LEVEL` | 否 | `info` | 日志级别，可选值：`error` / `warn` / `info` / `debug` |
| `PORT` | 否 | `8223` | 后端服务监听端口 |
| `COMPOSE_PROJECT_NAME` | 否 | `echo-island` | Docker Compose 项目名称 |

### 2.2 数据库配置

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| `MONGO_URI` | 否 | `mongodb://localhost:27017/echo_island` | MongoDB 连接字符串 |
| `MONGO_PORT` | 否 | `27223` | Docker 环境下 MongoDB 对外映射端口 |

> **生产环境建议**：使用带认证的 MongoDB 连接，例如：
```
mongodb://user:password@host:port/echo_island?authSource=admin&replicaSet=rs0
```

### 2.3 WebSocket 配置

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| `WS_PATH` | 否 | `/ws` | WebSocket 连接路径 |

### 2.4 JWT 鉴权配置

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| `JWT_SECRET` | **生产必填** | `echo-island-dev-secret-change-me` | JWT 签名密钥，**生产环境必须更换为随机高强度密钥** |
| `JWT_EXPIRES_IN` | 否 | `7d` | Token 有效期，支持格式：`60`(60秒) / `2h` / `7d` |

> **安全提示**：`JWT_SECRET` 至少 32 位以上随机字符串，生产环境务必通过密钥管理系统注入，禁止硬编码。

### 2.5 文件存储配置

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| `STORAGE_PROVIDER` | 否 | `local` | 存储提供者，当前仅支持 `local` |
| `LOCAL_UPLOAD_DIR` | 否 | `uploads` | 本地文件存储目录（相对项目根目录） |
| `LOCAL_PUBLIC_BASE_URL` | 否 | `http://localhost:8223/uploads` | 文件访问的公共基础 URL |
| `MAX_IMAGE_SIZE` | 否 | `10485760` | 单张图片最大字节数（默认 10MB） |
| `MAX_AUDIO_SIZE` | 否 | `52428800` | 单个音频最大字节数（默认 50MB） |

### 2.6 推荐系统配置

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| `RECOMMENDATION_ENABLED` | 否 | `true` | 是否启用推荐系统 |
| `RECOMMENDATION_FALLBACK` | 否 | `true` | 推荐失败时是否降级到旧逻辑 |
| `RECOMMENDATION_SCHEDULER_ENABLED` | 否 | `true` | 是否启用推荐定时任务 |
| `TAG_PRECOMPUTE_CRON` | 否 | `*/30 * * * *` | 标签预计算 Cron 表达式（默认每 30 分钟） |
| `HOT_SNAPSHOT_CRON` | 否 | `*/15 * * * *` | 热榜快照 Cron 表达式（默认每 15 分钟） |
| `CACHE_CLEANUP_CRON` | 否 | `0 * * * *` | 缓存清理 Cron 表达式（默认每小时整点） |

---

## 三、各环境配置建议

### 3.1 本地开发环境 (.env)

```dotenv
NODE_ENV=development
LOG_LEVEL=debug

PORT=8223
MONGO_URI=mongodb://localhost:27223/echo_island
WS_PATH=/ws

JWT_SECRET=echo-island-dev-secret-change-me-please
JWT_EXPIRES_IN=7d

STORAGE_PROVIDER=local
LOCAL_UPLOAD_DIR=uploads
LOCAL_PUBLIC_BASE_URL=http://localhost:8223/uploads

RECOMMENDATION_ENABLED=true
RECOMMENDATION_SCHEDULER_ENABLED=true
```

### 3.2 CI/CD 测试环境

```dotenv
NODE_ENV=test
LOG_LEVEL=error

MONGO_URI=mongodb://127.0.0.1:27017/echo_island_test

JWT_SECRET=echo-island-test-secret-key-for-testing-only
JWT_EXPIRES_IN=1h

RECOMMENDATION_ENABLED=false
RECOMMENDATION_SCHEDULER_ENABLED=false
```

### 3.3 生产环境

```dotenv
NODE_ENV=production
LOG_LEVEL=warn

PORT=8223
MONGO_URI=mongodb://user:password@db-host:27017/echo_island?authSource=admin

JWT_SECRET=<通过密钥管理系统注入的高强度随机密钥>
JWT_EXPIRES_IN=2d

STORAGE_PROVIDER=local
LOCAL_PUBLIC_BASE_URL=https://your-domain.com/uploads

RECOMMENDATION_ENABLED=true
RECOMMENDATION_SCHEDULER_ENABLED=true
```

---

## 四、Node.js 与依赖版本规范

### 4.1 运行时版本

| 工具 | 版本要求 | 说明 |
|------|----------|------|
| Node.js | `>=18.17.0 <21` | 推荐使用 LTS 版本 20.x |
| npm | `>=9` | 随 Node.js 20.x 附带 |
| MongoDB | `7.0.x` | Docker 镜像 `mongo:7.0` |

### 4.2 后端依赖版本锁定

所有后端依赖均使用**精确版本号**（无 `^` / `~` 前缀），确保构建可复现。
`package-lock.json` 已提交至版本控制，生产环境使用 `npm ci` 安装依赖。

核心依赖版本：

| 包名 | 锁定版本 | 用途 |
|------|----------|------|
| `express` | `4.22.2` | Web 框架 |
| `mongoose` | `8.24.0` | MongoDB ODM |
| `jsonwebtoken` | `9.0.3` | JWT 鉴权 |
| `bcryptjs` | `3.0.3` | 密码哈希 |
| `ws` | `8.21.0` | WebSocket |
| `winston` | `3.19.0` | 日志 |
| `jest` | `29.7.0` | 测试框架 |

---

## 五、配置文件加载规则

1. **加载优先级（从高到低）**：
   - 系统环境变量
   - `.env` 文件中的变量
   - 代码中的默认值

2. **`.env` 文件规则：
   - `.env.example` 为模板文件，提交至版本控制
   - `.env` 为实际使用文件，**不提交**至版本控制（已在 `.gitignore` 中排除）
   - 开发者本地需从 `.env.example` 复制生成 `.env` 并按需修改

3. **Docker 环境**：
   - `docker-compose.yml` 通过 `env_file: .env` 自动加载 `.env` 文件
   - 可通过环境变量覆盖 `.env` 中的值
   - `docker-compose.yml` 中已设置合理的默认值

---

## 六、安全最佳实践

1. **密钥管理**：
   - `JWT_SECRET`、数据库密码等敏感信息**禁止**提交到代码仓库
   - 生产环境使用密钥管理服务（如 HashiCorp Vault、云厂商 KMS）注入
   - CI/CD 流水线通过 Secrets 管理敏感变量

2. **文件权限**：
   - `.env` 文件权限设置为 `600`（仅所有者可读写）

3. **CORS 配置**：
   - 生产环境建议明确配置具体域名，禁止使用 `*` 通配符

---

## 七、配置验证

项目提供配置验证脚本，启动前检查必要配置：

```bash
cd backend
node scripts/check-env.js
```

该脚本会检查必填环境变量是否正确配置。
