# DSH Skin

[English](README.md) | 中文

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web 界面打造的外观定制插件：本地壁纸背景、主题管理、对话可读性增强与收藏夹轮播。所有设置跨页面刷新与进程重启持久化。

![License](https://img.shields.io/badge/license-MIT-blue)
![DSH](https://img.shields.io/badge/dsh-0.1.0--rc.6-gray)
![Platform](https://img.shields.io/badge/platform-Windows-lightgray)

## 目录

- [功能特性](#功能特性)
- [安装](#安装)
- [使用](#使用)
- [数据持久化](#数据持久化)
- [兼容性](#兼容性)
- [开发](#开发)
- [卸载](#卸载)
- [许可证](#许可证)

## 功能特性

- **壁纸背景** — 使用本地任意文件夹的图片作为聊天区背景；支持拖动平移、基于高度的等比缩放、三种适配模式（`cover` / `contain` / `custom`），每张图的调节结果独立记忆。
- **收藏夹与轮播** — 收藏图片及其调节后的设置；再次调节时设置实时同步。支持以 3 秒至 1 小时的间隔轮播收藏夹；清空收藏需二次确认。
- **主题系统** — 自动提取当前壁纸的主色调，或使用内置预设与自定义取色器。着色强度、背景纱幕浓度、输入框透出度、气泡透出度均可独立调节。
- **可读性** — 对话气泡使用半透明对比色；工具调用、统计条、产物行等环境文字采用高对比颜色与主题感知的文字阴影。
- **自适应预览** — 实时测量真实页面几何（侧栏、聊天列、详情列）并连续重测，多显示器环境下预览与页面完全一致。
- **服务端缩略图** — 缩略图由宿主机生成（PowerShell / System.Drawing）并磁盘缓存，大文件夹下设置页依然流畅。
- **持久化** — 所有偏好存储于 JSON 状态文件，启动时自动恢复。

## 安装

### 前置要求

- Windows
- 已运行的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web profile（版本要求见[兼容性](#兼容性)）

### 步骤

1. 将 `dsh-skin` 包目录复制到 web profile：

   ```
   %USERPROFILE%\.dsh\profiles\web\node_modules\dsh-skin
   ```

   （如 `node_modules` 目录不存在则先创建。）

2. 在 `%USERPROFILE%\.dsh\profiles\web\cordis.patch.yml` 中注册插件：

   ```yaml
   - insert:
       - id: dsh-skin
         name: 'dsh-skin'
         inject: [webServer, fs]
   ```

   如文件已有其他条目，将 `- insert:` 块追加到末尾。

3. 重启 `dsh web`。

4. 打开插件设置分节，选择图片文件夹。

**快速安装** — 在仓库根目录运行 `.\install.ps1`（自动复制包并幂等写入注册行），然后重启 `dsh web`。卸载运行 `.\uninstall.ps1`。

完整指引（含数据迁移与排障）见 [INSTALL.md](INSTALL.md)。

## 使用

打开 Harness 侧栏的**设置**，找到插件分节，即可：

- 选择壁纸文件夹并浏览图片（邻近缩略图条、收藏夹条、下拉列表）。
- 调整当前图片的位置与缩放，改动即时生效于页面。
- 收藏图片、管理收藏夹、控制轮播播放与间隔。
- 配置主题（自动识别 / 预设 / 自定义颜色）与四项透明度控制。
- 借助实时预览在关闭面板前完成构图微调。

## 数据持久化

- **状态文件** — `.dsh-skin-state.json`，相对 `dsh` 进程的工作目录解析。包含收藏夹、逐图设置与主题偏好；删除后插件恢复默认。
- **缩略图缓存** — `.dsh-skin-thumbs/`，按需重新生成，可安全删除。
- 工作目录之外不写入任何文件。

## 兼容性

- 背景与主题功能基于稳定的主题令牌实现，跨次要版本保持可用。
- 部分 UI 样式针对当前前端构建（`0.1.0-rc.6`）的哈希类名，其他版本下可能静默失效；核心功能不受影响。

## 开发

- 仓库结构：`lib/index.js`（宿主半身：HTTP API、图片与缩略图路由）、`lib/client.js`（浏览器半身：设置 UI、主题引擎、预览）、`package.json`（双面包声明）。
- 宿主半身通过小型 JSON API（`/dsh-skin-api/*`）与客户端半身通信。
- 变更后请用 `node --check` 校验两个文件；客户端 bundle 直接由磁盘提供，仅客户端改动刷新页面即可生效，宿主改动需重启 harness。

## 卸载

1. 删除 `%USERPROFILE%\.dsh\profiles\web\node_modules\dsh-skin`。
2. 从 `cordis.patch.yml` 移除 `- insert:` 块。
3. 重启 `dsh web`。

## 许可证

[MIT](LICENSE) © 2026 HuggingFries
