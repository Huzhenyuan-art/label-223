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

---

## 问题：私人小组弹窗点击内容区域直接关闭 + 支付成功后提示网络连接失败

### 现象描述
1. **发帖弹窗**：小组详情页点击「发帖」后弹出弹窗，点击弹窗内容区域（包括输入框）时弹窗直接关闭，无法输入内容
2. **邀请码弹窗**：小组列表页点击「输入邀请码加入」后弹出弹窗，同样点击输入框时弹窗直接关闭，无法输入
3. **会员支付**：点击「立即支付开通」后提示「支付成功」，紧接着又弹出「网络连接失败」提示

### 根因分析

#### 问题 1&2：弹窗内容点击关闭

弹窗结构为遮罩层（`modal-mask`，绑定 `bindtap="closeXxxModal"`）包裹内容区域（`modal-content`，使用 `catchtap=""` 阻止冒泡）。

**根因**：`catchtap=""` 空字符串在微信小程序中不能正确阻止事件冒泡。当用户点击 input、textarea 或空白内容区域时，tap 事件会穿透 `catchtap=""` 继续冒泡到遮罩层的 `bindtap` 处理函数，触发关闭弹窗。

微信小程序的事件机制要求 `catchtap` 必须绑定到一个实际存在的函数名才能生效，空字符串等价于未绑定，不会拦截事件。

#### 问题 3：支付成功后网络连接失败

支付流程：`pay()` -> `request.post(CHECKOUT)` 成功 -> `wx.showToast('支付成功')` -> `this.loadData()` -> `loadData` 内部调用 `request.get(config.API.PRIVATE_GROUPS)` -> **失败**

**根因**：小组模块重构时，将 API 配置从 `PRIVATE_GROUPS: '/api/users/me/private-groups'` 改为 `PRIVATE_GROUPS_MY: '/api/private-groups/me'`，但 `member.js` 仍引用旧的 `config.API.PRIVATE_GROUPS`，该配置已不存在，值为 `undefined`。`request.get(undefined)` 会构造出 `http://localhost:8223/undefined` 的请求地址，导致网络请求失败，触发 `request.js` 中的 `fail` 回调显示「网络连接失败」。

同时 `createPrivateGroup()` 方法中也引用了 `config.API.PRIVATE_GROUPS`（旧配置），同样会失败。

### 修复方案

#### 1. 修复弹窗事件冒泡 - 3 个页面

将所有 `catchtap=""` 改为 `catchtap="preventBubble"`，并在各页面的 Page 对象中添加空的 `preventBubble()` 方法。

涉及文件：
- `miniprogram/pages/groups/groups.wxml` - `catchtap=""` 改为 `catchtap="preventBubble"`
- `miniprogram/pages/groups/groups.js` - 添加 `preventBubble() {}`
- `miniprogram/pages/groupDetail/groupDetail.wxml` - `catchtap=""` 改为 `catchtap="preventBubble"`
- `miniprogram/pages/groupDetail/groupDetail.js` - 添加 `preventBubble() {}`
- `miniprogram/pages/groupMembers/groupMembers.wxml` - `catchtap=""` 改为 `catchtap="preventBubble"`
- `miniprogram/pages/groupMembers/groupMembers.js` - 添加 `preventBubble() {}`

#### 2. 修复 API 配置引用 - member.js

将 `config.API.PRIVATE_GROUPS`（已移除）替换为新配置名：
- loadData 中获取小组列表：`config.API.PRIVATE_GROUPS` -> `config.API.PRIVATE_GROUPS_MY`
- createPrivateGroup 中创建小组：`config.API.PRIVATE_GROUPS` -> `config.API.PRIVATE_GROUPS_CREATE`

涉及文件：`miniprogram/pages/member/member.js`

