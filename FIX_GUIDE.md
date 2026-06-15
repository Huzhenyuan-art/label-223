# FIX GUIDE

## 问题：进入对话查看消息后，底部导航栏海浪未读消息角标不更新

### 现象描述
用户进入聊天页查看消息后退出，底部 TabBar "海浪" 图标上的未读消息角标数量没有减少，必须重新进入小程序才会刷新。

### 根因分析
TabBar 未读角标仅在 `app.js` 中管理，且仅在收到新消息（WebSocket `message` 事件）时刷新。当用户主动查看消息导致未读数减少时，没有任何触发机制来同步更新 TabBar 角标。

具体触发链路缺失：
1. **聊天页加载消息**：`chat.js` 调用 HTTP 接口加载历史消息，后端将该会话消息标记为已读 → 前端未刷新角标
2. **聊天页实时收消息**：收到当前会话的新消息后自动标记已读 → 前端未刷新角标
3. **消息列表页 onShow**：`messages.js` 只更新了页面内 `data.unreadCount`，未同步到 TabBar

### 修复方案

#### 1. app.js — 暴露公共刷新方法
- 新增公共方法 `refreshUnreadCount()`，内部从 HTTP API 获取未读数并更新 TabBar 角标
- 保留私有方法 `_refreshUnreadCount()` 作为兼容委托
- 方法返回当前未读数

**文件**：`miniprogram/app.js`

#### 2. chat.js — 两处触发角标刷新
- 引入 `const app = getApp()`
- `loadMessages()` 成功后调用 `app.refreshUnreadCount()`（HTTP 标记已读场景）
- 收到当前会话新消息（`onMessage`）后调用 `app.refreshUnreadCount()`（实时已读场景）

**文件**：`miniprogram/pages/chat/chat.js`

#### 3. messages.js — onShow 同步角标
- 引入 `const app = getApp()`
- `loadAll()` 成功后，用已获取的未读数直接更新 TabBar 角标（避免重复 HTTP 请求）
- 同步 `app.globalData.unreadCount` 保持全局数据一致

**文件**：`miniprogram/pages/messages/messages.js`

### 涉及文件清单
| 文件 | 改动说明 |
|------|---------|
| `miniprogram/app.js` | 新增 `refreshUnreadCount()` 公共方法 |
| `miniprogram/pages/chat/chat.js` | 加载消息、收到新消息后刷新角标 |
| `miniprogram/pages/messages/messages.js` | loadAll 后同步 TabBar 角标 |

### 验证方法
1. 用账号 B 给账号 A 发送消息 → A 的 TabBar "海浪" 角标应立即 +1
2. 账号 A 点击"海浪"进入消息列表 → 角标应显示正确数量
3. 账号 A 点击进入某条会话 → 退出后回到消息列表 → 该会话未读数应为 0，TabBar 角标应相应减少
4. 账号 A 在聊天页中，账号 B 再发一条消息 → 消息自动追加且已读，TabBar 角标不增加（因为已读）

### 注意事项
- `wx.setTabBarBadge` 的 text 必须为字符串，数字 > 99 时显示 "99+"
- `wx.removeTabBarBadge` 在无角标时调用不会报错，安全
- `messages.js` 选择直接用已获取的 unread count 更新 TabBar，而非调用 `app.refreshUnreadCount()`，避免重复 HTTP 请求

---

## 问题：删除频率时提示 Server error，点击编辑按钮无反应

### 现象描述
1. 用户在频率详情页点击"删除"，确认后提示 "Server error"，删除失败
2. 用户点击"编辑"按钮没有任何反应，页面不跳转

### 根因分析

#### 问题1：删除时 Server error
后端 `deletePost` 方法使用了 MongoDB 事务（`mongoose.startSession()`），但单机版 MongoDB 不支持事务，必须运行在副本集或分片集群模式下才支持事务。调用 `startSession()` 会直接抛出异常，导致返回 500 Server error。

#### 问题2：编辑按钮无反应
`isOwnPost` 判断条件中，`post.author._id` 是 MongoDB 返回的 ObjectId 对象，而 `wx.getStorageSync('userId')` 是字符串，直接使用 `===` 比较时类型不匹配，结果始终为 `false`，导致编辑和删除按钮不显示（`wx:if` 条件不满足）。即使按钮显示了，发布页中也有同样的权限判断问题，进入编辑页时会被错误地判定为无权限。

### 修复方案

#### 1. postController.js — 移除删除操作的事务
将删除操作改为普通顺序执行，移除 `session` 事务相关代码。虽然失去了原子性保证，但在单机环境下可正常运行。

**文件**：`backend/src/controllers/postController.js`

#### 2. detail.js — 修正 isOwnPost 判断
将 ObjectId 和 userId 都用 `String()` 转换后再比较，确保类型一致。

**文件**：`miniprogram/pages/detail/detail.js`

#### 3. publish.js — 修正编辑权限判断
同样将 ObjectId 和 userId 用 `String()` 转换后比较，防止进入编辑页时被误判为无权限。

**文件**：`miniprogram/pages/publish/publish.js`

### 涉及文件清单
| 文件 | 改动说明 |
|------|---------|
| `backend/src/controllers/postController.js` | 移除 deletePost 方法中的 MongoDB 事务 |
| `miniprogram/pages/detail/detail.js` | isOwnPost 判断时用 String() 转换类型 |
| `miniprogram/pages/publish/publish.js` | 编辑权限判断时用 String() 转换类型 |

### 验证方法
1. 登录账号后发布一条原频
2. 进入该频率详情页，应能看到"编辑"和"删除"按钮
3. 点击"编辑"按钮，应跳转到编辑页并自动填充原有内容
4. 修改内容后保存，应提示"修改已保存"并返回详情页
5. 详情页应显示"最后编辑于..."提示
6. 点击"删除"按钮，确认后应提示"删除成功"并返回上一页

### 注意事项
- MongoDB ObjectId 与字符串比较时必须显式转换类型，这是前后端联调的常见坑
- 单机版 MongoDB 不支持事务，如后续需要事务保证数据一致性，需部署副本集
- 移除事务后，删除操作若中途失败可能产生脏数据（如只删了部分关联数据），建议监控 error 日志
