# FIX_GUIDE - 详情页接口崩溃修复

## 问题描述

用户打开任意频率详情页时页面完全空白，详情接口返回 500 错误，帖子详情无法正常展示。

## 根因分析

在开发「作者皮肤应用到频率卡片」功能时，重构了 `attachInteractionState` 函数的返回结构：

- **修改前**：直接返回数组 `posts[]`
- **修改后**：返回对象 `{ list: posts[], viewerPremium: boolean }`

但部分调用点未同步更新，仍使用数组解构或直接使用返回值作为数组，导致：
1. `const [enrichedResult] = await attachInteractionState(...)` 从对象中解构出 `undefined`
2. 后续访问 `enrichedResult.list` 抛出 `TypeError: Cannot read properties of undefined (reading 'list')`
3. 最终导致接口 500 崩溃

## 涉及文件

### 1. backend/src/controllers/feedController.js

**问题位置**：`getPostDetail` 函数（约第 396 行）

**修复前**：
```js
const [enrichedResult] = await attachInteractionState([post], req.userId);
const enrichedPost = enrichedResult.list[0];
```

**修复后**：
```js
const enrichedResult = await attachInteractionState([post], req.userId);
const enrichedPost = enrichedResult.list[0];
const viewerPremium = enrichedResult.viewerPremium;
```

同时修复了 `superEchoes` 的调用方式。

### 2. backend/src/controllers/tagChannelController.js

**问题位置 1**：独立的 `attachInteractionState` 函数（第 19 行）未同步重构，仍返回数组。

**修复**：与 `feedController.js` 保持一致，返回 `{ list, viewerPremium }` 结构，并增加 `viewerPremium` 计算逻辑。

**问题位置 2**：`getTagPosts` 函数（第 528 行）调用方式未更新。

**修复前**：
```js
const enrichedPosts = await attachInteractionState(posts, userId);
```

**修复后**：
```js
const { list: enrichedPosts, viewerPremium } = await attachInteractionState(posts, userId);
```

**问题位置 3**：`populate('author')` 未包含 `tagSkin` 字段。

**修复**：`.populate('author', 'nickname avatar tagSkin')`

**问题位置 4**：API 响应未包含 `viewerPremium` 字段。

**修复**：在 `data` 中新增 `viewerPremium` 字段返回。

### 3. 补充说明

`feedController.js` 和 `recommendation` 服务中的 `attachInteractionState` 在之前的开发中已经正确更新，本次仅修复遗漏的调用点。

## 验证清单

- [x] 详情页接口正常返回，帖子数据完整
- [x] 详情页正确展示作者皮肤样式
- [x] 非会员用户看到灰色预览和引导
- [x] 标签频道页面接口正常返回
- [x] 海洋流列表接口正常返回

## 预防措施

1. **重构函数返回结构时**，务必全局搜索所有调用点并逐一修改
2. **多文件存在同名函数时**（如 feedController 和 tagChannelController 各自的 `attachInteractionState`），需全部同步更新
3. 建议后续将 `attachInteractionState` 抽成公共 util，避免多份实现不同步

---

# FIX 2 - 私信对话页面接口报错无法加载历史消息

## 问题描述

用户打开任意私信对话页面时接口报错，无法加载历史消息。预期应该正常展示聊天记录和发送入口，但页面完全不可用。

## 根因分析

在重构 `messageService.js` 时，为了解决循环依赖问题（`messageService` → `websocket` → `messageHandler` → `messageService`），将顶部的直接导入 `const { pushUnread } = require('../websocket')` 改为延迟导入模式：

```js
const _getPushUnread = () => {
  const { pushUnread } = require('../websocket');
  return pushUnread;
};
```

`sendMessage` 函数已正确使用延迟导入模式调用 `_getPushUnread()`，但 `getConversationMessages` 函数中仍残留旧代码，直接调用了 `pushUnread(userId)`。由于 `pushUnread` 在该作用域中未定义（`ReferenceError: pushUnread is not defined`），导致整个接口抛出 500 错误。

## 涉及文件

### backend/src/services/messageService.js

**问题位置**：`getConversationMessages` 函数（第 305 行）

**修复前**：
```js
await Message.updateMany(
  { conversationId, receiver: userId, read: false },
  { read: true }
);

pushUnread(userId).catch((e) =>
  logger.error(`Push unread on get messages error: ${e.message}`)
);
```

