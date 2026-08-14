# 设置背景插件 (anibg-1) 问题追踪

> 用法：发现新问题直接在本文件末尾追加一条；格式见下。修复后把状态改为 `已修复` 并注明修复版本。
> 插件当前版本：固化版 v3（永久插件），源码位置：`E:\dsh\dsh-skin\`（经 junction 挂在 `C:\Users\zxy\.dsh\profiles\web\node_modules\dsh-skin`）
> 会话权限：danger-full-access（审批已关闭）

## 记录格式

```md
### [编号] 状态：待修复 | 修复版本
- 描述：
- 期望行为：
```

---

## 已记录问题

### [ISSUE-01] 状态：已修复（v9 实现，待用户验证）
- 描述：网格模式（全部缩略图）太卡；且"网格选择"交互不符合使用习惯。
- 期望行为：去掉独立网格模式，改为"收藏夹系统"：浏览时对感兴趣的图点"收藏"（保存的是**该图经过用户调节后的版本**：位置/缩放设置），可对收藏夹整体循环播放，也可单张播放。

### [ISSUE-02] 状态：已修复（v9 实现，待用户验证）
- 描述：界面配色始终是默认主题，无法与背景图搭配。
- 期望行为：新增"主题"设置：用户可以手动选择预设主题（颜色/UI 风格/透明度），也可以选择"自动识别"——由插件从背景图中提取主色调，自动生成契合的页面主题；两者也可刻意不契合（即主题独立于背景图选择）。保留纱幕浓度（背景透出度）独立调节。

### [ISSUE-03] 状态：已修复（v10 实现，待用户验证）
- 描述：主题色太弱——底色基本还是纯黑/纯白，用户想要强着色（例如侧边栏变成红色）；需要自定义颜色能力。
- 期望行为：新增"自定义"主题模式（取色器选主色）+ "着色强度"滑块（0-100%），强度拉高后侧边栏/面板/底色应明显呈现所选颜色；预设与自动识别模式同样受强度控制。

### [ISSUE-04] 状态：已修复（v10/v11 实现，待用户验证）
- 描述：换背景后对话气泡里的白字有时看不清（气泡透明度过高或颜色与背景冲突）。
- 期望行为：对话气泡（用户/高亮气泡）使用与背景对比的半透明着色——暗色模式下深色半透明气泡衬白字，亮色模式下浅色半透明气泡衬黑字，保证可读。
- 补充：v11 发现助手消息原本无气泡（.Sxvs8a_root 透明底），已为其新增对比色气泡，所有主题模式（含不干预）生效。

### [ISSUE-05] 状态：已修复（v12 实现，待用户验证）
- 描述：每次插件更新/刷新页面后，图片的个性化调节（位置/缩放）变回默认。
- 原因：每图调节 perImage 只存内存，未写入状态文件。
- 修复：perImage 纳入 save-state/load-state（拖动/滑块用 timer.debounce 800ms 防抖保存）；注意 v12 这次更新本身会清一次（旧数据没存过），之后不再重置。

### [ISSUE-06] 状态：已修复（固化方案已部署，待重启验证）
- 描述：刷新页面后整个插件（背景/设置页）消失。
- 原因：动态插件的客户端半身绑定页面实例，刷新后浏览器侧实例销毁；宿主半身仍在（路由照常出图），但 UI 与背景样式都由客户端持有。
- 临时恢复：重新 cordis_run 重启 run 即可。
- 根治（已部署）：固化插件包 `C:\Users\zxy\.dsh\profiles\web\node_modules\dsh-skin\`（package.json + lib/index.js 宿主半身 + lib/client.js 客户端半身，`window.__ModuleLoader__.load` 官方格式），并在 `profiles\web\cordis.patch.yml` 注册 `- id: dsh-skin / name: 'dsh-skin'`。重启 dsh web 后生效；动态版 anibg-1 随重启自然消失，不冲突。
- 备注：状态文件实际位于 dsh 进程启动目录（当前为 C:\Users\zxy\.dsh-skin-state.json，按 sandboxPolicy.workspaceRoot 解析）；从不同目录启动 dsh 会读不到旧状态。
- 回滚：若启动失败，把 cordis.patch.yml 改回 `[]` 并删除 dsh-skin 目录。

### [ISSUE-07] 状态：已修复（守卫修复完成，待重启验证）
- 描述：固化版首次重启报 `Cannot read properties of null (reading 'debounce')`，Web 启动失败；由外部工具（Claude Code）修复 256 行守卫后恢复。
- 根因：移植动态代码时把 `const timer = ctx.get('timer')`（服务缺失时为 undefined）改成 `let timerRef = null`，但守卫仍是 `!== undefined`——null 通过守卫后执行 `null.debounce` 抛错，发生在客户端工厂导入期，导致插件表整体加载失败。
- 修复：`timerRef`/`themeRef` 全部改为 `!= null` 守卫；新增 Node 冒烟测试（stub window/__ModuleLoader__/require 求值工厂）验证导入期安全。
- 教训：动态插件代码移植到常规插件时，ctx.get 的 undefined 语义 ≠ null 初始值；大改动必须做导入期冒烟测试。

### [ISSUE-08] 状态：已修复（激活时序修复完成，待重启验证）
- 描述：重启后能进但插件不生效——探针显示 /dsh-skin-api/* 与 /dsh-skin/* 全部落到 SPA 兜底（宿主路由未注册），客户端 bundle 正常服务（包解析 OK）。
- 根因：移植时丢失依赖声明，两个激活时序 bug：
  1. 宿主 apply 直接 `ctx.get('webServer'/'fs')` 无 inject——启动早期执行时服务未就绪 → 静默早退 → 路由全无（动态版原本有 inject: ['webServer','fs']）。
  2. 客户端导出 inject: [] ——可能在 slots 服务就绪前激活 → 设置分节注册失败。
- 修复：宿主改 `ctx.inject(['webServer','fs'], ...)` + 补丁行 `inject: [webServer, fs]`（双保险）；客户端导出 `inject: ["slots"]`。宿主逻辑冒烟测试（stub ctx 跑 apply 断言 5 条路由注册）通过。
- 教训：常规插件没有动态版的注入语义继承——依赖必须显式声明；仅靠 ctx.get + 早退检查会静默失效。另确认浏览器内核模块表支持 `require("react")`（官方 ui-model-selection 同款）。
