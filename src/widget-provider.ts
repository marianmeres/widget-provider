import { createStore } from "@marianmeres/store";
import {
	ANIMATE_PRESETS,
	type AnimateConfig,
	applyIframeBaseStyles,
	applyPreset,
	STYLE_PRESETS,
	TRIGGER_BASE,
} from "./style-presets.ts";
import {
	MSG_PREFIX,
	type MessageHandler,
	type StylePreset,
	type Unsubscribe,
	type WidgetMessage,
	type WidgetProviderApi,
	type WidgetProviderOptions,
	type WidgetState,
} from "./types.ts";

const DEFAULT_TRIGGER_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;

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

export function isOriginAllowed(
	origin: string,
	allowed: string[],
): boolean {
	if (allowed.includes("*")) return true;
	return allowed.includes(origin);
}

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
	} = options;

	if (!widgetUrl) {
		throw new Error("widgetUrl is required");
	}

	const origins = resolveAllowedOrigins(allowedOrigin, widgetUrl);
	const initialPreset = stylePreset;
	const anim = resolveAnimateConfig(options.animate);

	// reactive state
	const state = createStore<WidgetState>({
		visible,
		ready: false,
		destroyed: false,
		preset: stylePreset,
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
	const messageHandlers = new Map<string, Set<MessageHandler>>();

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
				break;
			case "maximize":
				maximize();
				break;
			case "minimize":
				minimize();
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
			case "nativeFullscreen":
				requestNativeFullscreen();
				break;
			case "exitNativeFullscreen":
				exitNativeFullscreen();
				break;
		}

		const handlers = messageHandlers.get(data.type);
		if (handlers) {
			for (const h of handlers) {
				try {
					h(data.payload);
				} catch (e) {
					console.warn(
						"[widget-provider] message handler error:",
						e,
					);
				}
			}
		}
	}

	globalThis.addEventListener("message", handleMessage);

	// append to DOM
	const appendTarget = parentContainer || document.body;
	appendTarget.appendChild(container);

	// trigger button
	const triggerOpts = options.trigger;
	let triggerEl: HTMLElement | null = null;
	if (triggerOpts) {
		triggerEl = document.createElement("button");
		Object.assign(triggerEl.style, TRIGGER_BASE);
		if (typeof triggerOpts === "object" && triggerOpts.style) {
			Object.assign(triggerEl.style, triggerOpts.style);
		}
		const content =
			typeof triggerOpts === "object" && triggerOpts.content
				? triggerOpts.content
				: DEFAULT_TRIGGER_ICON;
		triggerEl.innerHTML = content;
		if (visible) {
			triggerEl.style.display = "none";
		}
		triggerEl.addEventListener("click", () => show());
		appendTarget.appendChild(triggerEl);
	}

	// API
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
		state.update((s) => ({ ...s, preset }));
	}

	function maximize(): void {
		setPreset("fullscreen");
	}

	function minimize(): void {
		setPreset(initialPreset);
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
		globalThis.removeEventListener("message", handleMessage);
		messageHandlers.clear();
		iframe.src = "about:blank";
		container.remove();
		triggerEl?.remove();
		state.update((s) => ({
			visible: false,
			ready: false,
			destroyed: true,
			preset: s.preset,
		}));
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
		if (!messageHandlers.has(prefixedType)) {
			messageHandlers.set(prefixedType, new Set());
		}
		messageHandlers.get(prefixedType)!.add(handler as MessageHandler);
		return () => {
			messageHandlers.get(prefixedType)?.delete(
				handler as MessageHandler,
			);
		};
	}

	return {
		show,
		hide,
		toggle,
		destroy,
		setPreset,
		maximize,
		minimize,
		requestNativeFullscreen,
		exitNativeFullscreen,
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
	};
}
