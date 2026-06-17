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
