/**
 * DSH Web GUI Client Extension for dsh-animations。
 *
 * BUILD NOTE: 与 dsh-super-ppts / dsh-video-generator 同款 HAND-MAINTAINED
 * 形态：必须经 `window.__ModuleLoader__.load({ id, factory })` 自注册、经
 * `exports.apply` 暴露扩展并 `return module.exports`；裸 ESM `export` 不会
 * 注册，触发 "bundle .../client.js loaded without registering" 错误。
 *
 * 左侧栏「动效技能库」面板（dsh 0.1.5+ 原生 slot）：
 * - `sidebar.panellist`（list）：「新任务」与工作区列表之间的图标行，
 *   壳层拥有按钮/Tooltip/active 态，本插件只出图标字形（Lucide sparkles）；
 * - `main`（keyed，key=anim-panel）：点击图标切换的主面板，只读展示
 *   8 个动效技能（名称/说明/适用场景）+ 引导话术，数据内联自
 *   skills/manifest.json（client 侧无法读盘，发布时由脚本核对一致性，
 *   见 scripts/smoke-plugin.mjs）；
 * - 软探测：宿主 ≤0.1.4 无这些 slot 时静默跳过（console 诊断），
 *   聊天指令路由（systemPrompt 通告）不受影响。
 *
 * inject 声明（exports.inject）是 cordis 服务名；package.json →
 * dsh.client.inject 声明对应 runtime 包，两处缺一即抛
 * "cannot get property ... without inject"。
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
			intro: "8 个开箱即用的 HTML 动效技能。在对话里直接描述需求（或说「用 <技能名> 做…」），Agent 会自动选用对应技能生成单文件 HTML。",
			useHint: "对话示例：把这段传输层原理做成协议可视化动画",
			skillsTitle: "技能清单",
			scene: "适用",
			whenToUse: "何时自动选用",
		};
		var en = {
			nav: "Motion Skills",
			title: "Motion Skills",
			intro: "8 ready-to-use HTML motion skills. Describe your need in chat (or say \"use <skill> to…\") and the agent picks the right skill to produce a single-file HTML.",
			useHint: "Example: turn this TCP primer into a protocol visualization",
			skillsTitle: "Skill catalog",
			scene: "Scene",
			whenToUse: "Auto-selected when",
		};

		function fill(template, params) {
			return String(template).replace(/\{(\w+)\}/g, function (m, key) {
				return params && Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : m;
			});
		}

		/* ── 样式（一次性注入，anim- 前缀避免冲突；消费上游 dsw 变量，
		 *     fallback 保底，不硬编码会随上游漂移的哈希类名）── */

		var CSS = [
			".anim-root{display:flex;flex-direction:column;gap:16px;max-width:760px;color:inherit;font-size:var(--dsw-font-base-16-font-size,13px);line-height:1.5;}",
			".anim-title-row{display:flex;align-items:center;gap:10px;}",
			".anim-title-row h2{margin:0;font-size:16px;}",
			".anim-intro{opacity:.72;margin:0;}",
			".anim-hint{border:1px dashed var(--dsw-alias-border-l,var(--sl-color-neutral-400,#444));border-radius:8px;padding:8px 12px;font-size:12px;opacity:.85;}",
			".anim-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:10px;}",
			".anim-card{border:1px solid var(--dsw-alias-border-l,var(--sl-color-neutral-300,#333));border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;gap:6px;}",
			".anim-card h3{margin:0;font-size:13px;display:flex;align-items:center;gap:8px;}",
			".anim-card p{margin:0;opacity:.72;font-size:12px;}",
			".anim-chip{flex:none;background:var(--dsw-alias-interactive-bg-hover,var(--sl-color-primary-500,#4c6ef5));color:var(--dsw-alias-label-primary-inverted,#fff);border-radius:999px;padding:1px 8px;font-size:10px;font-weight:600;}",
			".anim-glyph{flex:none;width:14px;height:14px;background:currentColor;-webkit-mask:url(\"" + "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z'/%3E%3C/svg%3E" + "\") center / contain no-repeat;mask:url(\"" + "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z'/%3E%3C/svg%3E" + "\") center / contain no-repeat;}",
			"@media (max-width:640px){.anim-grid{grid-template-columns:1fr;}}",
		].join("\n");

		function ensureStyles() {
			if (typeof document === "undefined") return;
			if (document.getElementById("dsh-animations-styles")) return;
			var style = document.createElement("style");
			style.id = "dsh-animations-styles";
			style.textContent = CSS;
			document.head.appendChild(style);
		}

		/* ── 面板组件（只读技能目录，无数据请求）──────────────── */

		function makeAnimPanel(t) {
			return function AnimPanelView() {
			return React.createElement("div", { className: "anim-root" },
				React.createElement("div", { className: "anim-title-row" },
					React.createElement("span", { className: "anim-glyph", "aria-hidden": true }),
					React.createElement("h2", null, t("title")),
				),
				React.createElement("p", { className: "anim-intro" }, t("intro")),
				React.createElement("div", { className: "anim-hint" }, t("useHint")),
				React.createElement("div", { className: "anim-grid" },
					SKILLS.map(function (skill) {
						return React.createElement("div", { className: "anim-card", key: skill.name },
							React.createElement("h3", null,
								React.createElement("span", { className: "anim-chip" }, skill.name),
								skill.label,
							),
							React.createElement("p", null, skill.desc),
						);
					}),
				),
			);
			};
		}

		/* ── 入口：注册 locale 字典 + sidebar.panellist / main ── */

		var inject = ["slots", "locale"];

		function apply(ctx) {
			ensureStyles();
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
			// 面板为纯只读目录（无工具调用/无路由依赖）；两段注册同 id
			// 'anim-panel'。软探测：宿主 ≤0.1.4 无这些 slot 时静默跳过。
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
					}, makeAnimPanel(t));
					return function () { disposePanel(); disposeIcon(); };
				});
			} catch (error) {
				console.warn("[dsh-animations] 宿主无左侧栏 slot（≤0.1.4?），跳过 panellist 接入，聊天指令路由不受影响:", error && error.message);
			}
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
