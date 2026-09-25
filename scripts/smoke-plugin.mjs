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
 *    buildPrompt / 会话桥纯函数行为；
 * 6. 0.1.7 契约层哨兵：死包 dsh-client-runtime 移除 / 两通道 inject 冻结
 *    4 引擎包 / peerDependencies 五条含 prerelease 范围且全 optional /
 *    发版记录对账；
 * 7. 会话桥 v4 断言：mainView 选择态判定、fillDraft 同口径壳解析、
 *    setDraft→submit 闭环、无 submit 绝不报 submitted、挂载重试、
 *    sessions.using 持引用、create+openSession 新会话路径、
 *    openWorkspace(beforeOpen) 落点、旧宿主面（≤0.1.6）回归。
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
  check('client 工作区菜单文案齐备（跟随当前工作区）', client.includes('wsFollow'))
  check('client 会话桥 v4 实现齐备（根 conversation 服务 + fillDraft 同口径壳解析 + setDraft + submit + 剪贴板降级）',
    client.includes('get("conversation")') && client.includes('input.for')
    && client.includes('setDraft') && client.includes('submit') && client.includes('clipboardFallback')
    && client.includes('sendToChatV4'))
}

// ModuleLoader stub 加载 client 工厂：断言 __testHooks 纯函数行为
let clientFactory = null
{
  const loaded = {}
  globalThis.window = { __ModuleLoader__: { load: (def) => { loaded[def.id] = def.factory } } }
  try {
    await import(join(packageRoot, 'lib/client.js'))
    check('client bundle 经 __ModuleLoader__ 自注册', typeof loaded['dsh-animations'] === 'function')
    clientFactory = loaded['dsh-animations']
    const reactStub = { createElement: (type, props) => ({ $$type: type, props: props || {} }) }
    const clientExports = loaded['dsh-animations'](() => reactStub)
    check('client exports.apply/inject 暴露', typeof clientExports.apply === 'function' && Array.isArray(clientExports.inject))
    check('client inject 含 slots/locale + 会话桥五服务',
      clientExports.inject.includes('slots') && clientExports.inject.includes('locale')
      && clientExports.inject.includes('sessions') && clientExports.inject.includes('uiWorkspace')
      && clientExports.inject.includes('workspaces') && clientExports.inject.includes('layout')
      && clientExports.inject.includes('conversation'))
    const hooks = clientExports.__testHooks
    check('client 暴露 __testHooks（buildPrompt/sendToChatV4/桥基元/SKILLS）',
      typeof hooks?.buildPrompt === 'function' && typeof hooks?.sendToChatV4 === 'function'
      && typeof hooks?.currentSessionId === 'function' && typeof hooks?.inputShellFor === 'function'
      && Array.isArray(hooks?.SKILLS))
    check('client 内联技能目录 8 条且与 manifest 同名',
      hooks.SKILLS.length === 8 && manifest.skills.every((s) => hooks.SKILLS.some((c) => c.name === s.name)))
    check('buildPrompt：选中技能 → 「用 <skill> <需求>」',
      hooks.buildPrompt({ name: 'ppt-animation' }, '  做一个 HTTP 演示  ') === '用 ppt-animation 做一个 HTTP 演示')
    check('buildPrompt：未选技能 → 需求原文', hooks.buildPrompt(null, '做一个流程图动画') === '做一个流程图动画')
    check('sendToChatV4：无宿主服务时降级不抛错（返回 Promise）',
      typeof hooks.sendToChatV4(null, 'x')?.then === 'function')
    await hooks.sendToChatV4(null, 'x').then((r) => {
      check('sendToChatV4：空 ctx → 返回 none（不假装提交）', r === 'none')
    })
  } finally {
    delete globalThis.window
  }
}

/* ═══ 6. 0.1.7 契约层哨兵（manifest）═══ */

{
  const DEAD_PKG = '@deepseek-ai/dsh-client-runtime'
  const FROZEN = [
    '@deepseek-ai/dsh-client-locale',
    '@deepseek-ai/dsh-client-ui-slots',
    '@deepseek-ai/dsh-client-ui-conversation',
    '@deepseek-ai/dsh-client-ui-workspace',
  ]
  for (const channel of ['dsh', 'qilin']) {
    const inject = pkg[channel]?.client?.inject
    check(`${channel}.client.inject 移除死包（0.1.7 已删 ${DEAD_PKG}）`, Array.isArray(inject) && !inject.includes(DEAD_PKG))
    check(`${channel}.client.inject 冻结为 4 引擎包`, Array.isArray(inject) && inject.length === 4 && FROZEN.every((p) => inject.includes(p)))
    check(`${channel}.client.bundle / bundle.patch 指向不变`,
      pkg[channel]?.client?.bundle === './lib/client.js' && pkg[channel]?.bundle?.patch === './cordis.patch.yml')
  }
  // peer 三则（0.1.7 插件版本兼容门只读 peerDependencies；optional 是安装面护栏）
  const PEER_RANGE = '>=0.1.0-rc.5 <0.2.0'
  const peers = pkg.peerDependencies ?? {}
  const peerNames = Object.keys(peers)
  check('peerDependencies 声明 @deepseek-ai/dsh + 4 引擎包（共 5 条）',
    peerNames.length === 5 && ['@deepseek-ai/dsh', ...FROZEN].every((p) => peerNames.includes(p)))
  check(`peerDependencies 范围均为 ${PEER_RANGE}（覆盖 0.1.x 含 prerelease）`,
    peerNames.every((p) => peers[p] === PEER_RANGE))
  const meta = pkg.peerDependenciesMeta ?? {}
  check('peerDependenciesMeta 全部 optional（防 pnpm 自动安装把引擎树拉进 profile）',
    peerNames.every((p) => meta[p]?.optional === true))
  // 版本对账：发版记录随包版本走
  check(`发版记录对账：release/v${pkg.version}.md 存在`,
    existsSync(join(packageRoot, 'release', `v${pkg.version}.md`)))
}

