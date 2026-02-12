import { createStore } from "@marianmeres/store";
import { makeDraggable } from "./draggable.ts";
import { makeResizable } from "./resizable.ts";
import {
	ANIMATE_PRESETS,
	type AnimateConfig,
	applyIframeBaseStyles,
	applyPreset,
	PLACEHOLDER_BASE,
	STYLE_PRESETS,
	TRIGGER_BASE,
} from "./style-presets.ts";
import {
	type DraggableHandle,
	type DraggableOptions,
	type MessageHandler,
	MSG_PREFIX,
	type PlaceholderOptions,
	type ResizableHandle,
	type ResizableOptions,
	type SnapEdge,
	type StylePreset,
	type Unsubscribe,
	type WidgetMessage,
	type WidgetProviderApi,
	type WidgetProviderOptions,
	type WidgetState,
} from "./types.ts";
import { createClog } from "@marianmeres/clog";
import { createPubSub } from "@marianmeres/pubsub";

const clog = createClog("widget-provider");

const DEFAULT_TRIGGER_ICON =
	`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;

/**
 * Resolve the list of allowed origins for postMessage validation.
 * Uses explicit value if provided, otherwise derives from widgetUrl. Falls back to `["*"]`.
 */
export function resolveAllowedOrigins(
	explicit: string | string[] | undefined,
	widgetUrl: string,
): string[] {
	if (explicit) {
		return Array.isArray(explicit) ? explicit : [explicit];
	}
	try {
		return [new URL(widgetUrl).origin];
	} catch {
		return ["*"];
	}
}

/** Check whether a given origin is permitted by the allowed origins list. */
export function isOriginAllowed(
	origin: string,
	allowed: string[],
): boolean {
	if (allowed.includes("*")) return true;
	return allowed.includes(origin);
}

/** Resolve the `animate` option into a concrete {@linkcode AnimateConfig} or `null` if disabled. */
export function resolveAnimateConfig(
	opt: WidgetProviderOptions["animate"],
): AnimateConfig | null {
	if (!opt) return null;
	if (opt === true) return ANIMATE_PRESETS["fade-scale"];
	if (typeof opt === "string") return ANIMATE_PRESETS[opt] ?? null;
	const base = ANIMATE_PRESETS[opt.preset ?? "fade-scale"];
	if (!base) return null;
	return opt.transition ? { ...base, transition: opt.transition } : base;
}

/**
 * Create and embed an iframe-based widget into the host page.
 *
 * Creates a sandboxed iframe, applies the chosen style preset, wires up
 * bidirectional postMessage communication, and returns a control API.
 *
 * @throws {Error} If `widgetUrl` is not provided.
 */
export function provideWidget(
	options: WidgetProviderOptions,
): WidgetProviderApi {
	const {
		widgetUrl,
		parentContainer,
		stylePreset = "inline" as StylePreset,
		styleOverrides = {},
		allowedOrigin,
		visible = true,
		sandbox = "allow-scripts allow-same-origin",
		iframeAttrs = {},
		smallScreenBreakpoint = 640,
	} = options;

	if (!widgetUrl) {
		throw new Error("widgetUrl is required");
	}

	const origins = resolveAllowedOrigins(allowedOrigin, widgetUrl);
	const initialPreset = stylePreset;
	const anim = resolveAnimateConfig(options.animate);

	function checkSmallScreen(): boolean {
		return smallScreenBreakpoint > 0 &&
			globalThis.innerWidth < smallScreenBreakpoint;
	}

	// reactive state
	const state = createStore<WidgetState>({
		visible,
		ready: false,
		destroyed: false,
		preset: stylePreset,
		heightState: "normal",
		widthState: "normal",
		detached: false,
		isSmallScreen: checkSmallScreen(),
	});

	// DOM
	const container = document.createElement("div");
	const iframe = document.createElement("iframe");

	applyPreset(container, stylePreset, styleOverrides);
	applyIframeBaseStyles(iframe);

	iframe.src = widgetUrl;
	if (sandbox) {
		iframe.setAttribute("sandbox", sandbox);
	}
	iframe.setAttribute("allowfullscreen", "");
	for (const [k, v] of Object.entries(iframeAttrs)) {
		iframe.setAttribute(k, v);
	}

	container.appendChild(iframe);

	if (anim) {
		container.style.transition = anim.transition;
	}

	if (!visible) {
		container.style.display = "none";
		if (anim) {
			Object.assign(container.style, anim.hidden);
		}
	}

	// messaging
	const pubsub = createPubSub({
		onError: (error) => {
			clog.warn("message handler error:", error);
		},
	});

	function handleMessage(event: MessageEvent): void {
		if (!isOriginAllowed(event.origin, origins)) return;
		if (event.source !== iframe.contentWindow) return;

		const data = event.data as WidgetMessage;
		if (!data || typeof data.type !== "string") return;
		if (!data.type.startsWith(MSG_PREFIX)) return;

		// built-in control messages
		const bareType = data.type.slice(MSG_PREFIX.length);
		switch (bareType) {
			case "ready":
				state.update((s) => ({ ...s, ready: true }));
				send("heightState", state.get().heightState);
				send("widthState", state.get().widthState);
				send("detached", state.get().detached);
				send("isSmallScreen", state.get().isSmallScreen);
				break;
			case "open":
				open();
				break;
			case "maximize":
				maximize();
				break;
			case "minimize":
				minimize();
				break;
			case "maximizeHeight":
				maximizeHeight(
					typeof data.payload === "number" ? data.payload : undefined,
				);
				break;
			case "minimizeHeight":
				minimizeHeight(
					typeof data.payload === "number" ? data.payload : undefined,
				);
				break;
			case "maximizeWidth":
				maximizeWidth(
					typeof data.payload === "number" ? data.payload : undefined,
				);
				break;
			case "minimizeWidth":
				minimizeWidth(
					typeof data.payload === "number" ? data.payload : undefined,
				);
				break;
			case "reset":
				reset();
				break;
			case "hide":
				hide();
				break;
			case "close":
				destroy();
				break;
			case "setPreset":
				if (
					typeof data.payload === "string" &&
					data.payload in STYLE_PRESETS
				) {
					setPreset(data.payload as StylePreset);
				}
				break;
			case "detach":
				detach();
				break;
			case "dock":
				dock();
				break;
			case "nativeFullscreen":
				requestNativeFullscreen();
				break;
			case "exitNativeFullscreen":
				exitNativeFullscreen();
				break;
		}

		pubsub.publish(data.type, data.payload);
	}

	globalThis.addEventListener("message", handleMessage);

	// small screen tracking
	function handleResize(): void {
		const small = checkSmallScreen();
		if (small !== state.get().isSmallScreen) {
			state.update((s) => ({ ...s, isSmallScreen: small }));
			send("isSmallScreen", small);
		}
	}
	globalThis.addEventListener("resize", handleResize);

	// append to DOM
	const appendTarget = parentContainer || document.body;
	appendTarget.appendChild(container);

	// detach/dock state
	let placeholderEl: HTMLElement | null = null;
	let originalParent: HTMLElement | null = null;
	let presetBeforeDetach: StylePreset | null = null;
	const resolvePlaceholderOpts = (): PlaceholderOptions =>
		typeof options.placeholder === "object" ? options.placeholder : {};

	// draggable (float only)
	let draggableHandle: DraggableHandle | null = null;
	const resolveDragOpts = (): DraggableOptions => {
		const base: DraggableOptions = typeof options.draggable === "object"
			? options.draggable
			: {};
		return {
			...base,
			edgeSnap: base.edgeSnap ?? true,
			resetSnap: {
				isActive: () => {
					const s = state.get();
					return s.heightState === "maximized" && s.widthState === "maximized";
				},
				createGhost: () => {
					const presetStyle = { ...STYLE_PRESETS[state.get().preset], ...styleOverrides };
					const rect = container.getBoundingClientRect();
					const ghost = document.createElement("div");
					Object.assign(ghost.style, {
						position: "fixed",
						boxSizing: "border-box",
						border: "2px dashed rgba(128, 128, 128, 0.5)",
						borderRadius: "8px",
						background: "rgba(128, 128, 128, 0.1)",
						zIndex: "10001",
						pointerEvents: "none",
						transition: "opacity 150ms ease",
						opacity: "0",
						top: `${rect.top}px`,
						left: `${rect.left}px`,
						width: presetStyle.width ?? "380px",
						height: presetStyle.height ?? "520px",
					} satisfies Partial<CSSStyleDeclaration>);
					return ghost;
				},
			},
			onResetSnap: () => {
				const s = state.get();
				if (s.heightState === "maximized" && s.widthState === "maximized") {
					const presetStyle = { ...STYLE_PRESETS[s.preset], ...styleOverrides };
					container.style.width = presetStyle.width ?? "";
					container.style.height = presetStyle.height ?? "";
					clearAxisOverrides();
					state.update((st) => ({
						...st,
						heightState: "normal",
						widthState: "normal",
					}));
					send("heightState", "normal");
					send("widthState", "normal");
				}
			},
			onEdgeSnap: (edge: SnapEdge) => {
				// Capture geometry before maximize (resetToPreset reverts to
				// preset defaults, losing dragged position and resized dimensions)
				const rect = container.getBoundingClientRect();
				if (edge.includes("-")) {
					// Corner snap — maximize both axes
					maximizeHeight();
					maximizeWidth();
				} else if (edge === "left" || edge === "right") {
					maximizeHeight();
					// Preserve horizontal position and width at the snapped edge
					container.style.left = `${rect.left}px`;
					container.style.right = "auto";
					container.style.width = `${rect.width}px`;
				} else {
					maximizeWidth();
					// Preserve vertical position and height at the snapped edge
					container.style.top = `${rect.top}px`;
					container.style.bottom = "auto";
					container.style.height = `${rect.height}px`;
				}
			},
		};
	};

	function teardownDraggable(): void {
		if (draggableHandle) {
			draggableHandle.destroy();
			draggableHandle = null;
		}
	}

	function setupDraggable(): void {
		if (state.get().preset === "float" && options.draggable) {
			draggableHandle = makeDraggable(container, iframe, resolveDragOpts());
		}
	}

	// resizable (float only)
	let resizableHandle: ResizableHandle | null = null;
	const resolveResizeOpts = (): ResizableOptions => {
		const base: ResizableOptions = typeof options.resizable === "object"
			? options.resizable
			: {};
		return {
			...base,
			onResizeEnd: () => {
				const s = state.get();
				if (s.heightState !== "normal" || s.widthState !== "normal") {
					clearAxisOverrides();
					state.update((st) => ({
						...st,
						heightState: "normal",
						widthState: "normal",
					}));
					send("heightState", "normal");
					send("widthState", "normal");
				}
			},
		};
	};

	function teardownResizable(): void {
		if (resizableHandle) {
			resizableHandle.destroy();
			resizableHandle = null;
		}
	}

	function setupResizable(): void {
		if (state.get().preset === "float" && options.resizable) {
			resizableHandle = makeResizable(container, iframe, resolveResizeOpts());
		}
	}

	// combined interaction lifecycle helpers
	function teardownInteractions(): void {
		teardownDraggable();
		teardownResizable();
	}

	function setupInteractions(): void {
		setupDraggable();
		setupResizable();
	}

	setupInteractions();

	// --- Axis dimension control (shared height/width logic) ---

	type Axis = "height" | "width";

	// Remembers CSS overrides per axis so the other axis can be re-applied
	// after a full cssText reset
	let heightOverrides: Record<string, string> | null = null;
	let widthOverrides: Record<string, string> | null = null;

	const AXIS_CONFIG = {
		height: {
			startProp: "top" as const,
			endProp: "bottom" as const,
			sizeProp: "height" as const,
			viewportUnit: "vh",
			viewportSize: () => globalThis.innerHeight,
			stateKey: "heightState" as const,
			getOverrides: () => heightOverrides,
			setOverrides: (v: Record<string, string> | null) => {
				heightOverrides = v;
			},
		},
		width: {
			startProp: "left" as const,
			endProp: "right" as const,
			sizeProp: "width" as const,
			viewportUnit: "vw",
			viewportSize: () => globalThis.innerWidth,
			stateKey: "widthState" as const,
			getOverrides: () => widthOverrides,
			setOverrides: (v: Record<string, string> | null) => {
				widthOverrides = v;
			},
		},
	};

	/** Reset container CSS to preset baseline, re-applying the other axis's overrides. */
	function resetToPreset(
		presetOverride?: StylePreset,
		skipAxisReapply?: Axis,
	): void {
		const preset = presetOverride ?? state.get().preset;
		container.style.cssText = "";
		applyPreset(container, preset, styleOverrides);
		if (anim) {
			container.style.transition = anim.transition;
		}
		if (!state.get().visible) {
			container.style.display = "none";
			if (anim) {
				Object.assign(container.style, anim.hidden);
			}
		}
		// Re-apply the other axis's saved overrides
		for (const [axis, cfg] of Object.entries(AXIS_CONFIG)) {
			if (axis === skipAxisReapply) continue;
			const overrides = cfg.getOverrides();
			if (overrides) {
				Object.assign(container.style, overrides);
			}
		}
	}

	function clearAxisOverrides(): void {
		heightOverrides = null;
		widthOverrides = null;
	}

	function maximizeAxis(axis: Axis, offset?: number): void {
		if (state.get().destroyed) return;
		if (state.get().preset === "inline") return;

		const cfg = AXIS_CONFIG[axis];
		teardownInteractions();
		resetToPreset(undefined, axis);

		// Calculate offset from the known preset position
		let o: number;
		if (offset !== undefined) {
			o = offset;
		} else {
			const rect = container.getBoundingClientRect();
			const vs = cfg.viewportSize();
			if (rect.width === 0 && rect.height === 0) {
				o = 20;
			} else {
				const startDist = axis === "height" ? rect.top : rect.left;
				const endDist = vs -
					(axis === "height" ? rect.bottom : rect.right);
				o = Math.max(0, Math.min(startDist, endDist));
			}
		}

		// Save and apply overrides
		const overrides: Record<string, string> = {
			[cfg.startProp]: `${o}px`,
			[cfg.endProp]: "",
			[cfg.sizeProp]: `calc(100${cfg.viewportUnit} - ${o * 2}px)`,
		};
		cfg.setOverrides(overrides);
		Object.assign(container.style, overrides);

		state.update((s) => ({ ...s, [cfg.stateKey]: "maximized" }));
		setupInteractions();
		send(cfg.stateKey, "maximized");
	}

	function minimizeAxis(axis: Axis, size?: number): void {
		if (state.get().destroyed) return;
		if (state.get().preset === "inline") return;

		const cfg = AXIS_CONFIG[axis];
		teardownInteractions();
		resetToPreset(undefined, axis);

		// Save and apply overrides
		const overrides: Record<string, string> = {
			[cfg.sizeProp]: `${size ?? 48}px`,
		};
		cfg.setOverrides(overrides);
		Object.assign(container.style, overrides);

		state.update((s) => ({ ...s, [cfg.stateKey]: "minimized" }));
		setupInteractions();
		send(cfg.stateKey, "minimized");
	}

	// trigger button
	const triggerOpts = options.trigger;
	let triggerEl: HTMLElement | null = null;
	if (triggerOpts) {
		triggerEl = document.createElement("button");
		Object.assign(triggerEl.style, TRIGGER_BASE);
		if (typeof triggerOpts === "object" && triggerOpts.style) {
			Object.assign(triggerEl.style, triggerOpts.style);
		}
		const content = typeof triggerOpts === "object" && triggerOpts.content
			? triggerOpts.content
			: DEFAULT_TRIGGER_ICON;
		triggerEl.innerHTML = content;
		if (visible) {
			triggerEl.style.display = "none";
		}
		triggerEl.addEventListener("click", () => open());
		appendTarget.appendChild(triggerEl);
	}

	// API
	function open(): void {
		show();
		if (state.get().isSmallScreen) {
			maximize();
		} else if (!(container.style.top || container.style.left)) {
			minimize();
		}
	}

	function show(): void {
		if (state.get().destroyed) return;
		if (anim) {
			Object.assign(container.style, anim.hidden);
			container.style.display = "";
			container.offsetHeight; // force reflow
			Object.assign(container.style, anim.visible);
		} else {
			container.style.display = "";
		}
		if (triggerEl) triggerEl.style.display = "none";
		state.update((s) => ({ ...s, visible: true }));
	}

	function hide(): void {
		if (state.get().destroyed) return;
		if (triggerEl) triggerEl.style.display = "";
		state.update((s) => ({ ...s, visible: false }));
		if (anim) {
			Object.assign(container.style, anim.hidden);
			const done = () => {
				if (!state.get().visible) {
					container.style.display = "none";
				}
			};
			container.addEventListener("transitionend", done, {
				once: true,
			});
			setTimeout(done, 250);
		} else {
			container.style.display = "none";
		}
	}

	function toggle(): void {
		if (state.get().visible) hide();
		else show();
	}

	function setPreset(preset: StylePreset): void {
		if (state.get().destroyed) return;
		if (!(preset in STYLE_PRESETS)) return;
		// If detached and requesting inline, dock instead
		if (state.get().detached && preset === "inline") {
			dock();
			return;
		}
		teardownInteractions();
		clearAxisOverrides();
		resetToPreset(preset);
		state.update((s) => ({
			...s,
			preset,
			heightState: "normal",
			widthState: "normal",
		}));
		setupInteractions();
		send("heightState", "normal");
		send("widthState", "normal");
	}

	function maximize(): void {
		setPreset("fullscreen");
	}

	function minimize(): void {
		setPreset(initialPreset);
	}

	function maximizeHeight(offset?: number): void {
		maximizeAxis("height", offset);
	}

	function minimizeHeight(height?: number): void {
		minimizeAxis("height", height);
	}

	function maximizeWidth(offset?: number): void {
		maximizeAxis("width", offset);
	}

	function minimizeWidth(width?: number): void {
		minimizeAxis("width", width);
	}

	function reset(): void {
		if (state.get().destroyed) return;
		if (state.get().preset === "inline") return;
		clearAxisOverrides();
		setPreset(state.get().preset);
	}

	function requestNativeFullscreen(): Promise<void> {
		if (state.get().destroyed) return Promise.resolve();
		return iframe.requestFullscreen();
	}

	function exitNativeFullscreen(): Promise<void> {
		if (!document.fullscreenElement) return Promise.resolve();
		return document.exitFullscreen();
	}

	function destroy(): void {
		if (state.get().destroyed) return;
		// Clean up placeholder if detached
		if (state.get().detached) {
			placeholderEl?.remove();
			placeholderEl = null;
		}
		teardownInteractions();
		globalThis.removeEventListener("message", handleMessage);
		globalThis.removeEventListener("resize", handleResize);
		pubsub.unsubscribeAll();
		iframe.src = "about:blank";
		container.remove();
		triggerEl?.remove();
		state.update((s) => ({
			visible: false,
			ready: false,
			destroyed: true,
			preset: s.preset,
			heightState: s.heightState,
			widthState: s.widthState,
			detached: false,
			isSmallScreen: s.isSmallScreen,
		}));
	}

	function detach(): void {
		const s = state.get();
		if (s.destroyed || s.detached) return;

		if (!parentContainer) {
			clog.warn("detach() requires a parentContainer");
			return;
		}

		if (s.preset !== "inline") {
			clog.warn(
				`detach() only works with "inline" preset (current: "${s.preset}")`,
			);
			return;
		}

		// Remember where we were
		originalParent = parentContainer;
		presetBeforeDetach = s.preset;

		// Capture current dimensions for the placeholder
		const rect = container.getBoundingClientRect();

		// Create placeholder
		placeholderEl = document.createElement("div");
		const placeholderOpts = resolvePlaceholderOpts();
		Object.assign(placeholderEl.style, PLACEHOLDER_BASE);
		placeholderEl.style.width = `${rect.width}px`;
		placeholderEl.style.height = `${rect.height}px`;
		if (placeholderOpts.style) {
			Object.assign(placeholderEl.style, placeholderOpts.style);
		}
		if (placeholderOpts.content) {
			placeholderEl.innerHTML = placeholderOpts.content;
		}

		// Insert placeholder in the original position
		originalParent.insertBefore(placeholderEl, container);

		// Move the container to document.body (preserves iframe state!)
		document.body.appendChild(container);

		// Switch visual style: fullscreen on small screens, float otherwise
		const detachedPreset = state.get().isSmallScreen
			? "fullscreen" as StylePreset
			: "float" as StylePreset;
		teardownInteractions();
		clearAxisOverrides();
		resetToPreset(detachedPreset);

		// Update state
		state.update((st) => ({
			...st,
			preset: detachedPreset,
			detached: true,
			heightState: "normal",
			widthState: "normal",
		}));

		setupInteractions();

		send("detached", true);
		send("heightState", "normal");
		send("widthState", "normal");
	}

	function dock(): void {
		const s = state.get();
		if (s.destroyed || !s.detached) return;
		if (!originalParent || !placeholderEl) return;

		teardownInteractions();

		// Move container back to original parent, replacing placeholder
		originalParent.insertBefore(container, placeholderEl);
		placeholderEl.remove();
		placeholderEl = null;

		// Restore inline style
		const restorePreset = presetBeforeDetach ?? "inline";
		clearAxisOverrides();
		resetToPreset(restorePreset);

		// Update state
		state.update((st) => ({
			...st,
			preset: restorePreset,
			detached: false,
			heightState: "normal",
			widthState: "normal",
		}));

		setupInteractions();

		send("detached", false);
		send("heightState", "normal");
		send("widthState", "normal");

		// Clean up references
		originalParent = null;
		presetBeforeDetach = null;
	}

	function send<T = unknown>(type: string, payload?: T): void {
		if (state.get().destroyed) return;
		iframe.contentWindow?.postMessage(
			{ type: `${MSG_PREFIX}${type}`, payload } satisfies WidgetMessage,
			origins[0] || "*",
		);
	}

	function onMessage<T = unknown>(
		type: string,
		handler: MessageHandler<T>,
	): Unsubscribe {
		const prefixedType = `${MSG_PREFIX}${type}`;
		return pubsub.subscribe(
			prefixedType,
			handler as MessageHandler,
		);
	}

	return {
		open,
		show,
		hide,
		toggle,
		destroy,
		setPreset,
		maximize,
		minimize,
		maximizeHeight,
		minimizeHeight,
		maximizeWidth,
		minimizeWidth,
		reset,
		requestNativeFullscreen,
		exitNativeFullscreen,
		detach,
		dock,
		send,
		onMessage,
		subscribe: state.subscribe,
		get: state.get,
		get iframe() {
			return iframe;
		},
		get container() {
			return container;
		},
		get trigger() {
			return triggerEl;
		},
		get placeholder() {
			return placeholderEl;
		},
	};
}
