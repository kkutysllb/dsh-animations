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
 * 5. client：ModuleLoader stub 加载 lib/client.js，断言工作台注册面
 *    （panellist + main、会话桥服务声明、工作区菜单文案）与
 *    buildPrompt / 会话桥纯函数行为。
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

// files 白名单必须覆盖运行面（entry.js / skills / client / docs）
for (const need of ['entry.js', 'skills', 'lib/client.js', 'docs', 'README.md']) {
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

/* ═══ 5. client 工作台（lib/client.js：目录对账 + ModuleLoader stub 行为断言）═══ */

{
  const client = readFileSync(join(packageRoot, 'lib/client.js'), 'utf8')
  const names = manifest.skills.map((s) => s.name)
  check('client 内联技能目录覆盖全部技能名', names.every((n) => client.includes(`name: "${n}"`)))
  check('package.json exports 暴露 ./client → lib/client.js', pkg.exports?.['./client'] === './lib/client.js')
  check('client 走 __ModuleLoader__ 自注册形态', client.includes('__ModuleLoader__.load') && client.includes('exports.apply'))
  // panellist/main 注册与软探测回退
  check('client 注册 sidebar.panellist + main 双 slot（同 id anim-panel）',
    client.includes('name: "sidebar.panellist"') && client.includes('name: "main"') && client.includes('"anim-panel"'))
  check('client 软探测回退（try/catch 包裹注册）', client.includes('宿主无左侧栏 slot'))
  // 会话桥服务面：工作区菜单 + 投递所需 cordis 服务
  check('client 声明会话桥服务（sessions/uiWorkspace/workspaces/layout/conversation）',
    client.includes('"sessions"') && client.includes('"uiWorkspace"') && client.includes('"workspaces"')
    && client.includes('"layout"') && client.includes('"conversation"'))
  check('client 声明 dsh.client.inject 五个 runtime 包', Array.isArray(pkg.dsh?.client?.inject) && pkg.dsh.client.inject.length === 5)
  check('client 工作区菜单文案齐备（跟随当前工作区）', client.includes('wsFollow'))
  check('client 会话桥实现齐备（根 conversation 服务 + setDraft + submit + 剪贴板降级）',
    client.includes('get("conversation")') && client.includes('input.shell')
    && client.includes('setDraft') && client.includes('submit') && client.includes('clipboardFallback'))
}

// ModuleLoader stub 加载 client 工厂：断言 __testHooks 纯函数行为
{
  const loaded = {}
  globalThis.window = { __ModuleLoader__: { load: (def) => { loaded[def.id] = def.factory } } }
  try {
    await import(join(packageRoot, 'lib/client.js'))
    check('client bundle 经 __ModuleLoader__ 自注册', typeof loaded['dsh-animations'] === 'function')
    const reactStub = { createElement: (type, props) => ({ $$type: type, props: props || {} }) }
    const clientExports = loaded['dsh-animations'](() => reactStub)
    check('client exports.apply/inject 暴露', typeof clientExports.apply === 'function' && Array.isArray(clientExports.inject))
    check('client inject 含 slots/locale + 会话桥五服务',
      clientExports.inject.includes('slots') && clientExports.inject.includes('locale')
      && clientExports.inject.includes('sessions') && clientExports.inject.includes('uiWorkspace')
      && clientExports.inject.includes('workspaces') && clientExports.inject.includes('layout')
      && clientExports.inject.includes('conversation'))
    const hooks = clientExports.__testHooks
    check('client 暴露 __testHooks（buildPrompt/sendToChat/SKILLS）',
      typeof hooks?.buildPrompt === 'function' && typeof hooks?.sendToChat === 'function' && Array.isArray(hooks?.SKILLS))
    check('client 内联技能目录 8 条且与 manifest 同名',
      hooks.SKILLS.length === 8 && manifest.skills.every((s) => hooks.SKILLS.some((c) => c.name === s.name)))
    check('buildPrompt：选中技能 → 「用 <skill> <需求>」',
      hooks.buildPrompt({ name: 'ppt-animation' }, '  做一个 HTTP 演示  ') === '用 ppt-animation 做一个 HTTP 演示')
    check('buildPrompt：未选技能 → 需求原文', hooks.buildPrompt(null, '做一个流程图动画') === '做一个流程图动画')
    check('sendToChat：无宿主服务时降级不抛错（返回 Promise）',
      typeof hooks.sendToChat(null, 'x')?.then === 'function')
    await hooks.sendToChat(null, 'x').then((r) => {
      check('sendToChat：空 ctx → 返回 none（不假装提交）', r === 'none')
    })
  } finally {
    delete globalThis.window
  }
}

/* ═══ 清理与结论 ═══ */

console.log('')
if (failures > 0) {
  console.log(`\x1b[31m冒烟失败：${failures} 项\x1b[0m`)
  process.exit(1)
}
console.log('\x1b[32m冒烟通过：清单 + host + 通告 + patch + client 全部检查项 ✓\x1b[0m')
