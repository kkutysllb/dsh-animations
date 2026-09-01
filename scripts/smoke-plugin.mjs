#!/usr/bin/env node
/**
 * dsh-animations 插件冒烟测试（零依赖，node scripts/smoke-plugin.mjs）。
 *
 * 覆盖面：
 * 1. 清单一致性：skills/manifest.json ↔ 磁盘技能目录 ↔ SKILL.md frontmatter
 *    name（学霸笔记别名放行）↔ package.json files 白名单；
 * 2. host：entry.js apply() 全流程（stub ctx：skills.register ×8 +
 *    systemPrompt.section ×1 + 预设拷贝进重定向 HOME；disposer 回收）；
 * 3. 能力通告文本覆盖全部 8 个技能名；
 * 4. cordis.patch.yml id 与 package.json name 对账。
 *
 * 隔离：HOME 重定向到临时目录，测试不触碰真实 ~/.dsh。
 */
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
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

// files 白名单必须覆盖运行面（entry.js / skills / presets / docs）
for (const need of ['entry.js', 'skills', 'presets', 'docs', 'README.md']) {
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

const fakeHome = mkdtempSync(join(tmpdir(), 'anim-smoke-'))
process.env.HOME = fakeHome

const plugin = await import(join(packageRoot, 'entry.js'))
check('entry.js 命名导出 name/inject/apply', plugin.name === 'dsh-animations' && Array.isArray(plugin.inject) && typeof plugin.apply === 'function')
check('inject 声明 skills + systemPrompt', plugin.inject.includes('skills') && plugin.inject.includes('systemPrompt'))

const registered = []
const sections = []
let presetCopied = false
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
check('每个 skill 注册带 resourceBase 目录', registered.every((s) => s.resourceBase?.kind === 'directory' && existsSync(s.resourceBase.path)))
check('每个 skill 内容已剥离 frontmatter', registered.every((s) => !s.content.startsWith('---\n')))
check('预设已拷贝到重定向 HOME', existsSync(join(fakeHome, '.dsh', '.agent-presets', 'dsh-animations', 'preset.yml'))
  && existsSync(join(fakeHome, '.dsh', '.agent-presets', 'dsh-animations', 'agent.cordis.yml')))

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

/* ═══ 清理与结论 ═══ */

rmSync(fakeHome, { recursive: true, force: true })
console.log('')
if (failures > 0) {
  console.log(`\x1b[31m冒烟失败：${failures} 项\x1b[0m`)
  process.exit(1)
}
console.log('\x1b[32m冒烟通过：清单 + host + 通告 + patch 全部检查项 ✓\x1b[0m')