### 涉及文件清单
| 文件 | 改动说明 |
|------|---------|
| `miniprogram/pages/groups/groups.wxml` | `catchtap=""` 改为 `catchtap="preventBubble"` |
| `miniprogram/pages/groups/groups.js` | 新增 `preventBubble()` 空方法 |
| `miniprogram/pages/groupDetail/groupDetail.wxml` | `catchtap=""` 改为 `catchtap="preventBubble"` |
| `miniprogram/pages/groupDetail/groupDetail.js` | 新增 `preventBubble()` 空方法 |
| `miniprogram/pages/groupMembers/groupMembers.wxml` | `catchtap=""` 改为 `catchtap="preventBubble"` |
| `miniprogram/pages/groupMembers/groupMembers.js` | 新增 `preventBubble()` 空方法 |
| `miniprogram/pages/member/member.js` | `PRIVATE_GROUPS` 改为 `PRIVATE_GROUPS_MY` / `PRIVATE_GROUPS_CREATE` |

### 验证方法
#### 场景 A：发帖弹窗可正常输入
1. 进入小组详情页，点击「发帖」
2. 点击输入框，弹窗不应关闭
3. 输入标题和内容，点击「发布」应正常提交
4. 点击弹窗外遮罩区域，弹窗应关闭

#### 场景 B：邀请码弹窗可正常输入
1. 进入小组列表页，点击「输入邀请码加入」
2. 点击输入框，弹窗不应关闭
3. 输入邀请码，点击「加入」应正常提交
4. 点击弹窗外遮罩区域，弹窗应关闭

#### 场景 C：会员支付不再报网络错误
1. 进入会员中心，点击任一方案的「立即支付开通」
2. 应仅提示「支付成功」，不再出现「网络连接失败」
3. 支付后页面数据自动刷新，私人小组模块正常显示

### 注意事项
- **微信小程序 catchtap 机制**：`catchtap` 必须绑定到实际存在的函数名，空字符串不会阻止事件冒泡，这是与浏览器 `event.stopPropagation()` 不同的行为
- **API 配置重构一致性**：修改配置项名称时，必须全局搜索所有引用点并同步更新，避免出现 `undefined` 配置导致静默失败
- **支付后刷新链路**：支付成功后 `loadData()` 会发起多个并行请求，任何一个失败都会触发 toast，需要确保所有 API 引用正确

---

## 问题：小组详情页首次进入不加载已有帖子

### 现象描述
加入小组后首次进入小组详情页，「小组动态」模块始终显示「还没有帖子，来发布第一条吧」，即使小组成员此前已发布过帖子。只有自己发布一条帖子后，所有历史帖子（包括别人发的）才会一起显示出来。

### 根因分析
页面生命周期调用链路：
- onLoad()  loadGroupDetail()（只加载小组信息，不加载帖子）
- onShow()  loadGroupDetail()（同上）
- 发布新帖成功后  
eload()（同时调用 loadGroupDetail() + loadPosts()）

**根因**：onLoad 和 onShow 只调用了 loadGroupDetail()，遗漏了 loadPosts()，导致首次进入详情页时帖子列表从未被请求。只有在自己发帖成功后触发的 
eload() 才会真正拉取帖子数据，因此出现「一发帖所有历史帖子都冒出来」的诡异现象。

### 修复方案
将 onLoad 中 loadGroupDetail() 替换为 
eload()，让页面首访同时并行拉取小组信息和帖子列表。onShow 保持不变（只刷新小组信息即可，帖子可在触底或下拉时刷新，避免重复请求）。

涉及文件：miniprogram/pages/groupDetail/groupDetail.js - onLoad 中 	his.loadGroupDetail() 改为 	his.reload()

### 涉及文件清单
| 文件 | 改动说明 |
|------|---------|
| miniprogram/pages/groupDetail/groupDetail.js | onLoad 调用改为 reload，确保首访加载帖子 |

### 验证方法
#### 场景 A：首次进入已存在帖子的小组
1. 用账号 A 在某小组内发布一条帖子
2. 用账号 B 通过邀请码加入该小组
3. 账号 B 进入该小组详情页
4. 预期：小组动态区域立即显示账号 A 发布的帖子，不显示空提示

#### 场景 B：自己发帖后正常显示
1. 在小组内点击「发帖」并成功发布
2. 预期：刚发布的帖子立即出现在列表顶部，历史帖子也正常显示

