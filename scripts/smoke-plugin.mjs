#!/usr/bin/env node
/**
 * dsh-animations 插件冒烟测试（零依赖，node scripts/smoke-plugin.mjs）。
 *
 * 覆盖面：
 * 1. 清单一致性：skills/manifest.json ↔ 磁盘技能目录 ↔ SKILL.md frontmatter
 *    name（学霸笔记别名放行）↔ package.json files 白名单；
 * 2. host：entry.js apply() 全流程（stub ctx：skills.register ×8 +
 *    systemPrompt.section ×1；disposer 回收）；
 * 3. 能力通告文本覆盖全部 8 个技能名；
 * 4. cordis.patch.yml id 与 package.json name 对账；
 * 5. 契约层哨兵：无 client 交付面（exports/files/磁盘三处无 lib）/
 *    peerDependencies 只声明 @deepseek-ai/dsh 且 optional / 发版记录对账。
 *
 * 说明：本仓自 v1.2.4 后的工作分支起为**纯 host 插件**——Web GUI 左侧栏
 * 「动效技能库」工作台（lib/client.js / dsh.client / qilin.client）已移除，
 * 只保留 Agent 后台调用能力（8 个 runtime skill + 能力通告 section）。
 */
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

let failures = 0
function check(name, condition, detail = '') {
  const mark = condition ? 'PASS' : 'FAIL'
  console.log(`\x1b[${condition ? 32 : 31}m${mark}\x1b[0m  ${name}${detail ? ' — ' + detail : ''}`)
  if (!condition) failures += 1
}

/* ═══ 1. 清单一致性 ═══ */

const pkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))
const manifest = JSON.parse(readFileSync(join(packageRoot, 'skills', 'manifest.json'), 'utf8'))

check('package.json name = dsh-animations', pkg.name === 'dsh-animations')
check('dsh.bundle.patch 指向存在的 cordis.patch.yml', pkg.dsh?.bundle?.patch === './cordis.patch.yml' && existsSync(join(packageRoot, 'cordis.patch.yml')))
check('main 入口 entry.js 存在', pkg.main === 'entry.js' && existsSync(join(packageRoot, 'entry.js')))
check('预设模式已移除（files 白名单与磁盘均无 presets）', !pkg.files.includes('presets') && !existsSync(join(packageRoot, 'presets')))

// files 白名单必须覆盖运行面（entry.js / skills / docs）
for (const need of ['entry.js', 'skills', 'docs', 'README.md']) {
  check(`files 白名单含 ${need}`, Array.isArray(pkg.files) && pkg.files.includes(need))
}

check('manifest.skills 是非空数组', Array.isArray(manifest.skills) && manifest.skills.length === 8)
check('技能名唯一', new Set(manifest.skills.map((s) => s.name)).size === manifest.skills.length)

// frontmatter name 别名表：目录名 / 清单名之外的既有命名（学霸笔记）
const ALIASES = { 'scholar-notes': ['学霸笔记'] }

for (const item of manifest.skills) {
  const dir = join(packageRoot, 'skills', item.dir)
  check(`技能目录存在：${item.dir}`, existsSync(join(dir, 'SKILL.md')))
  const raw = readFileSync(join(dir, 'SKILL.md'), 'utf8')
  const fm = raw.startsWith('---\n') ? raw.slice(4, raw.indexOf('\n---\n', 4)) : ''
  const nameMatch = fm.match(/^name:\s*["']?([^"'\n]+)["']?\s*$/m)
  const allowed = [item.name, item.dir, ...(ALIASES[item.name] ?? [])]
  check(`frontmatter name 对账：${item.dir}`, !!nameMatch && allowed.includes(nameMatch[1].trim()),
    nameMatch ? `frontmatter=${nameMatch[1].trim()} manifest=${item.name}` : 'frontmatter 无 name 行')
  check(`description 非空：${item.name}`, typeof item.description === 'string' && item.description.length > 20)
}

/* ═══ 2. host：entry.js apply() 全流程 ═══ */

const plugin = await import(join(packageRoot, 'entry.js'))
check('entry.js 命名导出 name/inject/apply', plugin.name === 'dsh-animations' && Array.isArray(plugin.inject) && typeof plugin.apply === 'function')
check('inject 声明 skills + systemPrompt', plugin.inject.includes('skills') && plugin.inject.includes('systemPrompt'))
check('inject 只声明 host 服务（无 client 面残留）', plugin.inject.length === 2)

const registered = []
const sections = []
const ctx = {
  skills: {
    register(spec) {
      registered.push(spec)
      return () => { registered.splice(registered.indexOf(spec), 1) }
    },
  },
  systemPrompt: {
    section(spec) {
      sections.push(spec)
      return () => { sections.splice(sections.indexOf(spec), 1) }
    },
  },
}

