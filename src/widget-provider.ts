import { createStore } from "@marianmeres/store";
import { makeDraggable } from "./draggable.ts";
import { makeResizable } from "./resizable.ts";
import {
	ANIMATE_PRESETS,
	type AnimateConfig,
	applyIframeBaseStyles,
	applyPreset,
	GHOST_BASE,
	PLACEHOLDER_BASE,
	STYLE_PRESETS,
	TRIGGER_BASE,
} from "./style-presets.ts";
import {
	type DraggableHandle,
	type DraggableOptions,
	type MessageHandler,
	MSG_PREFIX,
	MSG_TYPE_DESTROY,
	MSG_TYPE_DETACH,
	MSG_TYPE_DETACHED,
	MSG_TYPE_DOCK,
	MSG_TYPE_EXIT_NATIVE_FULLSCREEN,
	MSG_TYPE_FULLSCREEN,
	MSG_TYPE_HASH_REPORT,
	MSG_TYPE_HEIGHT_STATE,
	MSG_TYPE_HIDE,
	MSG_TYPE_IS_SMALL_SCREEN,
	MSG_TYPE_MAXIMIZE_HEIGHT,
	MSG_TYPE_MAXIMIZE_WIDTH,
	MSG_TYPE_MINIMIZE_HEIGHT,
	MSG_TYPE_MINIMIZE_WIDTH,
	MSG_TYPE_NATIVE_FULLSCREEN,
	MSG_TYPE_OPEN,
	MSG_TYPE_PRESET,
	MSG_TYPE_READY,
	MSG_TYPE_REQUEST_HASH,
	MSG_TYPE_RESET,
	MSG_TYPE_RESTORE,
	MSG_TYPE_SET_PRESET,
	MSG_TYPE_WIDTH_STATE,
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

// Once-per-page guard for the PWA safe-area misconfiguration warning below.
let pwaSafeAreaWarned = false;

/**
 * Best-effort dev warning emitted when the `fullscreen` preset becomes active
 * inside an installed PWA whose host page lacks `viewport-fit=cover`.
 *
 * The injected safe-area stylesheet (PWA_SAFE_AREA_CSS) relies on
 * `env(safe-area-inset-*)`, which only resolves to nonzero values when the HOST
 * page's viewport meta opts in via `viewport-fit=cover` — something this library
 * cannot set on the host. Without it the fix is a silent no-op, so we surface the
 * cause once. Heuristic and conservative: never warns outside a PWA display mode.
 */
function warnIfPwaMissingViewportFit(): void {
	if (pwaSafeAreaWarned) return;
	if (typeof globalThis.matchMedia !== "function") return;
	const isPwa = globalThis.matchMedia("(display-mode: standalone)").matches ||
		globalThis.matchMedia("(display-mode: fullscreen)").matches;
	if (!isPwa) return;
	pwaSafeAreaWarned = true; // evaluate at most once, only once actually in a PWA
	const metas = Array.from(
		document.querySelectorAll<HTMLMetaElement>('meta[name="viewport"]'),
	);
	const hasCover = metas.some((m) => /viewport-fit\s*=\s*cover/i.test(m.content));
	if (!hasCover) {
		clog.warn(
			`fullscreen preset is active in a PWA (standalone/fullscreen display-mode), ` +
				`but the host page's <meta name="viewport"> lacks "viewport-fit=cover". ` +
				`Device safe areas (notch / home indicator) won't be respected — the ` +
				`fullscreen overlay can clip under system UI. Add viewport-fit=cover to ` +
				`the host viewport meta to enable safe-area insets.`,
		);
	}
}

const DEFAULT_TRIGGER_ICON =
	`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;

const DEFAULT_HIDE_FALLBACK_MS = 250;

/**
 * Resolve the list of allowed origins for postMessage validation.
 * Uses explicit value if provided, otherwise derives from widgetUrl. Falls back to `["*"]`
 * when the URL cannot be parsed.
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
export function isOriginAllowed(origin: string, allowed: string[]): boolean {
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
 * Parse the first duration (ms or s) from a CSS transition shorthand string.
 * Returns `fallbackMs` if no duration is found.
 */
export function parseTransitionMs(
	transition: string,
	fallbackMs = DEFAULT_HIDE_FALLBACK_MS,
): number {
	const match = transition.match(/(\d+(?:\.\d+)?)\s*(ms|s)\b/);
	if (!match) return fallbackMs;
	const value = parseFloat(match[1]);
	return match[2] === "s" ? value * 1000 : value;
}

/**
 * Create and embed an iframe-based widget into the host page.
 *
 * Creates a sandboxed iframe, applies the chosen style preset, wires up
 * bidirectional postMessage communication, and returns a control API.
 *
 * @throws {Error} If `widgetUrl` is not provided.
 */
function _provideWidget(
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

	// Warn when origin validation effectively disabled due to URL parse failure
	if (!allowedOrigin && origins[0] === "*") {
		clog.warn(
			`Could not derive origin from widgetUrl="${widgetUrl}" — falling back to "*". ` +
				`This disables origin validation; pass an explicit allowedOrigin for production.`,
		);
	}

	function checkSmallScreen(): boolean {
		return (
			smallScreenBreakpoint > 0 &&
			globalThis.innerWidth < smallScreenBreakpoint
		);
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

	// tracks when open() auto-switched to fullscreen on a small screen; lets a
	// later open() on a large screen revert to the initial preset without
	// clobbering an explicit user setPreset() made in between.
	let smallScreenAutoFullscreen = false;

	// DOM
	const container = document.createElement("div");
	const iframe = document.createElement("iframe");

	applyPreset(container, stylePreset, styleOverrides);
	applyIframeBaseStyles(iframe);
	if (stylePreset === "fullscreen") warnIfPwaMissingViewportFit();

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

	// remembered origin of the last valid iframe message; used to target send()
	// correctly when multiple origins are allowed.
	let lastIframeOrigin: string | null = null;
	let sendOriginWarned = false;

	function handleMessage(event: MessageEvent): void {
		if (!isOriginAllowed(event.origin, origins)) return;
		if (event.source !== iframe.contentWindow) return;

		const data = event.data as WidgetMessage;
		if (!data || typeof data.type !== "string") return;
		if (!data.type.startsWith(MSG_PREFIX)) return;

		// remember iframe's actual origin for accurate send() targeting
		lastIframeOrigin = event.origin;

		// built-in control messages — handlers run BEFORE user onMessage handlers
		const bareType = data.type.slice(MSG_PREFIX.length);
		switch (bareType) {
			case MSG_TYPE_READY:
				state.update((s) => ({ ...s, ready: true }));
				send(MSG_TYPE_PRESET, state.get().preset);
				send(MSG_TYPE_HEIGHT_STATE, state.get().heightState);
				send(MSG_TYPE_WIDTH_STATE, state.get().widthState);
				send(MSG_TYPE_DETACHED, state.get().detached);
				send(MSG_TYPE_IS_SMALL_SCREEN, state.get().isSmallScreen);
				break;
			case MSG_TYPE_OPEN:
				open();
				break;
			case MSG_TYPE_FULLSCREEN:
				fullscreen();
				break;
			case MSG_TYPE_RESTORE:
				restore();
				break;
			case MSG_TYPE_MAXIMIZE_HEIGHT:
				maximizeHeight(
					typeof data.payload === "number" ? data.payload : undefined,
				);
				break;
			case MSG_TYPE_MINIMIZE_HEIGHT:
				minimizeHeight(
					typeof data.payload === "number" ? data.payload : undefined,
				);
				break;
			case MSG_TYPE_MAXIMIZE_WIDTH:
				maximizeWidth(
					typeof data.payload === "number" ? data.payload : undefined,
				);
				break;
			case MSG_TYPE_MINIMIZE_WIDTH:
				minimizeWidth(
					typeof data.payload === "number" ? data.payload : undefined,
				);
				break;
			case MSG_TYPE_RESET:
				reset();
				break;
			case MSG_TYPE_HIDE:
				hide();
				break;
			case MSG_TYPE_DESTROY:
				destroy();
				break;
			case MSG_TYPE_SET_PRESET:
				if (
					typeof data.payload === "string" &&
					data.payload in STYLE_PRESETS
				) {
					setPreset(data.payload as StylePreset);
				}
				break;
			case MSG_TYPE_DETACH:
				detach();
				break;
			case MSG_TYPE_DOCK:
				dock();
				break;
			case MSG_TYPE_NATIVE_FULLSCREEN:
				requestNativeFullscreen();
				break;
			case MSG_TYPE_EXIT_NATIVE_FULLSCREEN:
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
			send(MSG_TYPE_IS_SMALL_SCREEN, small);
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

	/** Read the iframe's current full URL (null on cross-origin). */
	function readSameOriginIframeUrl(): string | null {
		try {
			return iframe.contentWindow?.location?.href ?? null;
		} catch {
			return null;
		}
	}

	/** Request hash from cross-origin iframe via postMessage (with timeout fallback). */
	function requestIframeHash(timeoutMs = 50): Promise<string> {
		return new Promise((resolve) => {
			let done = false;
			const unsub = onMessage<string>(MSG_TYPE_HASH_REPORT, (payload) => {
				if (!done) {
					done = true;
					unsub();
					resolve(typeof payload === "string" ? payload : "");
				}
			});
			setTimeout(() => {
				if (!done) {
					done = true;
					unsub();
					resolve("");
				}
			}, timeoutMs);
			send(MSG_TYPE_REQUEST_HASH);
		});
	}

	/**
	 * Capture the URL to reassign iframe.src to around a detach/dock DOM move.
	 * Same-origin preserves the FULL url (including subpath navigation);
	 * cross-origin falls back to hash-only preservation via postMessage protocol.
	 */
	async function captureIframeUrlForReload(): Promise<string> {
		const sameOrigin = readSameOriginIframeUrl();
		if (sameOrigin) return sameOrigin;
		const hash = await requestIframeHash();
		return widgetUrl.split("#")[0] + hash;
	}

	const resolvePlaceholderOpts = (): PlaceholderOptions =>
		typeof options.placeholder === "object" ? options.placeholder : {};

	// --- Axis dimension control (shared height/width logic) ---

	type Axis = "height" | "width";

	// Remembers CSS overrides per axis so resetToPreset can re-apply whichever
	// axis is being preserved. Populated by maximizeAxis / minimizeAxis AND by
	// user drag / resize interactions (so maximizing one axis doesn't blow away
	// the user's dragged position or resized width on the other axis).
	let heightOverrides: Record<string, string> | null = null;
	let widthOverrides: Record<string, string> | null = null;

	const AXIS_CONFIG = {
		height: {
			startProp: "top" as const,
			endProp: "bottom" as const,
			sizeProp: "height" as const,
			// dynamic unit so maximize tracks the visible viewport (mobile URL bar)
			viewportUnit: "dvh",
			viewportSize: () => globalThis.innerHeight,
			stateKey: "heightState" as const,
			msgType: MSG_TYPE_HEIGHT_STATE,
			getOverrides: () => heightOverrides,
			setOverrides: (v: Record<string, string> | null) => {
				heightOverrides = v;
			},
		},
		width: {
			startProp: "left" as const,
			endProp: "right" as const,
			sizeProp: "width" as const,
			viewportUnit: "dvw",
			viewportSize: () => globalThis.innerWidth,
			stateKey: "widthState" as const,
			msgType: MSG_TYPE_WIDTH_STATE,
			getOverrides: () => widthOverrides,
			setOverrides: (v: Record<string, string> | null) => {
				widthOverrides = v;
			},
		},
	};

	/**
	 * Snapshot the current container geometry into per-axis override records so
	 * a subsequent resetToPreset reapplies what the user interactively set.
	 * Only captures axes currently in "normal" state (maximized/minimized states
	 * are driven by their own recipes).
	 */
	function captureUserGeometry(): void {
		const s = state.get();
		const rect = container.getBoundingClientRect();
		if (s.heightState === "normal") {
			heightOverrides = {
				top: `${rect.top}px`,
				bottom: "auto",
				height: `${rect.height}px`,
			};
		}
		if (s.widthState === "normal") {
			widthOverrides = {
				left: `${rect.left}px`,
				right: "auto",
				width: `${rect.width}px`,
			};
		}
	}

	// draggable (float only)
	let draggableHandle: DraggableHandle | null = null;
	const resolveDragOpts = (): DraggableOptions => {
		const base: DraggableOptions = typeof options.draggable === "object"
			? options.draggable
			: {};

		const defaultResetSnap = {
			isActive: () => {
				const s = state.get();
				return (
					s.heightState === "maximized" &&
					s.widthState === "maximized"
				);
			},
			createGhost: () => {
				const presetStyle = {
					...STYLE_PRESETS[state.get().preset],
					...styleOverrides,
				};
				const rect = container.getBoundingClientRect();
				const ghost = document.createElement("div");
				Object.assign(
					ghost.style,
					GHOST_BASE,
					{
						zIndex: "10001",
						top: `${rect.top}px`,
						left: `${rect.left}px`,
						width: presetStyle.width ?? "380px",
						height: presetStyle.height ?? "520px",
					} satisfies Partial<CSSStyleDeclaration>,
				);
				return ghost;
			},
		};

		const defaultOnResetSnap = () => {
			const s = state.get();
			if (
				s.heightState === "maximized" &&
				s.widthState === "maximized"
			) {
				const presetStyle = {
					...STYLE_PRESETS[s.preset],
					...styleOverrides,
				};
				container.style.width = presetStyle.width ?? "";
				container.style.height = presetStyle.height ?? "";
				clearAxisOverrides();
				state.update((st) => ({
					...st,
					heightState: "normal",
					widthState: "normal",
				}));
				send(MSG_TYPE_HEIGHT_STATE, "normal");
				send(MSG_TYPE_WIDTH_STATE, "normal");
			}
		};

		const defaultOnEdgeSnap = (edge: SnapEdge) => {
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
		};

		const defaultOnDragEnd = () => {
			// Preserve drag position so subsequent resetToPreset calls can
			// restore it from the tracked overrides.
			captureUserGeometry();
			base.onDragEnd?.();
		};

		return {
			...base,
			edgeSnap: base.edgeSnap ?? true,
			resetSnap: base.resetSnap ?? defaultResetSnap,
			onResetSnap: base.onResetSnap ?? defaultOnResetSnap,
			onEdgeSnap: base.onEdgeSnap ?? defaultOnEdgeSnap,
			// captureUserGeometry ALWAYS runs first; user's onDragEnd (if any)
			// is invoked by defaultOnDragEnd after capture.
			onDragEnd: defaultOnDragEnd,
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
			draggableHandle = makeDraggable(
				container,
				iframe,
				resolveDragOpts(),
			);
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
				const wasNonNormal = s.heightState !== "normal" ||
					s.widthState !== "normal";
				if (wasNonNormal) {
					// user manually resized — explicit state is now "normal"
					state.update((st) => ({
						...st,
						heightState: "normal",
						widthState: "normal",
					}));
				}
				// Preserve the resized dimensions so resetToPreset can
				// restore them on subsequent axis actions.
				captureUserGeometry();
				if (wasNonNormal) {
					send(MSG_TYPE_HEIGHT_STATE, "normal");
					send(MSG_TYPE_WIDTH_STATE, "normal");
				}
				base.onResizeEnd?.();
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
			resizableHandle = makeResizable(
				container,
				iframe,
				resolveResizeOpts(),
			);
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

	/**
	 * Reset container CSS to preset baseline, re-applying the other axis's
	 * overrides (which may have been populated by drag/resize as well as by
	 * maximize/minimize, so user geometry survives single-axis actions).
	 */
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
		if (state.get().preset === "inline") {
			clog.warn(
				`maximize${
					axis === "height" ? "Height" : "Width"
				}() is a no-op when preset is "inline"`,
			);
			return;
		}

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

		// Save and apply overrides. `padding: 0` opts this container out of the
		// injected PWA safe-area padding (see PWA_SAFE_AREA_CSS): that rule is
		// sized for the full-screen overlay, but here we set an explicit border-box
		// size, so leaving the inset padding on would shrink the iframe content box
		// by the safe-area insets on top of the requested geometry. Inline padding
		// beats the (non-!important) stylesheet rule; cleared on resetToPreset.
		const overrides: Record<string, string> = {
			[cfg.startProp]: `${o}px`,
			[cfg.endProp]: "",
			[cfg.sizeProp]: `calc(100${cfg.viewportUnit} - ${o * 2}px)`,
			padding: "0",
		};
		cfg.setOverrides(overrides);
		Object.assign(container.style, overrides);

		state.update((s) => ({ ...s, [cfg.stateKey]: "maximized" }));
		setupInteractions();
		send(cfg.msgType, "maximized");
	}

	function minimizeAxis(axis: Axis, size?: number): void {
		if (state.get().destroyed) return;
		if (state.get().preset === "inline") {
			clog.warn(
				`minimize${
					axis === "height" ? "Height" : "Width"
				}() is a no-op when preset is "inline"`,
			);
			return;
		}

		const cfg = AXIS_CONFIG[axis];
		teardownInteractions();
		resetToPreset(undefined, axis);

		// Save and apply overrides. `padding: 0` opts out of the injected PWA
		// safe-area padding (see PWA_SAFE_AREA_CSS) — without it the safe-area
		// insets (often ~80px combined on a notched phone) would consume a small
		// minimized bar (default 48px) entirely, collapsing the iframe to zero.
		const overrides: Record<string, string> = {
			[cfg.sizeProp]: `${size ?? 48}px`,
			padding: "0",
		};
		cfg.setOverrides(overrides);
		Object.assign(container.style, overrides);

		state.update((s) => ({ ...s, [cfg.stateKey]: "minimized" }));
		setupInteractions();
		send(cfg.msgType, "minimized");
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

	/**
	 * Show the widget. On a small-screen viewport this also auto-switches to
	 * fullscreen; if a previous open() auto-fullscreened and the viewport is
	 * now large, revert to the initial preset (unless the user has since
	 * explicitly called setPreset/fullscreen/restore — see B9 in PR notes).
	 */
	function open(): void {
		show();
		const small = state.get().isSmallScreen;
		if (small) {
			if (state.get().preset !== "fullscreen") {
				_setPreset("fullscreen");
				smallScreenAutoFullscreen = true;
			}
		} else if (smallScreenAutoFullscreen) {
			smallScreenAutoFullscreen = false;
			_setPreset(initialPreset);
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
			// fallback derived from transition so it always outlasts the animation
			setTimeout(done, parseTransitionMs(anim.transition) + 50);
		} else {
			container.style.display = "none";
		}
	}

	function toggle(): void {
		if (state.get().visible) hide();
		else show();
	}

	/**
	 * Public setPreset: clears the small-screen auto-fullscreen flag because
	 * the user is making an explicit choice (subsequent open() on large screen
	 * must not silently revert it).
	 */
	function setPreset(preset: StylePreset): void {
		smallScreenAutoFullscreen = false;
		_setPreset(preset);
	}

	function _setPreset(preset: StylePreset): void {
		if (state.get().destroyed) return;
		if (!(preset in STYLE_PRESETS)) {
			clog.warn(`setPreset: unknown preset "${preset}"`);
			return;
		}
		// If detached and requesting inline, dock instead
		if (state.get().detached && preset === "inline") {
			dock();
			return;
		}
		teardownInteractions();
		clearAxisOverrides();
		resetToPreset(preset);
		if (preset === "fullscreen") warnIfPwaMissingViewportFit();
		state.update((s) => ({
			...s,
			preset,
			heightState: "normal",
			widthState: "normal",
		}));
		setupInteractions();
		send(MSG_TYPE_PRESET, preset);
		send(MSG_TYPE_HEIGHT_STATE, "normal");
		send(MSG_TYPE_WIDTH_STATE, "normal");
	}

	function fullscreen(): void {
		setPreset("fullscreen");
	}

	function restore(): void {
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
		if (state.get().preset === "inline") {
			clog.warn(`reset() is a no-op when preset is "inline"`);
			return;
		}
		clearAxisOverrides();
		setPreset(state.get().preset);
	}

	function requestNativeFullscreen(): Promise<void> {
		if (state.get().destroyed) return Promise.resolve();
		return iframe.requestFullscreen();
	}

	function exitNativeFullscreen(): Promise<void> {
		if (state.get().destroyed) return Promise.resolve();
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
		// Null internal refs to allow GC (especially originalParent which may
		// hold a sizable DOM subtree alive).
		originalParent = null;
		presetBeforeDetach = null;
		placeholderEl = null;
		triggerEl = null;
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

	// --- detach / dock serialization ---
	// Rapid or interleaved detach/dock calls run sequentially via this chain.
	// Each task is a no-op if current state already matches the target.
	let detachDockChain: Promise<unknown> = Promise.resolve();

	function serializeDetachDock<T>(task: () => Promise<T>): Promise<T> {
		const next = detachDockChain.then(task);
		detachDockChain = next.catch(() => {}); // swallow so chain survives errors
		return next;
	}

	async function _detach(): Promise<void> {
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

		// Hide during async hash capture to prevent visual blink
		// (resetToPreset below clears cssText, restoring visibility)
		container.style.visibility = "hidden";

		// Preserve iframe URL across the DOM move (reparenting reloads the iframe):
		// same-origin: full URL; cross-origin: hash-only via postMessage protocol
		iframe.src = await captureIframeUrlForReload();

		// Move the container to document.body
		document.body.appendChild(container);

		// Switch visual style: fullscreen on small screens, float otherwise
		const detachedPreset = state.get().isSmallScreen
			? ("fullscreen" as StylePreset)
			: ("float" as StylePreset);
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

		send(MSG_TYPE_DETACHED, true);
		send(MSG_TYPE_HEIGHT_STATE, "normal");
		send(MSG_TYPE_WIDTH_STATE, "normal");
	}

	async function _dock(): Promise<void> {
		const s = state.get();
		if (s.destroyed || !s.detached) return;
		if (!originalParent || !placeholderEl) return;

		teardownInteractions();

		// Hide during async URL capture to prevent visual blink
		// (resetToPreset below clears cssText, restoring visibility)
		container.style.visibility = "hidden";

		// Preserve iframe URL across the DOM move (moving reloads the iframe)
		iframe.src = await captureIframeUrlForReload();

		// Move container back to original parent; if the placeholder was removed
		// externally, fall back to appending to the original parent.
		if (placeholderEl.parentNode === originalParent) {
			originalParent.insertBefore(container, placeholderEl);
		} else {
			clog.warn(
				"dock(): placeholder was disconnected; appending container to original parent",
			);
			originalParent.appendChild(container);
		}
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

		send(MSG_TYPE_DETACHED, false);
		send(MSG_TYPE_HEIGHT_STATE, "normal");
		send(MSG_TYPE_WIDTH_STATE, "normal");

		// Clean up references
		originalParent = null;
		presetBeforeDetach = null;
	}

	function detach(): Promise<void> {
		return serializeDetachDock(_detach);
	}

	function dock(): Promise<void> {
		return serializeDetachDock(_dock);
	}

	function send<T = unknown>(type: string, payload?: T): void {
		if (state.get().destroyed) return;
		let target: string;
		if (lastIframeOrigin) {
			target = lastIframeOrigin;
		} else if (origins.length === 1) {
			target = origins[0];
		} else {
			target = origins[0] || "*";
			if (!sendOriginWarned) {
				sendOriginWarned = true;
				clog.warn(
					`send() called before any iframe message with multiple allowedOrigin entries; ` +
						`targeting "${target}". Subsequent sends will use the iframe's actual origin.`,
				);
			}
		}
		iframe.contentWindow?.postMessage(
			{ type: `${MSG_PREFIX}${type}`, payload } satisfies WidgetMessage,
			target,
		);
	}

	function onMessage<T = unknown>(
		type: string,
		handler: MessageHandler<T>,
	): Unsubscribe {
		const prefixedType = `${MSG_PREFIX}${type}`;
		return pubsub.subscribe(prefixedType, handler as MessageHandler);
	}

	return {
		open,
		show,
		hide,
		toggle,
		destroy,
		setPreset,
		fullscreen,
		restore,
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

/**
 * Static properties attached to `provideWidget` as a consumer convenience
 * (so `provideWidget.MSG_TYPE_READY` works alongside the named exports).
 * Single source — no manual type expression to keep in sync.
 */
const STATIC_PROPS = {
	MSG_PREFIX,
	MSG_TYPE_READY,
	MSG_TYPE_OPEN,
	MSG_TYPE_FULLSCREEN,
	MSG_TYPE_RESTORE,
	MSG_TYPE_MAXIMIZE_HEIGHT,
	MSG_TYPE_MINIMIZE_HEIGHT,
	MSG_TYPE_MAXIMIZE_WIDTH,
	MSG_TYPE_MINIMIZE_WIDTH,
	MSG_TYPE_RESET,
	MSG_TYPE_HIDE,
	MSG_TYPE_DESTROY,
	MSG_TYPE_SET_PRESET,
	MSG_TYPE_DETACH,
	MSG_TYPE_DOCK,
	MSG_TYPE_NATIVE_FULLSCREEN,
	MSG_TYPE_EXIT_NATIVE_FULLSCREEN,
	MSG_TYPE_HEIGHT_STATE,
	MSG_TYPE_WIDTH_STATE,
	MSG_TYPE_DETACHED,
	MSG_TYPE_IS_SMALL_SCREEN,
	MSG_TYPE_PRESET,
	MSG_TYPE_REQUEST_HASH,
	MSG_TYPE_HASH_REPORT,
} as const;

/** `provideWidget` with static message-type constants for consumer convenience */
export const provideWidget: typeof _provideWidget & typeof STATIC_PROPS = Object.assign(
	_provideWidget,
	STATIC_PROPS,
);