### 注意事项
- **onLoad vs onShow**：onLoad 只在页面创建时执行一次，是做首屏数据加载的最佳位置；onShow 每次显示时都执行，适合做轻量刷新。这里首屏数据放在 onLoad 走 reload，onShow 只刷新小组信息即可，避免每次返回详情页都重复请求帖子列表
- **并行请求性能**：reload 使用 Promise.all 并行请求两个接口，比顺序调用更快，首屏体验更好

---

## 问题：岛屿页面「会员中心」按钮被遮挡 + 三按钮布局优化

### 现象描述
1. 岛屿页面「收藏夹（按标签）」模块右侧的「管理收藏」「我的小组」「会员中心」三个按钮中，最右侧的「会员中心」按钮被完全遮挡或截断，无法点击
2. 三个按钮挤在标题右侧，视觉层次混乱，小屏机型上尤为明显

### 根因分析
按钮与标题放在同一行（.row-between 即 flex justify-content: space-between）：

| 问题点 | 说明 |
|--------|------|
| 总宽度超出 | 3 个按钮各 180rpx + 2 个 12rpx 间距 = 564rpx，标题区域即使被压缩也至少需要 100-150rpx，两者相加超出卡片可用宽度（约 680rpx）|
| 缺少换行机制 | .actions-row 设置了 lex-shrink: 0，按钮容器不允许收缩，但没有允许换行（lex-wrap: wrap），溢出部分直接被裁剪 |
| 布局结构不合理 | 标题与操作按钮本质是两个不同语义的区块，不应强行挤在同一行，标题需要清晰可读，按钮需要独立的操作区域 |

### 修复方案
采用「标题行独立 + 按钮 3 列等宽网格」的新布局：

#### 1. profile.wxml - 重构结构
- 标题「收藏夹（按标签）」独占一行，保持视觉焦点
- 三个按钮用 .actions-grid > .action-cell * 3 结构独立成一行
- 每个按钮宽度由父容器 flex 分配，自适应 1/3 宽度

#### 2. profile.wxss - 新增网格样式
`css
.actions-grid {
  display: flex;
  gap: 16rpx;
  margin-top: 16rpx;
}
.action-cell {
  flex: 1;
  min-width: 0;
}
.action-grid-btn {
  width: 100%;
  height: 72rpx;
  line-height: 72rpx;
  font-size: 24rpx;
}
`

新布局优势：
- 按钮宽度自适应（flex: 1 三等分），任何屏幕尺寸都不会溢出
- 按钮区域独立，与标题不互相干扰
- 字号从 22rpx 提升到 24rpx，高度从 64rpx 提升到 72rpx，点击区域更大更易用
- 三按钮视觉权重一致，层次清晰

### 涉及文件清单
| 文件 | 改动说明 |
|------|---------|
| miniprogram/pages/profile/profile.wxml | 标题与按钮分行，按钮改为 actions-grid 三列结构 |
| miniprogram/pages/profile/profile.wxss | 新增 actions-grid、action-cell、action-grid-btn 样式 |

### 验证方法
#### 场景 A：三按钮完整显示且可点击
1. 登录后进入「岛屿」Tab
2. 找到「收藏夹（按标签）」模块
3. 预期：标题单独一行，下方三个按钮并排等宽显示
4. 预期：「管理收藏」「我的小组」「会员中心」三个按钮文字完整显示，无截断
5. 依次点击三个按钮，均应正常跳转到对应页面

#### 场景 B：小屏机型适配验证
1. 使用小屏机型（如 iPhone SE，375px 宽度）
2. 进入岛屿页面，检查三个按钮布局
3. 预期：三按钮自适应等宽，不溢出卡片边界，无遮挡

### 注意事项
- **语义化布局**：标题和操作按钮属于不同的视觉区块，放在不同行是更合理的信息架构，避免为了"节省空间"而牺牲可用性
- **按钮点击热区**：新按钮高度 72rpx 符合微信小程序推荐的最小可点击高度（约 44pt），提升可触达性
- **保留旧样式兼容**：原有的 .mini-btn、.actions-row 等样式类暂时保留，不直接删除，防止其他未发现的引用点报错
---
---

