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
