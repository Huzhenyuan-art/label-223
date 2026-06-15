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

---

## 问题：编辑按钮点击后无任何反应（页面不跳转）

### 现象描述
删除功能已修复成功，但点击"编辑"按钮仍然没有任何反应，页面不会发生跳转，也没有任何错误提示。

### 诊断过程

#### 第一步：确认按钮是否显示
检查 [detail.js](file:///d:/Desktop/新建文件夹%20(2)/label-223/label-223/miniprogram/pages/detail/detail.js#L89) 中的 `isOwnPost` 判断，确认 `String()` 转换已生效，按钮能够正常显示。

#### 第二步：检查点击事件绑定
检查 [detail.wxml](file:///d:/Desktop/新建文件夹%20(2)/label-223/label-223/miniprogram/pages/detail/detail.wxml#L12-L15) 中的按钮绑定：
- 编辑按钮绑定了 `bindtap="handleEdit"`
- 删除按钮绑定了 `bindtap="handleDelete"`

删除按钮能正常弹出确认框，说明点击事件绑定本身没有问题。

#### 第三步：检查 handleEdit 方法
检查 [detail.js](file:///d:/Desktop/新建文件夹%20(2)/label-223/label-223/miniprogram/pages/detail/detail.js#L244-L252) 中的 `handleEdit` 方法，发现使用了 `wx.navigateTo` 跳转到 `/pages/publish/publish?editId=...`。

#### 第四步：检查 publish 页面是否为 tabBar 页面
查看 [app.json](file:///d:/Desktop/新建文件夹%20(2)/label-223/label-223/miniprogram/app.json#L20-L50) 中的 `tabBar` 配置，发现 publish 页面确实是 tabBar 页面（"发射" tab）。

**根因确认**：微信小程序中，`wx.navigateTo` 和 `wx.redirectTo` 都不能跳转到 tabBar 页面，只能使用 `wx.switchTab` 跳转。但 `wx.switchTab` 不能传递参数，且没有返回按钮，不适合编辑场景。

### 根因分析
`publish` 页面被配置为 tabBar 页面（底部导航栏的"发射"按钮），而微信小程序的 `wx.navigateTo` API 不支持跳转到 tabBar 页面。调用 `wx.navigateTo` 跳转到 tabBar 页面时，会静默失败，没有任何错误提示和视觉反馈，用户感觉就是"点击没反应"。

这是微信小程序的平台限制：
- `wx.navigateTo` - 不能跳 tabBar 页面
- `wx.redirectTo` - 不能跳 tabBar 页面
- `wx.switchTab` - 只能跳 tabBar 页面，且不能带参数
- `wx.reLaunch` - 可以跳任意页面，但会关闭所有页面，无返回按钮

### 修复方案

#### 方案选择
**创建独立的编辑页面**（非 tabBar 页面），而不是复用 publish 页面。理由：
1. 编辑页面需要返回按钮，不应出现在 tabBar 中
2. 编辑和创建虽然界面类似，但用户预期和交互流程不同
3. 避免 tabBar 页面的各种限制（不能传参、生命周期不同等）

#### 实施步骤

##### 1. 创建独立的编辑页面
新建 `pages/edit/` 目录，包含四个文件：
- `edit.js` - 页面逻辑，专注于编辑模式
- `edit.wxml` - 页面结构
- `edit.wxss` - 页面样式
- `edit.json` - 页面配置，标题为"编辑频率"

编辑页与发布页的区别：
- 页面标题为"编辑频率"而非"发射频率"
- 提交按钮文字为"保存修改"而非"发射频率"
- 副标题提示"原有的共鸣、回声与合鸣将保留"
- 只支持编辑模式，去掉了创建模式的相关逻辑
- 保存成功后用 `wx.redirectTo` 返回详情页

**文件**：`miniprogram/pages/edit/`

##### 2. 在 app.json 中注册编辑页面
将 `pages/edit/edit` 添加到 pages 数组中，注意不要加入 tabBar 配置。

**文件**：[app.json](file:///d:/Desktop/新建文件夹%20(2)/label-223/label-223/miniprogram/app.json#L8)

##### 3. 修改详情页跳转路径
将 `handleEdit` 方法中的跳转路径从 `/pages/publish/publish` 改为 `/pages/edit/edit`。

**文件**：[detail.js](file:///d:/Desktop/新建文件夹%20(2)/label-223/label-223/miniprogram/pages/detail/detail.js#L249-L250)

### 涉及文件清单
| 文件 | 改动说明 |
|------|---------|
| `miniprogram/pages/edit/edit.js` | 新建，编辑页面逻辑 |
| `miniprogram/pages/edit/edit.wxml` | 新建，编辑页面结构 |
| `miniprogram/pages/edit/edit.wxss` | 新建，编辑页面样式 |
| `miniprogram/pages/edit/edit.json` | 新建，编辑页面配置 |
| `miniprogram/app.json` | 注册 edit 页面到 pages 数组 |
| `miniprogram/pages/detail/detail.js` | 修改 handleEdit 的跳转路径到 edit 页面 |

### 验证方法
1. 登录账号后发布一条原频
2. 进入该频率详情页，确认能看到"编辑"和"删除"按钮
3. 点击"编辑"按钮，应能正常跳转到编辑页面
4. 编辑页面左上角应有返回箭头（说明不是 tabBar 页面）
5. 编辑页面应自动填充原有内容（标题、正文、标签等）
6. 修改内容后点击"保存修改"，应提示"修改已保存"并跳回详情页
7. 详情页应显示"最后编辑于..."提示，且内容已更新

### 注意事项
- **tabBar 页面限制**：微信小程序中 tabBar 页面不能用 `navigateTo` / `redirectTo` 跳转，这是常见的新手坑
- **页面职责分离**：创建和编辑虽然界面相似，但建议拆分为两个页面，各自职责更清晰
- **参数传递**：非 tabBar 页面可以通过 URL 参数传递数据（如 `?editId=xxx`），tabBar 页面不行
- **代码复用**：当前编辑页和发布页有较多重复代码，后续可考虑抽离为自定义组件（Component）来复用
- **publish 页的编辑模式代码**：`publish.js` 中遗留的编辑模式相关代码（`isEditMode`、`loadPostForEdit` 等）目前已不再使用，保留不影响功能，后续可清理

---

## 问题：点击选择音频文件时，仍可选择非音频类型的其他文件并调用上传接口

### 现象描述
用户在发布页或编辑页点击「选择音频文件」后：
1. 在微信文件选择器中切换到「所有文件」视图，仍然可以选择 txt、pdf、apk 等非音频类型的文件
2. 非音频文件仍然会发起 `/api/upload/audio` 上传请求，直到后端拦截才返回错误
3. 图片选择也存在类似风险（虽然 chooseMedia 限制较严，但缺乏防御性校验）

### 根因分析
问题的根本原因是**单点校验容易被绕过**，原代码中只在 `chooseAudio()` 的 success 回调里做了一次扩展名校验，但整个上传链路中存在多个校验缺口：

| 漏洞点 | 说明 |
|--------|------|
| ① 扩展名校验函数不够健壮 | 旧版 `isAudioFile` 使用 `split('.').pop()` 提取扩展名，对 `file.name..mp3`、`file.mp3.`、无扩展名文件等边界情况处理不当 |
| ② chooseImage 缺少扩展名校验 | 只依赖 `wx.chooseMedia` 的 `mediaType: ['image']` 限制，未做二次校验，部分机型/版本可能绕过 |
| ③ chooseAndUploadXxx 缺少二次校验 | 选择文件后到调用上传接口中间没有再次校验文件类型，如果前面的 choose 函数被绕过就直接上传 |
| ④ doUpload 缺少最终拦截 | `wx.uploadFile` 调用前没有基于 tempFilePath 的文件名做最后一次类型校验，任何外部传入的路径都可能上传 |
| ⑤ submitPost 缺少 URL 合法性校验 | 用户可能通过调试工具手动修改 `data.coverImage` / `data.audioUrl`，提交非法链接（如手填的非媒体 URL） |

微信小程序的文件选择 API 本质上**不可信任**：
- `wx.chooseMessageFile` 的 `extension` 参数仅做 UI 显示过滤，用户可随时切换到「所有文件」绕过
- `wx.chooseMedia` 的 `mediaType` 在旧版本或特定 ROM 上可能存在兼容性问题
- 小程序调试器可以手动修改 page data，绕过所有前端校验

### 修复方案
采用**多层校验拦截（Defense in Depth）**策略，在上传链路的 5 个关键节点都加入校验，确保任一环节被绕过都不会导致非法文件上传或非法 URL 提交。

#### 第 1 层：重构工具函数（upload.js）
- 抽出 `getFileExtension(fileName)`：使用 `lastIndexOf('.')` 精准提取扩展名，兼容边界情况（无扩展名、末尾是点、多个点）
- 抽出 `isAllowedExtension(fileName, allowedList)`：通用校验函数
- 定义 `IMAGE_EXTENSIONS` 常量，与后端 `allowedMimeTypes.image` 保持扩展名对应
- 同时导出 `isImageFile` / `isAudioFile` / 扩展名常量供页面层使用

**文件**：[upload.js](file:///d:/Desktop/新建文件夹%20(2)/label-223/label-223/miniprogram/utils/upload.js#L5-L27)

#### 第 2 层：choose 函数内校验（upload.js）
- `chooseAudio()` success 回调：保留扩展名校验，非法立即 toast + reject
- `chooseImage()` success 回调：新增扩展名过滤，从 tempFilePath 提取文件名并校验，非法文件被 filter 掉后如果数组为空则 reject

**文件**：[upload.js](file:///d:/Desktop/新建文件夹%20(2)/label-223/label-223/miniprogram/utils/upload.js#L29-L121)

#### 第 3 层：chooseAndUploadXxx 内二次校验（upload.js）
- `chooseAndUploadAudio()`：拿到 file 后再次调用 `isAudioFile()` 校验
- `chooseAndUploadImage()`：拿到 file 后再次调用 `isImageFile()` 校验
- 非法时 toast 提示 + throw，不再往下执行上传

**文件**：[upload.js](file:///d:/Desktop/新建文件夹%20(2)/label-223/label-223/miniprogram/utils/upload.js#L203-L243)

#### 第 4 层：doUpload 内最终拦截（upload.js）
- `doUpload()` 新增 `expectedType` 参数（'image' / 'audio'）
- 从 `tempFilePath` 中提取文件名，按预期类型校验扩展名
- 校验失败直接 `Promise.reject`，**不发起 wx.uploadFile 网络请求**
- 这是前端的最后一道防线，确保无论前面如何被绕过，都不会真正调后端接口

**文件**：[upload.js](file:///d:/Desktop/新建文件夹%20(2)/label-223/label-223/miniprogram/utils/upload.js#L123-L192)

#### 第 5 层：submitPost 提交时 URL 合法性校验（publish.js + edit.js）
- 页面内新增 `isValidMediaUrl(url, type)` 工具函数：解析 URL，从 pathname 中提取文件名并校验扩展名
- `submitPost()` 提交发帖/编辑请求前，对 `coverImage` 和 `audioUrl` 分别做合法性校验
- 非法时 toast 提示并 return，不发送 `/api/posts` 请求
- 防止用户通过调试工具修改 data 中的 URL 后直接提交

**文件**：
- [publish.js](file:///d:/Desktop/新建文件夹%20(2)/label-223/label-223/miniprogram/pages/publish/publish.js#L13-L24)
- [publish.js submitPost](file:///d:/Desktop/新建文件夹%20(2)/label-223/label-223/miniprogram/pages/publish/publish.js#L252-L263)
- [edit.js](file:///d:/Desktop/新建文件夹%20(2)/label-223/label-223/miniprogram/pages/edit/edit.js#L13-L24)
- [edit.js submitPost](file:///d:/Desktop/新建文件夹%20(2)/label-223/label-223/miniprogram/pages/edit/edit.js#L245-L256)

### 涉及文件清单
| 文件 | 改动说明 |
|------|---------|
| `miniprogram/utils/upload.js` | 重构工具函数，增加 4 层类型校验（choose → chooseAndUpload → doUpload），图片和音频均覆盖 |
| `miniprogram/pages/publish/publish.js` | 新增 `isValidMediaUrl()`，submitPost 前校验 coverImage / audioUrl 合法性 |
| `miniprogram/pages/edit/edit.js` | 新增 `isValidMediaUrl()`，submitPost 前校验 coverImage / audioUrl 合法性 |

### 完整校验链路图
```
用户点击选择音频/图片
        ↓
第 1 层：chooseImage / chooseAudio 内扩展名校验（upload.js）
   → 非法：toast + reject，流程终止
        ↓ 合法
第 2 层：chooseAndUploadXxx 内二次校验（upload.js）
   → 非法：toast + throw，流程终止
        ↓ 合法
第 3 层：doUpload 内基于 tempFilePath 的最终拦截（upload.js）
   → 非法：toast + reject，**不发起 wx.uploadFile 请求**
        ↓ 合法
   发起 wx.uploadFile → 后端 MIME type 校验（uploadController.js）
        ↓ 合法
   返回 URL 存入 data.coverImage / data.audioUrl
        ↓
用户点击提交
        ↓
第 4 层：submitPost 内 URL 合法性校验（publish.js / edit.js）
   → 非法：toast + return，**不发送发帖/编辑请求**
        ↓ 合法
   发起 POST /api/posts 或 PUT /api/posts/:id
```

### 验证方法
#### 场景 A：选择非音频文件验证不调用上传接口
1. 进入发布页，点击「选择音频文件」
2. 切换到「所有文件」，选择一个 .txt 或 .pdf 文件
3. 预期：立即 toast `请选择音频文件（mp3/wav/ogg/aac/m4a）`
4. 抓包验证：**没有** `/api/upload/audio` 请求发出
5. 页面状态：`uploadingAudio` 重置为 false，不显示任何音频信息

#### 场景 B：选择非图片文件（模拟绕过 chooseMedia）
1. 进入发布页，点击「选择封面图片」
2. （通过调试或特殊机型）选择非图片文件
3. 预期：toast `请选择图片文件（jpg/png/gif/webp）`
4. 抓包验证：**没有** `/api/upload/image` 请求发出

#### 场景 C：通过调试工具修改 data.audioUrl 为非法链接
1. 在发布页正常上传一个合法音频，成功后 `data.audioUrl` 有值
2. 通过小程序调试器手动将 `data.audioUrl` 改为 `https://evil.com/shell.exe`
3. 点击「发射频率」提交
4. 预期：toast `音频文件非法，请重新上传`，**没有** `/api/posts` 请求发出
5. 同样修改 `data.coverImage` 为非法链接，预期类似提示

#### 场景 D：正常合法文件验证流程不受影响
1. 选择合法 .mp3 文件 → 正常上传，显示音频信息
2. 选择合法 .jpg / .png 图片 → 正常上传，显示封面预览
3. 填写内容后提交 → 正常发布成功

### 注意事项
- **防御性编程原则**：不要信任任何来自客户端 API 的返回值，所有关键边界必须自行校验
- **多层校验不是冗余**：每一层都针对不同的攻击面（UI 绕过、代码逻辑绕过、调试器篡改、外部代码调用），任何一层被突破都有下一层兜底
- **扩展名 ≠ 真实文件类型**：前端所有校验仅基于文件扩展名，**最终安全防线仍在后端**（MIME type 校验 + 文件魔数校验）
- **URL 校验意义**：防止用户通过调试工具篡改 data 后提交非法 URL（如 XSS 链接、恶意下载链接等）
- **前后端白名单一致性**：前端 `AUDIO_EXTENSIONS` / `IMAGE_EXTENSIONS` 必须与后端 `config.storage.allowedMimeTypes` 保持对应关系，否则会出现前端允许而后端拒绝的情况
