#!/usr/bin/env node
/**
 * dsh-skin 适配工具 —— dsh 每次升级后运行一次:
 *
 *   node tools/adapt.mjs [dsh安装路径]
 *
 * 原理:rc.1 起,dsh 客户端包的 CSS Modules 以“语义键 → 哈希类名”导出
 * (如 AssistantMarkdown = { root: "hWmORq_root", body: … })。语义键跨版本
 * 基本稳定,只有哈希值随构建变化。本工具按 ROLE_TABLE 从已安装的 dsh
 * 客户端 bundle 中抓取新哈希,重写 lib/client.js 里的 ADAPT 常量
 * (文件内 ::ADAPT-BEGIN:: / ::ADAPT-END:: 标记之间),客户端运行时据此
 * 生成注入 CSS —— 无需手工改选择器。
 *
 * 找不到目标模块/键时会打印该模块实际导出的键,便于更新角色表。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..')
const clientFile = join(repoRoot, 'lib', 'client.js')

/** 皮肤用到的角色 → 所在 CSS 模块(文件名可含通配)+ 语义键。 */
const ROLE_TABLE = [
  // 助手内容根(皮肤为它画气泡壳)
  { role: 'assistantRoot', module: 'AssistantMarkdown', file: 'dsh-client-ui-chat', key: 'root' },
  // 用户消息气泡(产品自带,用于探针与“清阴影”规则)
  { role: 'bubble', module: 'MessageItem', file: 'dsh-client-ui-chat', key: 'bubble' },
  // 消息时间戳
  { role: 'timeStart', module: 'MessageIconActions', file: 'dsh-client-ui-chat', key: 'timeStart' },
  { role: 'timeEnd', module: 'MessageIconActions', file: 'dsh-client-ui-chat', key: 'timeEnd' },
]

function fail(message) {
  console.error(`[dsh-skin/adapt] ${message}`)
  process.exit(1)
}

/** 定位 dsh 安装根(参数 > DSH_INSTALL > npm 全局根下的 @deepseek-ai/dsh)。 */
function locateDsh() {
  const given = process.argv[2]
  if (given) {
    if (existsSync(join(given, 'package.json'))) return given
    fail(`给定路径不是 dsh 安装根:${given}`)
  }
  if (process.env.DSH_INSTALL) return process.env.DSH_INSTALL
  try {
    const npmRoot = execSync('npm root -g', { encoding: 'utf8' }).trim()
    const candidate = join(npmRoot, '@deepseek-ai', 'dsh')
    if (existsSync(candidate)) return candidate
  } catch { /* ignore */ }
  if (process.env.APPDATA) {
    const candidate = join(process.env.APPDATA, 'npm', 'node_modules', '@deepseek-ai', 'dsh')
    if (existsSync(candidate)) return candidate
  }
  fail('找不到 dsh 安装,请显式传入路径:node tools/adapt.mjs <dsh安装目录>')
}

/** 解析一个 client bundle 文件里指定 css 模块的语义键表。 */
function parseModuleMap(filePath, moduleName, wantedKeys) {
  const text = readFileSync(filePath, 'utf8')
  const re = new RegExp(`var ${moduleName}_module_css_default = \\{([\\s\\S]*?)\\n\\s*\\};`)
  const m = re.exec(text)
  if (!m) return null
  const body = m[1]
  const map = {}
  for (const item of body.matchAll(/"([\w-]+)":\s*"([A-Za-z0-9_-]+)"/g)) {
    map[item[1]] = item[2]
  }
  const missing = wantedKeys.filter((key) => !map[key])
  if (missing.length) {
    fail(
      `模块 ${moduleName}(${filePath}) 缺少键:${missing.join(', ')};` +
        `实际导出:${Object.keys(map).join(', ')} —— 请更新 tools/adapt.mjs 的角色表`
    )
  }
  return map
}

/** 在 client.js 的 ::ADAPT-BEGIN:: / ::ADAPT-END:: 标记之间写入新常量。 */
function rewriteAdaptConstant(values) {
  const source = readFileSync(clientFile, 'utf8')
  const start = source.indexOf('// ::ADAPT-BEGIN::')
  const end = source.indexOf('// ::ADAPT-END::')
  if (start < 0 || end < 0) fail('client.js 缺少 ::ADAPT-BEGIN:: / ::ADAPT-END:: 标记')
  const head = source.slice(0, start)
  const tail = source.slice(end)
  const block = [
    '// ::ADAPT-BEGIN::',
    '    const ADAPT = {',
    ...Object.entries(values).map(([role, cls]) => `      ${role}: "${cls}",`),
    '    };',
    '    // ::ADAPT-END::',
  ].join('\n')
  writeFileSync(clientFile, head + block + tail)
}

const dshRoot = locateDsh()
const dshPkg = JSON.parse(readFileSync(join(dshRoot, 'package.json'), 'utf8'))
const dshVersion = dshPkg.version || 'unknown'

const values = {}
for (const item of ROLE_TABLE) {
  const filePath = join(dshRoot, 'node_modules', '@deepseek-ai', item.file, 'lib', 'client.js')
  if (!existsSync(filePath)) fail(`找不到客户端包:${filePath}`)
  const map = parseModuleMap(filePath, item.module, [item.key])
  values[item.role] = map[item.key]
}

rewriteAdaptConstant(values)
console.log(`[dsh-skin/adapt] dsh ${dshVersion} →`)
for (const [role, cls] of Object.entries(values)) console.log(`  ${role}: ${cls}`)
console.log(`[dsh-skin/adapt] 已重写 ${clientFile} 的 ADAPT 常量;请验证后提交推送。`)