const dispose = plugin.apply(ctx, {})
check('注册 8 个 runtime skill', registered.length === 8, registered.map((s) => s.name).join(', '))
check('注册 1 段能力通告 section', sections.length === 1 && sections[0].name === 'plugin:dsh-animations')
check('通告排序为 207', sections[0]?.order === 207)
check('每个 skill 注册带 resourceBase 目录', registered.every((s) => s.resourceBase?.kind === 'directory' && Boolean(s.resourceBase.path)))
check('每个 skill 内容已剥离 frontmatter', registered.every((s) => !s.content.startsWith('---\n')))

dispose()
check('disposer 后 skills/sections 全部回收', registered.length === 0 && sections.length === 0)

// enabled:false 短路
{
  const reg2 = []
  const ctx2 = {
    skills: { register: (s) => { reg2.push(s); return () => {} } },
    systemPrompt: { section: () => () => {} },
  }
  const d2 = plugin.apply(ctx2, { enabled: false })
  check('enabled:false 时零注册', reg2.length === 0 && typeof d2 === 'function')
}

// announceToAgent:false 只关通告
{
  const sections2 = []
  const ctx3 = {
    skills: { register: () => () => {} },
    systemPrompt: { section: (s) => { sections2.push(s); return () => {} } },
  }
  plugin.apply(ctx3, { announceToAgent: false })
  check('announceToAgent:false 时无通告', sections2.length === 0)
}

/* ═══ 3. 能力通告覆盖全部技能名 ═══ */

{
  const guidance = plugin.ANIMATIONS_GUIDANCE
  const missing = manifest.skills.filter((s) => !guidance.includes(s.name)).map((s) => s.name)
  check('通告文本覆盖全部 8 个技能名', missing.length === 0, missing.join(', '))
  check('通告文本包含插件包根资产路径约定', guidance.includes('skills/<skill>/assets/'))
}

/* ═══ 4. cordis.patch.yml 对账 ═══ */

{
  const patch = readFileSync(join(packageRoot, 'cordis.patch.yml'), 'utf8')
  check('patch 声明 insert id = 包名', patch.includes('- id: dsh-animations') && patch.includes("name: 'dsh-animations'"))
  check('patch 头注释说明 bundle 物化路径', patch.includes('dsh.bundle.patch'))
}

/* ═══ 5. 契约层哨兵（manifest 为纯 host 插件）═══ */

{
  const PEER_RANGE = '>=0.1.0-rc.5 <1.0.0'

  // —— client 交付面已整体移除（v1.2.4 后工作分支：只保留 Agent 后台调用能力）——
  for (const channel of ['dsh', 'qilin']) {
    check(`${channel} 通道无 client 声明`, pkg[channel]?.client === undefined)
    check(`${channel}.bundle.patch 仍指向 cordis.patch.yml`, pkg[channel]?.bundle?.patch === './cordis.patch.yml')
  }
  check('exports 不再暴露 ./client', pkg.exports?.['./client'] === undefined)
  check('files 白名单无 lib/client.js', Array.isArray(pkg.files) && !pkg.files.includes('lib/client.js'))
  check('磁盘无 lib/ 目录（client bundle 已删除）', !existsSync(join(packageRoot, 'lib')))

  // —— peer：0.1.7+ 插件版本兼容门只读 peerDependencies ——
  // 上界 <1.0.0 覆盖 0.2.x 全系：旧上界 <0.2.0 对 0.2.1-alpha.1 求值为 false，
  // app-boot 兼容闸门会静默跳过整个 bundle
  const peers = pkg.peerDependencies ?? {}
  const peerNames = Object.keys(peers)
  check('peerDependencies 只声明 @deepseek-ai/dsh（client 引擎包已移除）',
    peerNames.length === 1 && peerNames[0] === '@deepseek-ai/dsh')
  check(`peerDependencies 范围为 ${PEER_RANGE}（覆盖 0.1.x–0.2.x 含 prerelease）`,
    peers['@deepseek-ai/dsh'] === PEER_RANGE)
  const meta = pkg.peerDependenciesMeta ?? {}
  check('peerDependenciesMeta 为 optional（防 pnpm 自动安装把引擎树拉进 profile）',
    meta['@deepseek-ai/dsh']?.optional === true && Object.keys(meta).length === 1)

  // 版本对账：发版记录随包版本走
  check(`发版记录对账：release/v${pkg.version}.md 存在`,
    existsSync(join(packageRoot, 'release', `v${pkg.version}.md`)))
}

/* ═══ 清理与结论 ═══ */

console.log('')
if (failures > 0) {
  console.log(`\x1b[31m冒烟失败：${failures} 项\x1b[0m`)
  process.exit(1)
}
console.log('\x1b[32m冒烟通过：清单 + host + 通告 + patch + 契约哨兵 全部检查项 ✓\x1b[0m')