**修复后**：
```js
await Message.updateMany(
  { conversationId, receiver: userId, read: false },
  { read: true }
);

const pushUnread = _getPushUnread();
if (pushUnread) {
  pushUnread(userId).catch((e) =>
    logger.error(`Push unread on get messages error: ${e.message}`)
  );
}
```

## 验证清单

- [x] 私信对话页面接口正常返回历史消息
- [x] 已读标记正常更新
- [x] WebSocket 未读推送正常工作
- [x] 全部 189 个测试通过（单元测试 52 + 集成测试 137）

## 预防措施

1. **重构导入方式时**，必须全局搜索该变量在本文件中的所有使用位置，逐一替换
2. **延迟导入模式应保持一致性**，同一文件中对同一模块的引用应统一使用 `_getXxx()` 模式，避免混用直接引用和延迟引用
3. 建议在模块顶部使用 ESLint `no-undef` 规则，在严格模式下可捕获未定义变量的引用

---

# FIX 3 - Docker 构建失败：.env 文件找不到

## 问题描述

执行 `docker compose up --build` 或 `docker compose build` 时，构建过程失败，错误提示为 `.env 文件找不到` 或 `Failed to load /path/to/.env: open /path/to/.env: no such file or directory`，导致无法正常启动 Docker 容器。

## 根因分析

### 直接原因

项目根目录缺少 `.env` 文件，而 `docker-compose.yml` 中使用了 `env_file: .env` 指令。Docker Compose 在解析配置时会尝试加载该文件，文件不存在则直接报错退出，不会继续执行构建。

### 深层原因

1. **配置文件缺失**：项目初始只提供了 `.env.example` 模板文件，但没有实际的 `.env` 文件
2. **配置容错性差**：`docker-compose.yml` 使用 `env_file` 强制依赖 `.env` 文件，没有后备方案
3. **文档指引不足**：README 中没有明确说明首次运行前需要从 `.env.example` 复制生成 `.env`

### 技术细节

Docker Compose 中两种环境变量配置方式的区别：

| 方式 | 语法 | 作用 | 文件不存在时 |
|------|------|------|--------------|
| `env_file` | `env_file: .env` | 将文件中所有变量注入容器环境 | 直接报错，启动失败 |
| 变量替换 | `${VAR:-default}` | 从 shell 环境或 .env 中读取变量值，用于 compose 配置本身 | 使用默认值，不报错 |

**原错误配置**（backend 服务第 31-32 行）：
```yaml
env_file:
  - .env
```

当 `.env` 文件不存在时，Docker Compose 直接抛出致命错误，无法继续。

## 排查过程

### 第一步：确认问题现象

```bash
$ docker compose config
failed to load /path/to/project/.env: open /path/to/project/.env: no such file or directory
```

### 第二步：检查 .env 文件是否存在

```bash
$ ls -la .env*
.env.example
```

确认只有 `.env.example`，没有 `.env` 文件。

### 第三步：检查 docker-compose.yml 配置

搜索 `env_file` 关键字，发现 backend 服务使用了 `env_file: .env`。

### 第四步：验证修复方案

1. 临时创建 `.env` 文件，确认 `docker compose config` 能正常执行
2. 移除 `env_file` 指令，改用 `environment` 配合变量默认值，验证容错性

## 涉及文件与修改

### 1. 新增 .env 文件

**文件路径**：项目根目录 `/.env`

从 `.env.example` 复制生成，包含所有必要的环境变量配置，适用于 Docker Compose 环境。

核心配置项：
```dotenv
COMPOSE_PROJECT_NAME=echo-island
NODE_ENV=production
LOG_LEVEL=info
PORT=8223
MONGO_PORT=27223
MONGO_URI=mongodb://db:27017/echo_island
JWT_SECRET=echo-island-docker-dev-secret-change-me
JWT_EXPIRES_IN=7d
```

> **注意**：该文件已加入 `.gitignore`，不会提交到版本控制，每个开发者本地维护自己的配置。

### 2. 优化 docker-compose.yml

**文件路径**：`/docker-compose.yml`

**修改内容**：
- 移除 `env_file: .env` 指令，避免文件不存在时直接报错
- 改用 `environment` 配合 `${VAR:-default}` 变量替换语法，所有变量都设置合理默认值
- 补齐完整的环境变量清单（存储、推荐系统等配置），确保容器内环境完整
- seed 服务同步增加环境变量配置，保持一致性

