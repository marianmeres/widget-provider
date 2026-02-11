/** Namespace prefix for all widget-provider postMessage types */
export const MSG_PREFIX = "@@__widget_provider__@@";

/** The structured envelope for all host <-> iframe messages */
export interface WidgetMessage<T = unknown> {
	type: string;
	payload?: T;
}

/** Built-in positioning modes for the widget container */
export type StylePreset = "float" | "fullscreen" | "inline";

/** Height states for the widget container */
export type HeightState = "normal" | "minimized" | "maximized";

/** Named animation presets for show/hide transitions */
export type AnimatePreset = "fade-scale" | "slide-up";

/** CSS overrides applied on top of a style preset */
export type StyleOverrides = Partial<CSSStyleDeclaration>;

/** Callback for handling a typed message payload from the widget iframe */
export type MessageHandler<T = unknown> = (payload: T) => void;

/** Function that removes a previously registered listener or subscription */
export type Unsubscribe = () => void;

/** Configuration options for {@linkcode provideWidget} */
export interface WidgetProviderOptions {
	/** The URL of the SPA to embed */
	widgetUrl: string;

	/** DOM element to append the widget into. Defaults to document.body */
	parentContainer?: HTMLElement;

	/**
	 * Positioning mode. Defaults to "inline".
	 * - "float": fixed bottom-right chat-widget style
	 * - "fullscreen": covers viewport with optional backdrop
	 * - "inline": flows within parent container
	 */
	stylePreset?: StylePreset;

	/** CSS overrides applied to the container wrapper div */
	styleOverrides?: StyleOverrides;

	/**
	 * Allowed origin(s) for postMessage validation.
	 * If omitted, derived from widgetUrl.
	 * Use "*" to allow any origin (not recommended for production).
	 */
	allowedOrigin?: string | string[];

	/** Whether the widget starts visible. Defaults to true */
	visible?: boolean;

	/** Iframe sandbox attribute. Defaults to "allow-scripts allow-same-origin" */
	sandbox?: string;

	/** Additional iframe attributes (e.g. allow, referrerpolicy) */
	iframeAttrs?: Record<string, string>;

	/**
	 * Opt-in show/hide animation.
	 * - `true` → default "fade-scale" preset
	 * - string → named preset ("fade-scale" | "slide-up")
	 * - object → named preset + CSS transition override
	 */
	animate?:
		| boolean
		| AnimatePreset
		| {
			preset?: AnimatePreset;
			/** CSS transition shorthand override */
			transition?: string;
		};

	/**
	 * Built-in floating trigger button.
	 * If `true`, uses default styles/icon. If object, allows customization.
	 * Automatically shown when widget is hidden, hidden when widget is visible.
	 */
	trigger?:
		| boolean
		| {
			/** HTML content for the button (e.g. SVG icon). Defaults to a chat bubble SVG. */
			content?: string;
			/** CSS overrides for the trigger button */
			style?: Partial<CSSStyleDeclaration>;
		};
}

/** Reactive state tracked in the store */
export interface WidgetState {
	visible: boolean;
	ready: boolean;
	destroyed: boolean;
	preset: StylePreset;
	heightState: HeightState;
}

/** Control API returned by {@linkcode provideWidget} */
export interface WidgetProviderApi {
	/** Show the widget container */
	show(): void;
	/** Hide the widget container */
	hide(): void;
	/** Toggle visibility */
	toggle(): void;
	/** Remove iframe, event listeners, container from DOM. Irreversible. */
	destroy(): void;
	/** Switch to a specific style preset at runtime */
	setPreset(preset: StylePreset): void;
	/** Shortcut: switch to fullscreen preset */
	maximize(): void;
	/** Shortcut: switch back to the initial preset */
	minimize(): void;
	/** Maximize only the widget height, keeping width and horizontal position */
	maximizeHeight(offset?: number): void;
	/** Collapse the widget to a minimal height (default 48px) */
	minimizeHeight(height?: number): void;
	/** Reset the widget height back to the current preset's default */
	resetHeight(): void;
	/** Request native browser fullscreen for the iframe */
	requestNativeFullscreen(): Promise<void>;
	/** Exit native browser fullscreen */
	exitNativeFullscreen(): Promise<void>;
	/** Send a typed message to the iframe */
	send<T = unknown>(type: string, payload?: T): void;
	/** Listen for a typed message from the iframe. Returns unsubscribe. */
	onMessage<T = unknown>(
		type: string,
		handler: MessageHandler<T>,
	): Unsubscribe;
	/** Svelte-compatible store subscribe for reactive state */
	subscribe(cb: (state: WidgetState) => void): Unsubscribe;
	/** Direct getter for current state */
	get(): WidgetState;
	/** Direct reference to the iframe element */
	readonly iframe: HTMLIFrameElement;
	/** Direct reference to the container wrapper div */
	readonly container: HTMLElement;
	/** Direct reference to the trigger button element, or null if not configured */
	readonly trigger: HTMLElement | null;
}
