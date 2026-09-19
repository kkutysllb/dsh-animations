/**
 * DSH Web GUI Client Extension for dsh-animations。
 *
 * BUILD NOTE: 与 dsh-super-ppts / dsh-video-generator 同款 HAND-MAINTAINED
 * 形态：必须经 `window.__ModuleLoader__.load({ id, factory })` 自注册、经
 * `exports.apply` 暴露扩展并 `return module.exports`；裸 ESM `export` 不会
 * 注册，触发 "bundle .../client.js loaded without registering" 错误。
 *
 * 左侧栏「动效技能库」工作台（dsh 0.1.5+ 原生 slot，交互形态对齐
 * dsh-super-ppts 工作台）：
 * - `sidebar.panellist`（list）：「新任务」与工作区列表之间的图标行，
 *   壳层拥有按钮/Tooltip/active 态，本插件只出图标字形（Lucide sparkles）；
 * - `main`（keyed，key=anim-panel）：点击图标切换的主面板 = 交互式工作台：
 *   **工作区菜单项**（宿主 standard props `useWorkspaces` 驱动的下拉菜单，
 *   宿主未注入时整块软探测隐藏）+ 技能卡片单选 + 需求描述 + 一键「发送到
 *   对话」（会话桥：定位会话 → setDraft → submit，失败降级剪贴板）。
 *   技能目录数据内联自 skills/manifest.json（client 侧无法读盘，发布时由
 *   scripts/smoke-plugin.mjs 对账一致性）；
 * - 软探测：宿主 ≤0.1.4 无这些 slot 时静默跳过（console 诊断），
 *   聊天指令路由（systemPrompt 通告）不受影响。
 *
 * inject 声明（exports.inject）是 cordis 服务名；package.json →
 * dsh.client.inject 声明对应 runtime 包（信息性装载边），两处缺一即抛
 * "cannot get property ... without inject"。会话桥另依赖根 ctx 的
 * `conversation` 服务（@deepseek-ai/dsh-client-ui-conversation 提供），
 * 这是 0.1.6 宿主上 scope(id).conversation 旧路径失效后的正确取面。
 */