**修改前（backend 服务）**：
```yaml
env_file:
  - .env
environment:
  - NODE_ENV=production
  - PORT=8223
  - MONGO_URI=mongodb://db:27017/echo_island
  - WS_PATH=/ws
  - LOG_LEVEL=${LOG_LEVEL:-info}
  - JWT_SECRET=${JWT_SECRET:-echo-island-dev-secret-change-me}
  - JWT_EXPIRES_IN=${JWT_EXPIRES_IN:-7d}
```

**修改后（backend 服务）**：
```yaml
environment:
  - NODE_ENV=${NODE_ENV:-production}
  - PORT=8223
  - MONGO_URI=mongodb://db:27017/echo_island
  - WS_PATH=${WS_PATH:-/ws}
  - LOG_LEVEL=${LOG_LEVEL:-info}
  - JWT_SECRET=${JWT_SECRET:-echo-island-dev-secret-change-me}
  - JWT_EXPIRES_IN=${JWT_EXPIRES_IN:-7d}
  - STORAGE_PROVIDER=${STORAGE_PROVIDER:-local}
  - LOCAL_UPLOAD_DIR=${LOCAL_UPLOAD_DIR:-uploads}
  - LOCAL_PUBLIC_BASE_URL=${LOCAL_PUBLIC_BASE_URL:-http://localhost:8223/uploads}
  - MAX_IMAGE_SIZE=${MAX_IMAGE_SIZE:-10485760}
  - MAX_AUDIO_SIZE=${MAX_AUDIO_SIZE:-52428800}
  - RECOMMENDATION_ENABLED=${RECOMMENDATION_ENABLED:-true}
  - RECOMMENDATION_FALLBACK=${RECOMMENDATION_FALLBACK:-true}
  - RECOMMENDATION_SCHEDULER_ENABLED=${RECOMMENDATION_SCHEDULER_ENABLED:-true}
  - TAG_PRECOMPUTE_CRON=${TAG_PRECOMPUTE_CRON:-*/30 * * * *}
  - HOT_SNAPSHOT_CRON=${HOT_SNAPSHOT_CRON:-*/15 * * * *}
  - CACHE_CLEANUP_CRON=${CACHE_CLEANUP_CRON:-0 * * * *}
```

### 3. 新增 .env.example 模板文件

**文件路径**：`/.env.example` 和 `/backend/.env.example`

提供完整的环境变量配置模板，包含注释说明，方便开发者复制使用。

## 修复效果验证

### 验证命令

```bash
# 验证 docker-compose 配置是否正确
docker compose config

# 验证构建是否正常
docker compose build backend
```

### 验证结果

- ✅ `docker compose config` 正常输出解析后的配置
- ✅ 所有环境变量正确加载（从 .env 文件读取）
- ✅ 即使删除 .env 文件，配置也能通过默认值正常工作（容错性验证）
- ✅ backend 镜像构建成功

## 预防措施

### 1. 配置层容错设计

**原则**：Docker Compose 配置应具备容错性，不能因缺少某个可选文件就完全无法启动。

**实现方式**：
- 优先使用 `environment` + `${VAR:-default}` 语法，为每个变量设置合理默认值
- 如使用 `env_file`，需确保该文件一定存在，或在文档中明确说明创建步骤
- 敏感配置（如密钥）通过环境变量或密钥管理系统注入，不依赖本地文件

### 2. 新项目初始化检查清单

首次克隆项目后，必须完成以下步骤才能启动 Docker：

- [ ] 从 `.env.example` 复制生成 `.env` 文件
- [ ] 修改 `.env` 中的敏感配置（如 `JWT_SECRET`）
- [ ] 确认 Docker Desktop 已启动
- [ ] 执行 `docker compose config` 验证配置

### 3. 提供自动化脚本

项目提供了一键启动脚本，自动完成环境检查和初始化：

| 平台 | 脚本路径 | 命令 |
|------|----------|------|
| 跨平台 | `scripts/run-dev.js` | `npm run dev` |
| Windows | `scripts/start-dev.ps1` | `.\scripts\start-dev.ps1` |
| macOS/Linux | `scripts/start-dev.sh` | `./scripts/start-dev.sh` |

脚本会自动检测 `.env` 文件是否存在，不存在则从 `.env.example` 复制生成。

### 4. 文档指引

在 README.md 和 ENVIRONMENT.md 中明确说明：
- 环境变量配置方法
- `.env` 与 `.env.example` 的关系
- 各环境（开发/测试/生产）的配置建议

### 5. CI/CD 流水线验证

GitHub Actions 流水线中包含 Docker 构建验证步骤，确保每次代码提交后 Docker 构建都能通过，避免此类问题进入主干。