/* ═══ 7. 会话桥 v4 断言（0.1.7 契约面）═══ */

{
  const reactStub = { createElement: (type, props) => ({ $$type: type, props: props || {} }) }
  const hooks = clientFactory(() => reactStub).__testHooks
  const { sendToChatV4, currentSessionId, inputShellFor } = hooks

  // —— 选择态判定（mainView 口径）——
  check('currentSessionId：0.1.7 mainView 持有者即当前会话（current 字段已删）',
    currentSessionId({ list: { getSnapshot: () => ({ byId: { a: { retainedBy: { other: 2 } }, b: { retainedBy: { mainView: 1 } } } }) } }) === 'b')
  check('currentSessionId：mainView=0 不算选择态',
    currentSessionId({ list: { getSnapshot: () => ({ byId: { a: { retainedBy: { mainView: 0 } } } }) } }) === null)
  check('currentSessionId：旧宿主（≤0.1.6）回退 list.current',
    currentSessionId({ list: { getSnapshot: () => ({ current: 'legacy-1' }) } }) === 'legacy-1')
  check('currentSessionId：无列表服务返回 null', currentSessionId(null) === null)

  // —— 输入壳解析（uiConversation.fillDraft 同口径）——
  const mkShell = () => ({ drafts: [], submitted: 0, setDraft(t) { this.drafts.push(t) }, submit() { this.submitted += 1 } })
  // 默认带 mainView 当前会话 s1（sendToChatV4 的落点前提）；显式传 list 可覆写（如无会话场景）
  const withList = (over) => Object.assign({
    list: { getSnapshot: () => ({ byId: { s1: { retainedBy: { mainView: 1 } } } }) },
  }, over)

  {
    const shell = mkShell()
    const ctx = { get: (name) => (name === 'conversation' ? { input: { for: (actx) => (actx && actx.tag === 'ok' ? shell : null) } } : undefined) }
    check('inputShellFor：scope(actx) → conversation.input.for(actx)（fillDraft 同口径）',
      inputShellFor(ctx, withList({ scope: () => ({ tag: 'ok' }) }), 's1') === shell)
  }
  {
    const shell = mkShell()
    const ctx = { get: (name) => (name === 'conversation' ? { input: { for: (actx) => (actx && actx.tag === 'bound' ? shell : null) } } : undefined) }
    check('inputShellFor：scope 未持有 → binding(id).ctx 兜底',
      inputShellFor(ctx, withList({ scope: () => undefined, binding: (id) => (id === 's1' ? { ctx: { tag: 'bound' } } : undefined) }), 's1') === shell)
  }
  {
    const ctx = { get: (name) => (name === 'conversation' ? { input: { for: () => ({ submit() {} }) } } : undefined) }
    check('inputShellFor：壳无 setDraft → null（不收残壳）',
      inputShellFor(ctx, withList({ scope: () => ({}) }), 's1') === null)
  }
  check('inputShellFor：未 retain 的 generation → null（0.1.7 scope/binding 收紧面）',
    inputShellFor({ get: () => undefined }, withList({ scope: () => undefined, binding: () => undefined }), 's1') === null)

  // —— v4 全链：setDraft → submit 闭环（using 持引用）——
  {
    const shell = mkShell()
    const usingCalls = []
    const sessions = withList({
      scope: () => ({ tag: 'ok' }),
      using: (target, options, op) => { usingCalls.push({ target, options }); return Promise.resolve(op({})) },
    })
    const ctx = {
      sessions,
      layout: { selectPanel() {} },
      get: (name) => (name === 'conversation' ? { input: { for: () => shell } } : undefined),
    }
    const result = await sendToChatV4(ctx, '用 flowchart 测', undefined)
    check('sendToChatV4：mainView 定位 → setDraft + submit → submitted', result === 'submitted' && shell.drafts[0] === '用 flowchart 测' && shell.submitted === 1)
    check('sendToChatV4：递送期 sessions.using 持引用（source=dsh-animations）',
      usingCalls.length === 1 && usingCalls[0].target === 's1' && usingCalls[0].options.source === 'dsh-animations')
  }

  // —— 无 submit 绝不报 submitted（降级剪贴板）——
  {
    const shell = { drafts: [], setDraft(t) { this.drafts.push(t) } } // 无 submit
    const sessions = withList({ scope: () => ({}) })
    const ctx = { sessions, layout: { selectPanel() {} }, get: (name) => (name === 'conversation' ? { input: { for: () => shell } } : undefined) }
    let navStubbed = false
    const navDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
    try {
      Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText: () => Promise.resolve() } }, configurable: true })
      navStubbed = true
    } catch (stubError) { /* Node 无 navigator：按 none 口径断言 */ }
    try {
      const result = await sendToChatV4(ctx, 'x', undefined)
      check('sendToChatV4：宿主无 submit → 绝不报 submitted（降级剪贴板）',
        result !== 'submitted' && result === (navStubbed ? 'copied' : 'none') && shell.drafts.length === 1)
    } finally {
      if (navStubbed) {
        if (navDescriptor) Object.defineProperty(globalThis, 'navigator', navDescriptor)
        else delete globalThis.navigator
      }
    }
  }

  // —— 挂载重试：openSession 后输入壳迟到位仍可送达 ——
  {
    const shell = mkShell()
    let probes = 0
    const sessions = withList({ scope: () => { probes += 1; return probes >= 3 ? {} : undefined } })
    const ctx = { sessions, layout: { selectPanel() {} }, get: (name) => (name === 'conversation' ? { input: { for: () => shell } } : undefined) }
    const result = await sendToChatV4(ctx, 'x', undefined)
    check('sendToChatV4：输入壳挂载迟到位 → 重试后仍 submitted（6×200ms 预算）',
      result === 'submitted' && probes >= 3 && shell.submitted === 1)
  }

  // —— create + openSession：无会话时新建并选中（0.1.7 openSession 面）——
  {
    const shell = mkShell()
    const opened = []
    const sessions = withList({
      list: { getSnapshot: () => ({}) }, // 无任何会话 → 走 create 分支
      scope: () => ({}),
      create: () => Promise.resolve('new-1'),
    })
    const ctx = {
      sessions,
      workspaces: { list: { getSnapshot: () => ({ items: [], phase: 'ready' }) } },
      uiWorkspace: { openSession: (id) => { opened.push(id) } },
      layout: { selectPanel() {} },
      get: (name) => (name === 'conversation' ? { input: { for: () => shell } } : undefined),
    }
    const result = await sendToChatV4(ctx, 'x', undefined)
    check('sendToChatV4：工作区列表空 → create + openSession 新会话后 submitted',
      result === 'submitted' && opened.length === 1 && opened[0] === 'new-1')
  }

  // —— openWorkspace(beforeOpen) 落点：跨工作区投递到落点会话 ——
  {
    const shell = mkShell()
    const openedWs = []
    const sessions = withList({
      list: { getSnapshot: () => ({}) }, // 无当前会话 → 走 openWorkspace 落点分支
      scope: (id) => (id === 'landed-1' ? {} : undefined),
    })
    const ctx = {
      sessions,
      workspaces: { list: { getSnapshot: () => ({ items: [{ workspaceId: 'w1', sessionIds: ['s-else'] }], phase: 'ready' }) } },
      uiWorkspace: {
        openWorkspace: (target, beforeOpen) => { openedWs.push(target); beforeOpen('landed-1'); return Promise.resolve() },
      },
      layout: { selectPanel() {} },
      get: (name) => (name === 'conversation' ? { input: { for: () => shell } } : undefined),
    }
    const result = await sendToChatV4(ctx, 'x', 'w1')
    check('sendToChatV4：openWorkspace(beforeOpen) 同步落点 id → 按落点递送 submitted',
      result === 'submitted' && openedWs.length === 1 && openedWs[0] === 'w1' && shell.submitted === 1)
  }

  // —— 旧宿主面（≤0.1.6）回归：list.current + scope 直借 + 无 using ——
  {
    const shell = mkShell()
    const sessions = {
      list: { getSnapshot: () => ({ current: 'legacy-9' }) }, // 旧面：无 byId/retainedBy
      scope: (id) => (id === 'legacy-9' ? { conversation: { input: { for: () => shell } } } : undefined), // actx.conversation 旧路径
    }
    const ctx = { sessions, layout: { selectPanel() {} }, get: () => undefined }
    const result = await sendToChatV4(ctx, 'x', undefined)
    check('sendToChatV4：旧宿主面（list.current + actx.conversation + 无 using）→ 仍 submitted',
      result === 'submitted' && shell.submitted === 1)
  }
}

/* ═══ 清理与结论 ═══ */

console.log('')
if (failures > 0) {
  console.log(`\x1b[31m冒烟失败：${failures} 项\x1b[0m`)
  process.exit(1)
}
console.log('\x1b[32m冒烟通过：清单 + host + 通告 + patch + client 全部检查项 ✓\x1b[0m')
