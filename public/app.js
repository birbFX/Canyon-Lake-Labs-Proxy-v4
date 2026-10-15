/* Canyon Lake Lab's Proxy — public demo app
   Feature set is chosen by window.CLL_VER (2, 3 or 4). */
(function () {
	"use strict";

	var V = window.CLL_VER || 4;
	var FEATURES = {
		start: [2, 3, 4],
		settings: [2, 3, 4],
		network: [3, 4],
		console: [3, 4],
		playground: [4],
	};
	function has(f) {
		return (FEATURES[f] || []).indexOf(V) !== -1;
	}

	/* ------------------------------------------------------------------ store */
	var store = {
		homeUrl: localStorage.getItem("cll-home") || "https://google.com",
		wispUrl: localStorage.getItem("cll-wisp") || "",
		maxRequests: parseInt(localStorage.getItem("cll-maxreq") || "200", 10),
	};

	/* ------------------------------------------------------------------ state */
	var controller = null;
	var browserFrame = null;
	var initialized = false;
	var tabs = [];
	var active = null;
	var requests = [];
	var reqSeq = 0;
	var reqMap = new WeakMap();

	/* -------------------------------------------------------------------- dom */
	function el(tag, attrs, kids) {
		var e = document.createElement(tag);
		if (attrs) {
			for (var k in attrs) {
				var v = attrs[k];
				if (k === "class") e.className = v;
				else if (k === "html") e.innerHTML = v;
				else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v);
				else if (k === "value") e.value = v;
				else if (v != null) e.setAttribute(k, v);
			}
		}
		if (kids != null) {
			(Array.isArray(kids) ? kids : [kids]).forEach(function (c) {
				if (c == null) return;
				e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
			});
		}
		return e;
	}
	var $ = function (s) {
		return document.querySelector(s);
	};

	var railEl = $("#rail");
	var tabsEl = $("#tabs");
	var contentEl = $("#content");
	var statusEl = $("#status");

	/* --------------------------------------------------------------- proxying */
	function normalize(value) {
		var url = (value || "").trim();
		if (!url) return null;
		if (/^https?:\/\//i.test(url)) return url;
		if (url.indexOf(".") !== -1 && url.charAt(0) !== " ") return "https://" + url;
		return "https://www.google.com/search?q=" + encodeURIComponent(url);
	}

	async function ensureInit() {
		if (initialized) return;
		controller = await initBootstrap();
		initialized = true;
		var frameEl = $("#sj-frame");
		var plugins = [];
		if (window.$scramjetUtils) {
			plugins.push(new $scramjetUtils.HttpCachePlugin());
			plugins.push(
				new $scramjetUtils.UrlWatcherPlugin(function (url) {
					var inp = $("#sj-address");
					if (inp && document.activeElement !== inp) inp.value = url;
					var fu = $("#sj-frame-url");
					if (fu) fu.textContent = url;
				})
			);
			plugins.push(
				new $scramjetUtils.CatchEscapedLinksPlugin(function (url) {
					return new URL(
						"/?goto=" + encodeURIComponent(url.href),
						location.origin
					);
				})
			);
		}
		browserFrame = controller.createFrame(frameEl, { plugins: plugins });
		attachNetwork(browserFrame);
		applyFastModeIfNeeded();
	}

	async function navigate(value) {
		var url = normalize(value);
		if (!url) return;
		openTab("browser");
		try {
			await ensureInit();
			await browserFrame.go(url);
		} catch (e) {
			var err = $("#sj-error");
			if (err) {
				err.textContent = e.message || String(e);
				setTimeout(function () {
					err.textContent = "";
				}, 6000);
			}
		}
	}

	/* ---------------------------------------------------------- network tap */
	function rawHeaders(h) {
		try {
			if (!h) return [];
			if (typeof h.toRawHeaders === "function") return h.toRawHeaders();
			if (typeof h.entries === "function") return Array.from(h.entries());
			if (Array.isArray(h)) return h;
			return Object.entries(h);
		} catch (e) {
			return [];
		}
	}
	function attachNetwork(frame) {
		if (!has("network") || !window.$scramjet || !$scramjet.Plugin) return;
		if (!frame || !frame.hooks || !frame.hooks.fetch) return;
		var plugin = new $scramjet.Plugin("cll-network");
		plugin.tap(frame.hooks.fetch.request, function (ctx, props) {
			var id = ++reqSeq;
			var url = "";
			try {
				url =
					(props.url && props.url.toString && props.url.toString()) ||
					(ctx.parsed && ctx.parsed.url && ctx.parsed.url.toString()) ||
					"";
			} catch (e) {}
			reqMap.set(ctx.request, id);
			requests.push({
				id: id,
				method: (ctx.request && ctx.request.method) || "GET",
				url: url,
				time: new Date().toLocaleTimeString(),
				start: performance.now(),
				status: null,
				ct: "",
				reqHeaders: rawHeaders(props.init && props.init.headers),
				resHeaders: [],
			});
			if (requests.length > store.maxRequests) requests.shift();
			renderNetwork();
		});
		plugin.tap(frame.hooks.fetch.response, function (ctx, props) {
			var id = reqMap.get(ctx.request);
			if (!id) return;
			var entry = null;
			for (var i = 0; i < requests.length; i++) {
				if (requests[i].id === id) {
					entry = requests[i];
					break;
				}
			}
			if (!entry) return;
			var resp = props.response || {};
			entry.status = resp.status;
			entry.duration = Math.max(0, Math.round(performance.now() - entry.start));
			entry.resHeaders = rawHeaders(resp.headers);
			try {
				entry.ct = (resp.headers && resp.headers.get && resp.headers.get("content-type")) || "";
			} catch (e) {}
			renderNetwork();
		});
	}

	/* ------------------------------------------------------------------ tabs */
	function defineViews() {
		VIEWS.browser = { label: "Browser", icon: "search", build: buildBrowser };
		if (has("start")) VIEWS.start = { label: "Start", icon: "plus", build: buildStart };
		if (has("network")) VIEWS.network = { label: "Network", icon: "pulse", build: buildNetwork };
		if (has("console")) VIEWS.console = { label: "Console", icon: "terminal", build: buildConsole };
		if (has("playground")) VIEWS.playground = { label: "Playground", icon: "code", build: buildPlayground };
		if (has("settings")) VIEWS.settings = { label: "Settings", icon: "gear", build: buildSettings };
	}
	var VIEWS = {};

	function ensureView(id) {
		var view = VIEWS[id];
		if (!view) return null;
		if (!view.el) {
			view.el = el("section", { class: "view", "data-view": id });
			view.el.style.display = "none";
			contentEl.appendChild(view.el);
			view.build(view.el);
		}
		return view.el;
	}

	function openTab(id) {
		if (!VIEWS[id]) return;
		if (tabs.indexOf(id) === -1) tabs.push(id);
		active = id;
		renderTabs();
		showActive();
	}

	function closeTab(id) {
		tabs = tabs.filter(function (t) {
			return t !== id;
		});
		if (active === id) active = tabs[tabs.length - 1] || null;
		renderTabs();
		showActive();
	}

	function showActive() {
		Object.keys(VIEWS).forEach(function (id) {
			var v = VIEWS[id];
			if (v.el) v.el.style.display = id === active ? "flex" : "none";
		});
		if (active) ensureView(active);
		renderRail();
	}

	function renderTabs() {
		tabsEl.innerHTML = "";
		tabs.forEach(function (id) {
			var view = VIEWS[id];
			var tab = el("div", { class: "tab" + (id === active ? " active" : "") }, [
				el("span", { class: "tab-dot" + (id === active ? " on" : "") }),
				el("span", { class: "tab-name" }, view.label.toLowerCase()),
				el(
					"span",
					{
						class: "tab-x",
						onclick: function (e) {
							e.stopPropagation();
							closeTab(id);
						},
					},
					"\u00d7"
				),
			]);
			tab.addEventListener("click", function () {
				openTab(id);
			});
			tabsEl.appendChild(tab);
		});
	}

	function renderRail() {
		railEl.innerHTML = "";
		Object.keys(VIEWS).forEach(function (id) {
			var view = VIEWS[id];
			var b = el(
				"button",
				{
					class: "rail-btn" + (id === active ? " active" : ""),
					title: view.label,
					onclick: function () {
						openTab(id);
					},
				},
				el("span", { class: "cll-ico cll-ico-" + view.icon })
			);
			railEl.appendChild(b);
		});
	}

	/* --------------------------------------------------------------- browser */
	function buildBrowser(root) {
		var form = el("form", { class: "omnibox" }, [
			el("div", { class: "nav" }, [
				el("button", { type: "button", class: "nav-btn", onclick: function () { browserFrame && browserFrame.back && browserFrame.back(); } }, "\u2190"),
				el("button", { type: "button", class: "nav-btn", onclick: function () { browserFrame && browserFrame.forward && browserFrame.forward(); } }, "\u2192"),
				el("button", { type: "button", class: "nav-btn", onclick: function () { browserFrame && browserFrame.reload && browserFrame.reload(); } }, "\u21bb"),
			]),
			el("input", { id: "sj-address", type: "text", autocomplete: "off", spellcheck: "false", placeholder: "Search or enter an address" }),
			el("button", { type: "submit", class: "go" }, "Go"),
		]);
		form.addEventListener("submit", function (e) {
			e.preventDefault();
			navigate($("#sj-address").value);
		});
		root.appendChild(form);
		root.appendChild(el("p", { id: "sj-error" }));
		root.appendChild(el("iframe", { id: "sj-frame" }));
	}

	/* ----------------------------------------------------------------- start */
	function buildStart(root) {
		root.appendChild(el("div", { class: "start-head" }, [
			el("span", { class: "start-mark" }, "CLL"),
			el("h2", null, "Canyon Lake Lab's Proxy"),
			el("p", null, "What do you want to do?"),
		]));
		var tools = el("div", { class: "tiles" });
		var quick = el("div", { class: "tiles" });
		[
			{ label: "Browser", view: "browser", hint: "proxy a site" },
			has("network") && { label: "Network", view: "network", hint: "inspect" },
			has("console") && { label: "Console", view: "console", hint: "inject js" },
			has("playground") && { label: "Playground", view: "playground", hint: "scratch pad" },
			has("settings") && { label: "Settings", view: "settings", hint: "configure" },
		].forEach(function (t) {
			if (!t) return;
			tools.appendChild(
				el("button", { class: "tile", onclick: function () { openTab(t.view); } }, [
					el("span", { class: "tile-title" }, t.label),
					el("span", { class: "tile-hint" }, t.hint),
				])
			);
		});
		[
			["Google", "https://google.com"],
			["YouTube", "https://youtube.com"],
			["GitHub", "https://github.com"],
			["Reddit", "https://reddit.com"],
			["Wikipedia", "https://wikipedia.org"],
			["Discord", "https://discord.com"],
			["Twitch", "https://twitch.tv"],
			["Spotify", "https://spotify.com"],
		].forEach(function (s) {
			quick.appendChild(
				el("button", { class: "tile", onclick: function () { navigate(s[1]); } }, [
					el("span", { class: "tile-title" }, s[0]),
					el("span", { class: "tile-hint" }, s[1].replace(/^https?:\/\//, "")),
				])
			);
		});
		root.appendChild(section("Workspaces", tools));
		root.appendChild(section("Quick launch", quick));
	}
	function section(title, body) {
		return el("div", { class: "start-section" }, [
			el("div", { class: "section-head" }, [el("span", { class: "section-title" }, title), el("span", { class: "section-line" })]),
			body,
		]);
	}

	/* -------------------------------------------------------------- settings */
	function buildSettings(root) {
		root.appendChild(el("div", { class: "panel" }, [
			el("h2", null, "Settings"),
			field("Home page URL", el("input", { id: "set-home", type: "text" })),
			field("Wisp server", el("input", { id: "set-wisp", type: "text", placeholder: "ws://…  (leave blank for default)" })),
			field("Request log limit", el("input", { id: "set-max", type: "number", min: "10", max: "5000" })),
			has("console") ? toggle("Fast mode", "set-fast") : null,
			el("div", { class: "actions" }, [
				el("button", { class: "primary", onclick: saveSettings }, "Apply Settings"),
			]),
			el("p", { class: "status-msg", id: "set-status" }),
		]));
		// fill
		$("#set-home").value = store.homeUrl;
		$("#set-wisp").value = store.wispUrl;
		$("#set-max").value = store.maxRequests;
		var fastEl = $("#set-fast");
		if (fastEl) fastEl.checked = localStorage.getItem("cll-fast") !== "0";
	}
	function field(label, input) {
		return el("label", { class: "field" }, [el("span", { class: "field-label" }, label), input]);
	}
	function toggle(label, id) {
		return el("label", { class: "toggle" }, [
			el("input", { id: id, type: "checkbox" }),
			el("span", null, label),
		]);
	}
	async function saveSettings() {
		store.homeUrl = $("#set-home").value.trim() || "https://google.com";
		store.wispUrl = $("#set-wisp").value.trim();
		store.maxRequests = parseInt($("#set-max").value, 10) || 200;
		localStorage.setItem("cll-home", store.homeUrl);
		localStorage.setItem("cll-wisp", store.wispUrl);
		localStorage.setItem("cll-maxreq", String(store.maxRequests));
		var fast = $("#set-fast");
		if (fast) localStorage.setItem("cll-fast", fast.checked ? "1" : "0");
		var msg = $("#set-status");
		try {
			if (initialized && controller && controller.setTransport && window.LibcurlTransport && window.LibcurlTransport.LibcurlClient) {
				var wisp = store.wispUrl || (location.protocol === "https:" ? "wss" : "ws") + "://" + location.host + "/wisp/";
				controller.setTransport(new LibcurlTransport.LibcurlClient({ wisp: wisp }));
			}
			applyFastModeIfNeeded();
			msg.textContent = "Saved.";
		} catch (e) {
			msg.textContent = "Saved (transport update failed: " + (e.message || e) + ")";
		}
		setTimeout(function () {
			msg.textContent = "";
		}, 4000);
	}
	function applyFastModeIfNeeded() {
		if (!controller || !controller.scramjetConfig || !controller.scramjetConfig.flags) return;
		var fast = localStorage.getItem("cll-fast") !== "0";
		var flags = controller.scramjetConfig.flags;
		if (fast) {
			Object.assign(flags, {
				debugTrampolines: false,
				debugSourceURL: false,
				captureErrors: false,
				rewriterLogs: false,
				sourcemaps: false,
				disableComputedWrap: true,
			});
		}
	}

	/* --------------------------------------------------------------- network */
	function buildNetwork(root) {
		root.appendChild(el("div", { class: "net-bar" }, [
			el("span", { class: "section-title" }, "Requests"),
			el("input", { id: "net-search", type: "text", placeholder: "filter" }),
			el("button", { onclick: function () { requests = []; renderNetwork(); } }, "Clear"),
		]));
		root.appendChild(el("div", { class: "net-split" }, [
			el("div", { class: "net-list", id: "net-list" }),
			el("div", { class: "net-detail", id: "net-detail" }, "Select a request."),
		]));
	}
	function renderNetwork() {
		var list = $("#net-list");
		if (!list) return;
		var filter = ($("#net-search") && $("#net-search").value.toLowerCase()) || "";
		list.innerHTML = "";
		requests
			.filter(function (r) {
				return !filter || r.url.toLowerCase().indexOf(filter) !== -1;
			})
			.forEach(function (r) {
				var row = el("div", { class: "net-row" }, [
					el("span", { class: "net-method" }, r.method),
					el("span", { class: "net-status" + (r.status ? " st-" + Math.floor(r.status / 100) : "") }, r.status || "\u2026"),
					el("span", { class: "net-url" }, r.url),
				]);
				row.addEventListener("click", function () {
					showRequest(r);
				});
				list.appendChild(row);
			});
	}
	function showRequest(r) {
		var d = $("#net-detail");
		if (!d) return;
		d.innerHTML = "";
		var meta = [
			["URL", r.url],
			["Method", r.method],
			["Status", r.status || "\u2026"],
			["Duration", (r.duration != null ? r.duration + "ms" : "\u2026")],
			["Content-Type", r.ct || "unknown"],
		];
		meta.forEach(function (m) {
			d.appendChild(el("div", { class: "detail-row" }, [el("span", { class: "k" }, m[0]), el("span", { class: "v" }, m[1])]));
		});
		d.appendChild(headersTable("Request headers", r.reqHeaders));
		d.appendChild(headersTable("Response headers", r.resHeaders));
	}
	function headersTable(title, headers) {
		var wrap = el("div", { class: "hdr-block" }, [el("div", { class: "hdr-title" }, title)]);
		if (!headers || !headers.length) wrap.appendChild(el("div", { class: "hdr-none" }, "(none)"));
		else headers.forEach(function (h) {
			wrap.appendChild(el("div", { class: "hdr-row" }, [el("span", { class: "k" }, h[0]), el("span", { class: "v" }, h[1])]));
		});
		return wrap;
	}

	/* --------------------------------------------------------------- console */
	function buildConsole(root) {
		var presets = [
			["location.href", "location.href"],
			["document.title", "document.title"],
			["cookies", "document.cookie"],
			["console.log", "console.log('injected from CLL')"],
		];
		var bar = el("div", { class: "con-bar" }, [el("span", { class: "section-title" }, "Console")]);
		presets.forEach(function (p) {
			bar.appendChild(el("button", { class: "pill", onclick: function () { $("#con-in").value = p[1]; } }, p[0]));
		});
		bar.appendChild(el("button", { class: "pill", onclick: function () { $("#con-out").innerHTML = ""; } }, "Clear"));
		root.appendChild(bar);
		root.appendChild(el("div", { class: "con-out", id: "con-out" }));
		var form = el("form", { class: "con-in" }, [
			el("span", { class: "caret" }, "\u203a"),
			el("input", { id: "con-in", type: "text", placeholder: "Run JavaScript in the active page…", value: "document.title" }),
			el("button", { type: "submit", class: "primary" }, "Inject"),
		]);
		form.addEventListener("submit", function (e) {
			e.preventDefault();
			runConsole($("#con-in").value);
		});
		root.appendChild(form);
	}
	function conLog(level, text) {
		var out = $("#con-out");
		if (!out) return;
		out.appendChild(el("div", { class: "log " + level }, [el("span", { class: "log-lv" }, level), el("span", { class: "log-t" }, text)]));
		out.scrollTop = out.scrollHeight;
	}
	function stringify(v) {
		try {
			if (typeof v === "string") return v;
			if (v instanceof Error) return v.stack || v.message;
			var s = JSON.stringify(v, null, 2);
			return s === undefined ? String(v) : s;
		} catch (e) {
			return String(v);
		}
	}
	function runConsole(code) {
		code = (code || "").trim();
		if (!code) return;
		var win = browserFrame && browserFrame.element && browserFrame.element.contentWindow;
		if (!win) {
			conLog("error", "No active page. Load a site in the Browser first.");
			return;
		}
		try {
			if (!win.console.__cllHooked) {
				win.console.__cllHooked = true;
				["log", "info", "warn", "error"].forEach(function (m) {
					var orig = win.console[m] && win.console[m].bind(win.console);
					win.console[m] = function () {
						conLog(m, Array.prototype.map.call(arguments, stringify).join(" "));
						orig && orig.apply(null, arguments);
					};
				});
			}
		} catch (e) {}
		conLog("in", "> " + code);
		try {
			var r = win.eval(code);
			if (r !== undefined) conLog("out", stringify(r));
		} catch (e) {
			conLog("error", String((e && e.message) || e));
		}
	}

	/* ------------------------------------------------------------ playground */
	var FILES_KEY = "cll-playground-files";
	function loadFiles() {
		try {
			var f = JSON.parse(localStorage.getItem(FILES_KEY));
			if (f && typeof f === "object") return f;
		} catch (e) {}
		return {
			"/index.html":
				'<!doctype html>\n<html>\n  <head>\n    <meta charset="utf-8" />\n    <title>CLL Playground</title>\n  </head>\n  <body>\n    <h1>Hello from CLL</h1>\n    <script src="/main.js"><\/script>\n  </body>\n</html>\n',
			"/style.css": "body{font-family:system-ui;background:#0b0d0c;color:#eafff4;padding:24px}\n",
			"/main.js": 'console.log("CLL playground running");\n',
		};
	}
	var files = loadFiles();
	function saveFiles() {
		try {
			localStorage.setItem(FILES_KEY, JSON.stringify(files));
		} catch (e) {}
	}
	function buildPlayground(root) {
		var bar = el("div", { class: "pg-bar" }, [
			el("span", { class: "section-title" }, "Files"),
			el("input", { id: "pg-new", type: "text", placeholder: "/new-file.js" }),
			el("button", { onclick: newFile }, "Add"),
			el("button", { onclick: function () { $("#pg-import").click(); } }, "Import"),
			el("button", { onclick: exportFile }, "Export"),
			el("button", { class: "primary", onclick: runPreview }, "Preview"),
			el("input", { id: "pg-import", type: "file", multiple: "multiple", style: "display:none", accept: ".html,.htm,.js,.mjs,.css,.json,.txt,.svg,.md" }),
		]);
		root.appendChild(bar);
		root.appendChild(el("div", { class: "pg-split" }, [
			el("div", { class: "pg-list", id: "pg-list" }),
			el("div", { class: "pg-edit" }, [
				el("div", { class: "pg-file", id: "pg-file" }),
				el("textarea", { id: "pg-code", spellcheck: "false" }),
			]),
			el("div", { class: "pg-preview" }, [el("iframe", { id: "pg-frame", sandbox: "allow-scripts allow-modals" })]),
		]));
		renderFileList();
		selectFile(Object.keys(files).sort()[0]);
		$("#pg-code").addEventListener("input", function () {
			if (!currentFile) return;
			files[currentFile] = $("#pg-code").value;
			saveFiles();
		});
		$("#pg-import").addEventListener("change", importFiles);
		runPreview();
	}
	var currentFile = null;
	function renderFileList() {
		var list = $("#pg-list");
		if (!list) return;
		list.innerHTML = "";
		Object.keys(files)
			.sort()
			.forEach(function (p) {
				var b = el(
					"button",
					{
						class: "file-item" + (p === currentFile ? " active" : ""),
						onclick: function () {
							selectFile(p);
						},
					},
					p.replace(/^\//, "")
				);
				list.appendChild(b);
			});
	}
	function selectFile(p) {
		currentFile = p;
		$("#pg-code").value = files[p] != null ? files[p] : "";
		$("#pg-file").textContent = p.replace(/^\//, "");
		renderFileList();
	}
	function newFile() {
		var p = ($("#pg-new").value || "").trim();
		if (!p) return;
		if (p.charAt(0) !== "/") p = "/" + p;
		if (files[p] != null) return;
		files[p] = "";
		saveFiles();
		$("#pg-new").value = "";
		selectFile(p);
		runPreview();
	}
	async function importFiles(e) {
		var list = Array.from(e.target.files || []);
		for (var i = 0; i < list.length; i++) {
			try {
				var text = await list[i].text();
				var p = "/" + list[i].name;
				files[p] = text;
				selectFile(p);
			} catch (err) {}
		}
		saveFiles();
		e.target.value = "";
		runPreview();
	}
	function exportFile() {
		if (!currentFile) return;
		var blob = new Blob([files[currentFile] || ""], { type: "text/plain" });
		var url = URL.createObjectURL(blob);
		var a = el("a", { href: url, download: currentFile.replace(/^\//, "") });
		document.body.appendChild(a);
		a.click();
		a.remove();
		setTimeout(function () {
			URL.revokeObjectURL(url);
		}, 1000);
	}
	function runPreview() {
		var html = files["/index.html"] || "";
		var css = files["/style.css"] || "";
		var js = files["/main.js"] || "";
		if (css && html.indexOf("style.css") !== -1) html = html.replace(/<link[^>]*style\.css[^>]*>/i, "<style>" + css + "</style>");
		if (js && html.indexOf("main.js") !== -1) html = html.replace(/<script[^>]*main\.js[^>]*><\/script>/i, "<script>" + js + "<\/script>");
		var frame = $("#pg-frame");
		if (frame) frame.srcdoc = html;
	}

	/* ------------------------------------------------------------------ boot */
	function bindPanic() {
		if (!has("console")) return; // panic ships from v4 (console gate used as proxy for "power")
		document.addEventListener("keydown", function (e) {
			var k = localStorage.getItem("cll-panic-key");
			var u = localStorage.getItem("cll-panic-url");
			if (k && u && e.key === k) location.replace(u);
		});
	}

	function boot() {
		defineViews();
		renderRail();
		openTab("browser");
		if (VIEWS.start) openTab("start");
		// keep browser active by default
		active = "browser";
		renderTabs();
		showActive();
		statusEl.textContent = "Canyon Lake Labs \u00b7 v" + V;
		var goto = new URL(location.href).searchParams.get("goto");
		if (goto) {
			history.replaceState(null, "", location.pathname);
			navigate(goto);
		}
		bindPanic();
	}

	document.addEventListener("DOMContentLoaded", boot);
})();
