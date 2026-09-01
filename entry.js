// dsh-animations 胶水插件（零依赖纯 ESM，对齐 dsh-skills-bundle 的
// out-of-tree bundle 形态：可被 profile node_modules 直接 resolve，
// 无构建步骤）。
//
// 职责（刻意保持最小面）：
// 1. 技能注册：激活时读取包内 skills/manifest.json，逐个读取 SKILL.md
//    剥离 frontmatter 后经 ctx.skills.register() 注册为 runtime skill；
//    注册落在调用上下文的全局层，对 profile 下所有 agent 会话可见。
//    skill 元数据单一事实源是 manifest.json（与 SKILL.md frontmatter
//    由 smoke 脚本对账），插件端不需要 YAML 解析器。
// 2. 能力通告：向 systemPrompt 注册一段能力说明 section（可经
//    config.announceToAgent 关闭）。具体生成工作流由各技能的 SKILL.md
//    承载，通告里不复制技能正文，避免上下文膨胀。
// 3. 预设安装：把 presets/ 下的「动画演示专家」Agent 预设拷贝到
//    ~/.dsh/.agent-presets/dsh-animations/，供 Web GUI 直接切换。
//
// Cordis 契约（同 dsh-super-ppts 实装结论）：
// - host 侧访问的每个 ctx 服务必须经命名导出 inject 声明——
//   `cannot get property "skills" without inject` 即漏声明症状；
// - apply 返回 disposer（cordis fiber 释放时自动回收注册项）。

import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Stable Cordis plugin name. */
export const name = 'dsh-animations'

/** apply 内访问的 ctx 服务（漏声明即抛 without inject）。 */
export const inject = ['skills', 'systemPrompt']

/** 包根（entry.js 所在目录）。 */
const ROOT = fileURLToPath(new URL('.', import.meta.url))

/** 技能内容目录。 */
const SKILLS_DIR = join(ROOT, 'skills')

/** systemPrompt 通告排序（super-ppts 占 206，本插件顺延）。 */
const SECTION_ORDER = 207

/** 能力通告文本：只做路由与环境约定，不复制技能正文。 */
export const ANIMATIONS_GUIDANCE = `本机已安装 dsh-animations 插件（动效技能包，8 个 HTML 动画技能，已注册为 runtime skill）。能力矩阵与适用路由：1) ppt-animation——PPT 风格翻页演示（暗色科技/暖色报纸/简约白/赛博红橙/渐变暗色五主题，翻页后元素依次缓入）；2) flowchart——教育科普流程图/概念图/AI 模型可视化（暗色科技风、流动箭头、逐步出现）；3) network-protocol-viz——网络协议动态演示（TCP 握手、以太帧、IPv4、路由表、DHCP、HTTPS）；4) dynamic-archify——工程级架构图/时序图/数据流图/状态机（SVG + 流动动画，支持 Mermaid 输入与 PNG/JPEG/WebP/SVG/GIF/WebM 导出）；5) scholar-notes（学霸笔记）——手写笔记本风格单文件 HTML 学习笔记；6) card-theater——侧边栏叙事 + 3D 卡片轮播（Coverflow/Focus/滚动倾斜）；7) video-shot-demos——电影级视频分镜演示（一个镜头一个 HTML，29 种风格轮换 + WebAudio 音效）；8) phone-ui-demos——手机系统 UI 电影化编排录屏（锁屏通知/聊天/设置页逐镜头，HyperOS 级动效）。用户提到「做演示动画 / 翻页 HTML / 流程图动画 / 协议可视化 / 架构图 / 学霸笔记 / 卡片剧场 / 视频分镜 / 手机 UI 演示」时：按需求形态选用上述技能，读其 SKILL.md 后按工作流生成单文件 HTML（可直接浏览器打开、可全屏录屏成片）；模板资产在插件包根 skills/<skill>/assets/（包根见本通告所属插件的安装位置，不要猜测路径），支持「以 assets/xxx.html 为模板」重构。生成物默认落在当前工作目录，文件名用英文短横线。`

/** 剥离 SKILL.md 开头的 YAML frontmatter 块（--- 限界），返回正文。 */
function stripFrontmatter(raw) {
  if (!raw.startsWith('---\n')) return raw
  const end = raw.indexOf('\n---\n', 4)
  if (end === -1) return raw
  return raw.slice(end + 5).replace(/^\n+/, '')
}

/** 把 presets/ 下的预设文件拷贝到用户目录（幂等，缺失静默跳过）。 */
function ensurePresetInstalled() {
  try {
    const userPresetDir = resolve(homedir(), '.dsh', '.agent-presets', 'dsh-animations')
    if (!existsSync(userPresetDir)) mkdirSync(userPresetDir, { recursive: true })
    const pluginPresets = resolve(ROOT, 'presets')
    for (const presetName of ['preset.yml', 'agent.cordis.yml']) {
      const source = join(pluginPresets, presetName)
      if (existsSync(source)) copyFileSync(source, join(userPresetDir, presetName))
    }
  } catch {
    // 预设拷贝失败不阻断插件加载（用户可手动从 presets/ 取用）
  }
}

/**
 * 注册清单内全部技能 + 能力通告；返回组合 disposer。
 * config: { enabled?: boolean, announceToAgent?: boolean }
 */
export function apply(ctx, config = {}) {
  if (config.enabled === false) return () => {}

  ensurePresetInstalled()

  const disposers = []
  const manifest = JSON.parse(readFileSync(join(SKILLS_DIR, 'manifest.json'), 'utf8'))
  for (const item of manifest.skills) {
    const dir = join(SKILLS_DIR, item.dir)
    const content = stripFrontmatter(readFileSync(join(dir, 'SKILL.md'), 'utf8'))
    disposers.push(ctx.skills.register({
      name: item.name,
      description: item.description,
      ...item.whenToUse === undefined ? {} : { whenToUse: item.whenToUse },
      source: 'runtime',
      content,
      // 正文引用的相对资源（assets/、references/、examples/）按此基目录解析
      resourceBase: { kind: 'directory', path: dir },
    }))
  }
  if (config.announceToAgent !== false) {
    disposers.push(
      ctx.systemPrompt.section({
        name: 'plugin:dsh-animations',
        order: SECTION_ORDER,
        text: ANIMATIONS_GUIDANCE,
      }),
    )
  }
  // 激活诊断直走 stdout（与就绪行同通道）
  console.log(`dsh-animations: ${disposers.length - (config.announceToAgent !== false ? 1 : 0)} runtime skills registered (${manifest.skills.map((s) => s.name).join(', ')})`)
  return () => {
    for (const dispose of disposers) {
      try {
        dispose()
      } catch {
        // 回收失败不阻断卸载
      }
    }
  }
}