window.__ModuleLoader__.load({
	id: "dsh-animations",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		const React = require("react");

		var NS = "dshAnimations";

		/* ── 技能目录（与 skills/manifest.json 同源内联；smoke 对账）── */

		var SKILLS = [
			{ name: "ppt-animation", label: "PPT 翻页演示", desc: "16:9 单文件翻页演示动画，页面元素依次缓入，内置五套主题，适合视频科普与录屏课件。" },
			{ name: "flowchart", label: "流程图 / 概念图", desc: "教育类流程图与原理演示动画：流动箭头、逐步出现、hover 高亮，内置 RNN/LSTM/GRU/MLP 等模型模板。" },
			{ name: "network-protocol-viz", label: "网络协议可视化", desc: "TCP/IP、以太网帧等协议工作原理的动态可视化动画页面。" },
			{ name: "dynamic-archify", label: "动态架构图", desc: "专业的架构图 / 工作流动画，节点连线分步入场。" },
			{ name: "scholar-notes", label: "学霸笔记", desc: "手写笔记本风格的单文件 HTML 学习笔记，经典手账与简报两种模板。" },
			{ name: "card-theater", label: "卡片剧场", desc: "侧边栏叙事 + 3D 卡片轮播的演示动画，支持滚动翻页。" },
			{ name: "video-shot-demos", label: "视频分镜演示", desc: "每镜头一个 HTML 的高完成度网页演示动画，统一视觉语言。" },
			{ name: "phone-ui-demos", label: "手机 UI 演示", desc: "手机系统 UI 风格的电影化网页演示动画——像在看真机操作。" },
		];

		/* ── 双语文案（zh / en）──────────────────────────────── */

		var zh = {
			nav: "动效技能库",
			title: "动效技能库",
			intro: "8 个开箱即用的 HTML 动效技能。选一个技能、写一句话需求、挑好工作区，一键把指令投递到会话——Agent 会读对应 SKILL.md 生成单文件 HTML。",
			wsLabel: "工作区",
			wsFollow: "跟随当前工作区",
			wsLoading: "工作区加载中…",
			wsEmpty: "尚无工作区——发送后会自动建立会话",
			skillsTitle: "技能清单",
			skillOptional: "点卡片选用（可不选，直接描述需求）",
			needLabel: "需求描述",
			needPlaceholder: "例：把这段 TCP 三次握手的讲义做成协议可视化动画，暗色主题",
			needRequired: "请先填写需求描述",
			send: "发送到对话",
			sending: "发送中…",
			sent: "已提交到会话并自动发送，切回对话即可查看",
			copied: "已复制到剪贴板：回到对话粘贴后回车发送",
			failed: "发送失败：请在对话里直接描述需求",
			useHint: "对话示例：把这段传输层原理做成协议可视化动画",
		};
		var en = {
			nav: "Motion Skills",
			title: "Motion Skills",
			intro: "8 ready-to-use HTML motion skills. Pick a skill, describe your need in one line, choose a workspace, and send it straight into the chat — the agent reads the matching SKILL.md and produces a single-file HTML.",
			wsLabel: "Workspace",
			wsFollow: "Follow current workspace",
			wsLoading: "Loading workspaces…",
			wsEmpty: "No workspaces yet — a session will be created on send",
			skillsTitle: "Skill catalog",
			skillOptional: "Click a card to pick one (optional — a plain need works too)",
			needLabel: "Your request",
			needPlaceholder: "e.g. turn this TCP three-way handshake primer into a protocol visualization, dark theme",
			needRequired: "Describe your need first",
			send: "Send to chat",
			sending: "Sending…",
			sent: "Delivered to the session and auto-submitted — switch back to the chat to watch it run",
			copied: "Copied to clipboard: paste it in the chat and press Enter",
			failed: "Send failed: please describe your need in the chat directly",
			useHint: "Example: turn this TCP primer into a protocol visualization",
		};

		function fill(template, params) {
			return String(template).replace(/\{(\w+)\}/g, function (m, key) {
				return params && Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : m;
			});
		}

		/* ── 会话桥（dsh-super-ppts sendToChatV3 的 0.1.6 修正版）────────
		 * 定位会话 → 写草稿 → 自动提交；任一步不可达绝不假装成功：
		 * 返回 'submitted'（已提交）/ 'copied'（降级剪贴板）/ 'none'（全失败）。
		 * 1) 会话落点：同工作区 → 当前会话；跨工作区/无会话 →
		 *    uiWorkspace.openWorkspace(ws) 后取当前会话；工作区列表空 →
		 *    sessions.create() + open；定位失败 → 降级。
		 * 2) 输入面：宿主 ≥0.1.6 的正确路径是根 ctx 服务
		 *    get('conversation').input → shell（会话作用域 actx 或按 id）；
		 *    旧路径 scope(id).conversation.input.for(actx) 仅作兼容回退。
		 * 3) shell.setDraft(text) + shell.submit()（'queue' 模式），同一
		 *    shell 先写后提；全程不可达 → 降级剪贴板。
		 */
		function backToChat(ctx) {
			try {
				if (ctx && ctx.layout && typeof ctx.layout.selectPanel === "function") ctx.layout.selectPanel(null);
			} catch (layoutError) { /* 服务不可达：留在当前面板 */ }
		}

		/** 解析会话的输入 shell：根 conversation 服务优先，旧作用域路径兜底。 */
		function resolveInputShell(ctx, sessions, sessionId) {
			// ① 根 ctx 的 conversation 服务（0.1.6+ 公开面：input registry）
			try {
				var conversation = ctx && typeof ctx.get === "function" ? ctx.get("conversation") : null;
				var input = conversation && conversation.input;
				if (input && typeof input.shell === "function") {
					// 按 id 直取（InputHub.shell 内部自解析 binding）
					return input.shell(sessionId);
				}
				if (input && typeof input.for === "function") {
					var actx = sessions.scope(sessionId);
					if (actx) return input.for(actx);
				}
			} catch (rootError) { /* 根服务不可达：试旧路径 */ }
			// ② 旧路径（super-ppts 1.4.0 同款）：会话作用域上的 conversation
			try {
				var scoped = sessions.scope(sessionId);
				var legacyInput = scoped && scoped.conversation && scoped.conversation.input;
				if (legacyInput && typeof legacyInput.for === "function") return legacyInput.for(scoped);
			} catch (legacyError) { /* 作用域路径不可达 */ }
			return null;
		}

		function clipboardFallback(ctx, text) {
			var write = Promise.resolve("none");
			try {
				if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
					write = navigator.clipboard.writeText(text)
						.then(function () { return "copied"; })
						.catch(function () { return "none"; });
				}
			} catch (error) { /* 剪贴板不可用 */ }
			return Promise.resolve(write).then(function (result) {
				if (result !== "copied") return "none";
				try {
					var sessions = ctx && ctx.sessions;
					var current = sessions && sessions.list && typeof sessions.list.getSnapshot === "function"
						? sessions.list.getSnapshot().current : undefined;
					if (!current && sessions && typeof sessions.create === "function") {
						sessions.create().then(function (id) {
							try { if (typeof sessions.open === "function") sessions.open(id); } catch (openError) { /* 已选中 */ }
						}).catch(function () { /* 无落点：用户手动粘贴 */ });
					}
					backToChat(ctx);
				} catch (bridgeError) {
					console.warn("dsh-animations clipboardFallback 会话桥异常:", bridgeError && bridgeError.message);
				}
				return "copied";
			});
		}

		function sendToChat(ctx, text, workspaceId) {
			var fallback = function () { return clipboardFallback(ctx, text); };
			var sessions = ctx && ctx.sessions;
			var plan;
			try {
				if (!sessions || !sessions.list || typeof sessions.list.getSnapshot !== "function") {
					return Promise.resolve(fallback());
				}
				var current = sessions.list.getSnapshot().current;
				var wsList = (ctx.workspaces && ctx.workspaces.list && typeof ctx.workspaces.list.getSnapshot === "function")
					? ctx.workspaces.list.getSnapshot() : null;
				var wsOfCurrent = null;
				if (current && wsList && wsList.items) {
					for (var i = 0; i < wsList.items.length; i += 1) {
						var ids = wsList.items[i].sessionIds || [];
						if (ids.indexOf(current) !== -1) { wsOfCurrent = wsList.items[i].workspaceId; break; }
					}
				}
				var wantsSwitch = workspaceId && wsOfCurrent !== workspaceId;
				if (current && !wantsSwitch) plan = Promise.resolve(current);
				else if (ctx.uiWorkspace && typeof ctx.uiWorkspace.openWorkspace === "function"
					&& wsList && wsList.items && wsList.items.length > 0) {
					var target = workspaceId || wsOfCurrent || wsList.items[0].workspaceId;
					plan = Promise.resolve(ctx.uiWorkspace.openWorkspace(target)).then(function () {
						return sessions.list.getSnapshot().current || null;
					});
				} else if (typeof sessions.create === "function") {
					plan = sessions.create().then(function (id) {
						try { if (typeof sessions.open === "function") sessions.open(id); } catch (openError) { /* 已选中 */ }
						backToChat(ctx);
						return id;
					});
				} else plan = Promise.resolve(null);
			} catch (bridgeError) {
				console.warn("dsh-animations sendToChat 定位会话异常:", bridgeError && bridgeError.message);
				return Promise.resolve(fallback());
			}
			return Promise.resolve(plan).then(function (sessionId) {
				if (sessionId === null || sessionId === undefined) return fallback();
				try {
					backToChat(ctx);
					var shell = resolveInputShell(ctx, sessions, sessionId);
					// 顺序不可颠倒：先写草稿，再提交同一 shell（submit 缺省 'queue'）。
					if (shell && typeof shell.setDraft === "function") {
						shell.setDraft(text);
						if (typeof shell.submit === "function") {
							shell.submit();
							return "submitted";
						}
						console.warn("dsh-animations sendToChat：宿主输入面无 submit，降级剪贴板");
					} else {
						console.warn("dsh-animations sendToChat：会话输入 shell 不可达，降级剪贴板");
					}
				} catch (fillError) {
					console.warn("dsh-animations sendToChat：写入会话异常，降级剪贴板:", fillError && fillError.message);
				}
				return fallback();
			}, function () { return fallback(); });
		}

		/** 组装投递话术：选中技能 → 「用 <skill> <需求>」；未选 → 需求原文。 */
		function buildPrompt(skill, need) {
			var text = String(need || "").trim();
			if (!skill || !skill.name) return text;
			return "用 " + skill.name + " " + text;
		}

		/* ── 样式（一次性注入，anim- 前缀避免冲突）──
		 * 只消费宿主真实存在的 dsw alias token（bg-base/layer-1/2、border-l1/l2、
		 * label-primary/secondary、brand-primary、state-*），fallback 用 --sl
		 * 语义色保底；accent 半透明底用 rgba 兜底 + color-mix 增强。
		 */

		var ACCENT = "var(--dsw-alias-brand-primary, var(--sl-color-primary-500, #4c6ef5))";

		var CSS = [
			".anim-root{display:flex;flex-direction:column;gap:22px;max-width:880px;margin:0 auto;padding:28px 32px 48px;color:var(--dsw-alias-label-primary,var(--sl-color-neutral-900,#ececf1));font-size:var(--dsw-font-base-16-font-size,13px);line-height:1.55;}",
			".anim-hero{display:flex;align-items:flex-start;gap:14px;}",
			".anim-hero-badge{flex:none;width:40px;height:40px;border-radius:11px;display:flex;align-items:center;justify-content:center;background:rgba(99,102,241,.14);background:color-mix(in srgb," + ACCENT + " 14%,transparent);}",
			".anim-hero-badge .anim-glyph{width:20px;height:20px;color:" + ACCENT + ";}",
			".anim-hero h2{margin:0;font-size:17px;font-weight:600;letter-spacing:.2px;}",
			".anim-hero-sub{margin:3px 0 0;max-width:640px;color:var(--dsw-alias-label-secondary,var(--sl-color-neutral-600,#9aa0aa));font-size:12.5px;}",
			/* ── 投递卡（工作区 + 需求 + 发送）── */
			".anim-composer{display:flex;flex-direction:column;gap:14px;border:1px solid var(--dsw-alias-border-l1,var(--sl-color-neutral-700,#2c2f36));background:var(--dsw-alias-bg-layer-1,rgba(255,255,255,.02));border-radius:14px;padding:16px 18px 18px;}",
			".anim-field{display:flex;flex-direction:column;gap:6px;}",
			".anim-field>label,.anim-section-label{font-size:11.5px;font-weight:600;letter-spacing:.4px;color:var(--dsw-alias-label-secondary,var(--sl-color-neutral-600,#9aa0aa));}",
			".anim-select{appearance:none;-webkit-appearance:none;max-width:420px;border:1px solid var(--dsw-alias-border-l1,var(--sl-color-neutral-700,#2c2f36));background:transparent url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238a8f98' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\") right 10px center/12px no-repeat;border-radius:8px;color:inherit;padding:7px 32px 7px 11px;font-size:12.5px;font-family:inherit;cursor:pointer;transition:border-color .15s;}",
			".anim-select:hover{border-color:var(--dsw-alias-border-l2,var(--sl-color-neutral-500,#555))}",
			".anim-select:focus{outline:none;border-color:" + ACCENT + ";box-shadow:0 0 0 3px rgba(99,102,241,.18);box-shadow:0 0 0 3px color-mix(in srgb," + ACCENT + " 22%,transparent);}",
			".anim-textarea{appearance:none;-webkit-appearance:none;border:1px solid var(--dsw-alias-border-l1,var(--sl-color-neutral-700,#2c2f36));background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.08));color:inherit;border-radius:10px;padding:10px 12px;font-size:12.5px;font-family:inherit;line-height:1.6;resize:vertical;min-height:84px;transition:border-color .15s,box-shadow .15s;width:100%;box-sizing:border-box;}",
			".anim-textarea::placeholder{color:var(--dsw-alias-label-secondary,var(--sl-color-neutral-600,#9aa0aa));opacity:.75;}",
			".anim-textarea:focus{outline:none;border-color:" + ACCENT + ";box-shadow:0 0 0 3px rgba(99,102,241,.18);box-shadow:0 0 0 3px color-mix(in srgb," + ACCENT + " 22%,transparent);}",
			".anim-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap;}",
			".anim-btn{border:none;border-radius:9px;padding:8px 22px;font-size:12.5px;font-weight:600;font-family:inherit;cursor:pointer;color:var(--dsw-alias-bg-base,#ffffff);background:" + ACCENT + ";box-shadow:0 1px 10px rgba(0,0,0,.22);transition:filter .15s,transform .15s;}",
			".anim-btn:hover{filter:brightness(1.12);}",
			".anim-btn:active{transform:translateY(1px);}",
			".anim-btn[disabled]{opacity:.45;cursor:not-allowed;filter:none;transform:none;}",
			".anim-state{font-size:12px;color:var(--dsw-alias-label-secondary,var(--sl-color-neutral-600,#9aa0aa));}",
			".anim-state-success{color:var(--dsw-alias-state-success-primary,var(--sl-color-success-500,#2f9e6e));}",
			".anim-state-warn{color:var(--dsw-alias-state-warn-primary,var(--sl-color-warning-500,#d9a514));}",
			".anim-state-error{color:var(--dsw-alias-state-error-primary,var(--sl-color-danger-500,#d64545));}",
			".anim-example{font-size:12px;color:var(--dsw-alias-label-secondary,var(--sl-color-neutral-600,#9aa0aa));}",
			".anim-example b{font-weight:600;color:inherit;opacity:.9;}",
			/* ── 技能卡片 ── */
			".anim-section-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap;}",
			".anim-section-tip{font-size:11.5px;color:var(--dsw-alias-label-secondary,var(--sl-color-neutral-600,#9aa0aa));}",
			".anim-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;}",
			".anim-card{position:relative;border:1px solid var(--dsw-alias-border-l1,var(--sl-color-neutral-700,#2c2f36));background:var(--dsw-alias-bg-layer-1,rgba(255,255,255,.02));border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:7px;cursor:pointer;user-select:none;text-align:left;transition:border-color .15s,transform .15s,box-shadow .15s;}",
			".anim-card:hover{border-color:var(--dsw-alias-border-l2,var(--sl-color-neutral-500,#555));transform:translateY(-1px);box-shadow:0 4px 14px rgba(0,0,0,.18);}",
			".anim-card-on{border-color:" + ACCENT + ";box-shadow:inset 0 0 0 1px " + ACCENT + ";}",
			".anim-card-on::after{content:\"✓\";position:absolute;top:10px;right:10px;width:18px;height:18px;border-radius:50%;background:" + ACCENT + ";color:var(--dsw-alias-bg-base,#ffffff);font-size:11px;line-height:18px;text-align:center;font-weight:700;}",
			".anim-card h3{margin:0;padding-right:22px;font-size:13px;font-weight:600;display:flex;align-items:center;gap:8px;}",
			".anim-card p{margin:0;color:var(--dsw-alias-label-secondary,var(--sl-color-neutral-600,#9aa0aa));font-size:12px;line-height:1.6;}",
			".anim-chip{flex:none;border-radius:6px;padding:2px 7px;font-size:10px;font-weight:600;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.2px;color:" + ACCENT + ";background:rgba(99,102,241,.13);background:color-mix(in srgb," + ACCENT + " 13%,transparent);}",
			".anim-glyph{display:block;background:currentColor;-webkit-mask:url(\"" + "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z'/%3E%3C/svg%3E" + "\") center / contain no-repeat;mask:url(\"" + "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z'/%3E%3C/svg%3E" + "\") center / contain no-repeat;}",
			"@media (max-width:640px){.anim-root{padding:20px 16px 36px;}.anim-grid{grid-template-columns:1fr;}}",
		].join("\n");

		function ensureStyles() {
			if (typeof document === "undefined") return null;
			if (document.getElementById("dsh-animations-styles")) return null;
			var style = document.createElement("style");
			style.id = "dsh-animations-styles";
			style.textContent = CSS;
			document.head.appendChild(style);
			/* 返回移除函数：卸载收口用（既存标签返回 null，不动别人的） */
			return function () {
				var el = document.getElementById("dsh-animations-styles");
				if (el !== null) el.remove();
			};
		}

		/* ── 工作台面板（工作区菜单 + 技能卡片单选 + 需求投递）────────
		 * 工作区下拉由宿主注入的 standard props `useWorkspaces`（main keyed
		 * 槽位的框架 seat，SnapshotSelectorHook<WorkspaceSnapshot>）驱动；
		 * 宿主未注入（过旧/非 web 宿主）时整块不渲染（软探测，参考
		 * dsh-super-ppts 工作区字段的防御形态）。
		 */

		function makeAnimPanel(t, opts) {
			return function AnimPanelView(props) {
				var useWorkspaces = props && props.useWorkspaces;
				var wsItems = typeof useWorkspaces === "function"
					? useWorkspaces(function (s) { return s.items; }) : null;
				var wsPhase = typeof useWorkspaces === "function"
					? useWorkspaces(function (s) { return s.phase; }) : null;

				var pickedState = React.useState("");
				var picked = pickedState[0], setPicked = pickedState[1];
				var needState = React.useState("");
				var need = needState[0], setNeed = needState[1];
				var wsState = React.useState("");
				var ws = wsState[0], setWs = wsState[1];
				var busyState = React.useState(false);
				var busy = busyState[0], setBusy = busyState[1];
				// 反馈消息带色调：success / warn / error / info（缺省次要色）
				var msgState = React.useState(null);
				var msg = msgState[0], setMsg = msgState[1];

				var onSend = function () {
					var text = String(need || "").trim();
					if (text === "") { setMsg({ key: "needRequired", tone: "warn" }); return; }
					var deliver = opts && typeof opts.sendToSession === "function" ? opts.sendToSession : null;
					if (deliver === null) { setMsg({ key: "failed", tone: "error" }); return; }
					var skill = null;
					for (var i = 0; i < SKILLS.length; i += 1) {
						if (SKILLS[i].name === picked) { skill = SKILLS[i]; break; }
					}
					setBusy(true); setMsg(null);
					Promise.resolve(deliver(buildPrompt(skill, text), ws))
						.then(function (result) {
							if (result === "submitted") setMsg({ key: "sent", tone: "success" });
							else if (result === "copied") setMsg({ key: "copied", tone: "info" });
							else setMsg({ key: "failed", tone: "error" });
						})
						.catch(function () { setMsg({ key: "failed", tone: "error" }); })
						.then(function () { setBusy(false); });
				};

				// 工作区菜单项（软探测：宿主未注入 useWorkspaces 时整块不渲染）
				var wsField = null;
				if (wsItems !== null) {
					wsField = React.createElement("div", { className: "anim-field" },
						React.createElement("label", null, t("wsLabel")),
						wsPhase !== "ready"
							? React.createElement("span", { className: "anim-state" }, t("wsLoading"))
							: (wsItems.length === 0
								? React.createElement("span", { className: "anim-state" }, t("wsEmpty"))
								: React.createElement("select", {
									className: "anim-select", value: ws,
									onChange: function (event) { setWs(event.target.value); },
								},
									React.createElement("option", { value: "" }, t("wsFollow")),
									wsItems.map(function (item) {
										return React.createElement("option", {
											key: item.workspaceId, value: item.workspaceId,
										}, (item.title || item.workspaceId) + " — " + (item.path || ""));
									}))),
					);
				}

				var cards = SKILLS.map(function (skill) {
					var active = picked === skill.name;
					return React.createElement("div", {
						className: "anim-card" + (active ? " anim-card-on" : ""),
						key: skill.name,
						role: "button",
						"aria-pressed": active,
						title: skill.name,
						onClick: function () { setPicked(active ? "" : skill.name); },
					},
						React.createElement("h3", null,
							React.createElement("span", { className: "anim-chip" }, skill.name),
							skill.label,
						),
						React.createElement("p", null, skill.desc),
					);
				});

				return React.createElement("div", { className: "anim-root" },
					// ── hero：accent 徽标 + 标题 + 副标题 ──
					React.createElement("div", { className: "anim-hero" },
						React.createElement("span", { className: "anim-hero-badge", "aria-hidden": true },
							React.createElement("span", { className: "anim-glyph" }),
						),
						React.createElement("div", null,
							React.createElement("h2", null, t("title")),
							React.createElement("p", { className: "anim-hero-sub" }, t("intro")),
						),
					),
					// ── 投递卡：工作区菜单 + 需求 + 发送 ──
					React.createElement("div", { className: "anim-composer" },
						wsField,
						React.createElement("div", { className: "anim-field" },
							React.createElement("label", null, t("needLabel")),
							React.createElement("textarea", {
								className: "anim-textarea", rows: 3, value: need,
								placeholder: t("needPlaceholder"),
								onChange: function (event) { setNeed(event.target.value); },
							}),
						),
						React.createElement("div", { className: "anim-actions" },
							React.createElement("button", {
								type: "button", className: "anim-btn",
								disabled: busy, onClick: onSend,
							}, busy ? t("sending") : t("send")),
							msg ? React.createElement("span", {
								className: "anim-state" + (msg.tone === "success" ? " anim-state-success"
									: msg.tone === "warn" ? " anim-state-warn"
									: msg.tone === "error" ? " anim-state-error" : ""),
							}, t(msg.key)) : null,
						),
						React.createElement("p", { className: "anim-example" }, t("useHint")),
					),
					// ── 技能清单 ──
					React.createElement("div", { className: "anim-section-head" },
						React.createElement("span", { className: "anim-section-label" }, t("skillsTitle")),
						React.createElement("span", { className: "anim-section-tip" }, t("skillOptional")),
					),
					React.createElement("div", { className: "anim-grid" }, cards),
				);
			};
		}

		/* ── 入口：注册 locale 字典 + sidebar.panellist / main ── */

		var inject = ["slots", "locale", "sessions", "uiWorkspace", "workspaces", "layout", "conversation"];

		function apply(ctx) {
			var removeStyles = ensureStyles();
			if (removeStyles !== null && typeof ctx.effect === "function") {
				// 样式标签随插件 fiber 卸载移除（重复挂载返回 null，不动既存标签）
				ctx.effect(function () { return removeStyles; }, "dsh-animations: panel styles");
			}
			if (ctx.locale && typeof ctx.locale.register === "function") {
				ctx.effect(function () {
					return ctx.locale.register(NS, { zh: zh, en: en });
				}, "dsh-animations: panel dictionaries");
			}

			var t = ctx.locale && typeof ctx.locale.bind === "function"
				? ctx.locale.bind(NS)
				: function (key, params) { return fill(zh[key] || en[key] || key, params); };

			if (!ctx.slots || typeof ctx.slots.inject !== "function") return;

			// ── 0.1.5 左侧栏原生接入（sidebar.panellist + main keyed）──
			// 面板是交互式工作台：投递经会话桥 sendToChat(ctx, …)；两段注册
			// 同 id 'anim-panel'。软探测：宿主 ≤0.1.4 无这些 slot 时静默跳过。
			try {
				var PANEL_ID = "anim-panel";
				var PanelIcon = function (props) {
					return React.createElement("svg", {
						width: (props && props.size) || 18,
						height: (props && props.size) || 18,
						viewBox: "0 0 24 24", fill: "none",
						stroke: "currentColor", strokeWidth: 2,
						strokeLinecap: "round", strokeLinejoin: "round",
						"aria-hidden": true,
					},
						React.createElement("path", { d: "m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" }),
					);
				};
				ctx.slots.inject("sidebar.panellist", function () {
					var disposeIcon = ctx.slots.register({
						name: "sidebar.panellist",
						id: PANEL_ID,
						order: 120,
						label: function () { return t("nav"); },
						locale: NS,
					}, PanelIcon);
					var disposePanel = ctx.slots.register({
						name: "main",
						key: PANEL_ID,
					}, makeAnimPanel(t, {
						// 工作台「发送到对话」→ 会话桥（跨工作区先 openWorkspace 再落会话）
						sendToSession: function (text, workspaceId) { return sendToChat(ctx, text, workspaceId); },
					}));
					return function () { disposePanel(); disposeIcon(); };
				});
			} catch (error) {
				console.warn("[dsh-animations] 宿主无左侧栏 slot（≤0.1.4?），跳过 panellist 接入，聊天指令路由不受影响:", error && error.message);
			}
		}

		exports.apply = apply;
		exports.inject = inject;
		// 测试钩子：冒烟脚本无 DOM，经 ModuleLoader stub 加载后直接断言纯函数（仅测试使用）
		exports.__testHooks = { buildPrompt: buildPrompt, sendToChat: sendToChat, SKILLS: SKILLS };
		return module.exports;
	}
});
