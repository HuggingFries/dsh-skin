# 设置背景 (◕‿◕) — 插件安装说明

一个给 DSH Web 界面加本地图片背景 + 收藏夹 + 主题系统的插件。
本包为**自包含**版本：`dsh-skin/` 目录即全部代码，无外部依赖（仅 Windows 自带 PowerShell 用于缩略图）。

## 安装（目标机器）

### 前提
- Windows + 已安装 DSH（推荐与作者相同的版本 `0.1.0-rc.6`，见下方"版本兼容性"）
- 图片目录：准备一个存放背景图的文件夹（任意位置）

### 步骤

1. **复制包**：把 `dsh-skin` 整个文件夹复制到：
   ```
   %USERPROFILE%\.dsh\profiles\web\node_modules\dsh-skin
   ```
   （即 `C:\Users\<你的用户名>\.dsh\profiles\web\node_modules\dsh-skin`；若 `node_modules` 目录不存在则新建）

2. **注册插件**：打开文件 `%USERPROFILE%\.dsh\profiles\web\cordis.patch.yml`，把内容替换为：
   ```yaml
   # Your patch layer for this dsh profile, applied after every bundle layer:
   # a top-level YAML array of loader patch entries (id-targeted config
   # overrides, disables, and insert lists; `!!js` expressions allowed).

   # 设置背景 (◕‿◕) — dsh-skin
   - insert:
       - id: dsh-skin
         name: 'dsh-skin'
         inject: [webServer, fs]
   ```
   （如果该文件已有其他内容，把最后的 `- insert:` 段追加进去即可，不要覆盖原有条目）

3. **重启**：停止并重新启动 `dsh web`（从任何目录启动均可）

4. **选择图片文件夹**：打开 设置 → 设置背景 (◕‿◕) → 点"选择文件夹…"选你的图片目录。首次打开会自动选第一张宽幅图。

### 验证
- 背景应自动出现；设置页有：收藏夹 / 播放 / 位置缩放 / 主题（自动识别、预设、自定义、三个透明度滑块）

## 可选：迁移个人数据

把旧机器的 `C:\Users\zxy\.dsh-skin-state.json`（收藏夹、主题、每图设置）复制到新机器**启动 dsh 的目录**下（状态文件按 dsh 进程启动目录解析；不确定的话，先启动一次 dsh、在设置里随便改个值，再看新机器上生成了哪个 `.dsh-skin-state.json`，用同目录覆盖即可）。

## 版本兼容性

- 插件的背景、主题、收藏夹等功能基于**主题令牌**实现，跨小版本基本稳定；
- 部分 UI 样式（工具卡片文字、布局预览测量、统计条等）使用了当前前端构建的哈希类名（如 `.o3BgMG_*`、`.pI_x6G_*`）。**若新机器 dsh 版本与 `0.1.0-rc.6` 不同**，这些样式可能静默失效（不影响背景/主题主功能），失效时把对应类名按新版本前端更新即可。

## 卸载

1. 删除 `%USERPROFILE%\.dsh\profiles\web\node_modules\dsh-skin`
2. 把 `cordis.patch.yml` 中的 `- insert:` 段删除（恢复为 `[]`）
3. 重启 dsh