## 问题：点击加入合鸣谱系时提示 Server Error，控制台显示 500

### 现象描述
用户在频率详情页填写合鸣内容后，点击「加入合鸣谱系」按钮，弹出提示 Server Error，控制台网络请求显示 POST /api/posts/:id/super-echo 返回 500 状态码，合鸣创建失败。

### 根因分析

后端 createSuperEcho 方法在创建合鸣通知后，调用了 sendToUser 推送 WebSocket 消息，但对 sendToUser 的返回值错误地调用了 .catch() 方法：

`js
sendToUser(parent.author.toString(), { ... }).catch((e) => logger.error(...));
`

查看 websocket/index.js 中 sendToUser 的实现：

`js
const sendToUser = (userId, payload) => {
  const socket = clients.get(userId.toString());
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
    return true;   // 返回布尔值，不是 Promise
  }
  return false;    // 返回布尔值，不是 Promise
};
`

sendToUser 是一个同步函数，返回值是 true 或 false（布尔值），不是 Promise。在布尔值上调用 .catch() 会抛出 TypeError：

`
TypeError: sendToUser(...).catch is not a function
`

这个 TypeError 被 createSuperEcho 外层 try-catch 捕获，导致返回 500 Server error。

关键点：此错误只在「对他人原频发起合鸣」时触发（parent.author !== req.userId），在自己帖子上发起合鸣时不会进入通知分支，因此不会报错。这增加了排查难度。

### 修复方案

将 sendToUser 调用从 .catch() 链式调用改为 try-catch 包裹：

`js
// 修改前（错误）
sendToUser(parent.author.toString(), { ... }).catch((e) => logger.error(...));

// 修改后（正确）
try {
  sendToUser(parent.author.toString(), { ... });
} catch (e) {
  logger.error(Push resonance notify error: );
}
`

同时修正了 populate 中的字段问题：User 模型没有 dynamicTag 字段，改为仅 populate 'nickname avatar'，dynamicTag 从合鸣 Post 对象中获取。

修改位置：backend/src/controllers/postController.js createSuperEcho 方法

### 涉及文件清单
| 文件 | 改动说明 |
|------|---------|
| backend/src/controllers/postController.js | 1. sendToUser 调用从 .catch() 改为 try-catch；2. sender populate 移除不存在的 dynamicTag 字段，改从 Post 取 |

### 验证方法
1. 登录账号 A，发布一条原频
2. 退出账号 A，登录账号 B
3. 进入账号 A 发布的频率详情页
4. 填写合鸣内容（动态标签 + 标签 + 正文），点击「加入合鸣谱系」
5. 预期：Toast 显示「合鸣已加入谱系」，合鸣谱系树应新增一条记录，不再出现 500 错误
6. 退出账号 B，重新登录账号 A
7. 进入 A 的岛屿页面，预期：合鸣通知卡片应显示 1 条未读，通知列表中应能看到 B 发起的合鸣通知
8. 点击该通知，应正常跳转到对应频率详情页（谱系树页面）

### 注意事项
- **同步函数不能链式调用 .catch()**：.catch() 是 Promise 的方法，在非 Promise 值（如布尔值、undefined、null）上调用会抛出 TypeError。调用第三方函数前必须确认其返回类型
- **sendToUser 是同步函数**：它直接操作 WebSocket Map 查找和发送，不涉及异步操作，返回 boolean 表示是否发送成功
- **与 pushUnread 的区别**：pushUnread 是 async 函数，返回 Promise，所以 pushUnread(...).catch(...) 是正确的用法
- **try-catch 保护**：对于同步函数可能抛出的异常，应使用 try-catch 而非 .catch()。即使同步函数本身不抛异常，使用 try-catch 也是更安全的防御性编程
- **条件分支导致偶发性**：此 bug 只在特定条件（对他人原频发起合鸣）下触发，在自己帖子上操作不会触发，容易误判为"有时正常有时不正常"