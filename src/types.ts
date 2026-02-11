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

/** Configuration for drag-and-drop behavior in float mode */
export interface DraggableOptions {
	/** Height of the drag handle bar in pixels. Default: 24 */
	handleHeight?: number;
	/** CSS overrides for the drag handle element */
	handleStyle?: Partial<CSSStyleDeclaration>;
	/** Minimum gap (px) between the widget edge and the viewport edge. Default: 20 */
	boundaryPadding?: number;
}

/** Control handle returned by makeDraggable, used for cleanup */
export interface DraggableHandle {
	/** The drag handle DOM element */
	readonly handleEl: HTMLElement;
	/** Remove all event listeners and the handle element */
	destroy(): void;
	/** Reset position to the preset default (clears top/left, restores bottom/right) */
	resetPosition(): void;
}

/** Configuration for the placeholder left behind when a widget is detached */
export interface PlaceholderOptions {
	/** CSS overrides for the placeholder div */
	style?: Partial<CSSStyleDeclaration>;
	/** HTML content inside the placeholder (e.g., informational text) */
	content?: string;
}

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

	/**
	 * Enable drag-and-drop for the float preset.
	 * Only effective when stylePreset is "float".
	 * - `true` → enable with defaults
	 * - object → enable with custom options
	 */
	draggable?: boolean | DraggableOptions;

	/**
	 * Configuration for the placeholder element left behind when detach() is called.
	 * Only relevant when stylePreset is "inline" and parentContainer is set.
	 * - `true` → enable with defaults
	 * - object → enable with custom options
	 */
	placeholder?: boolean | PlaceholderOptions;
}

/** Reactive state tracked in the store */
export interface WidgetState {
	visible: boolean;
	ready: boolean;
	destroyed: boolean;
	preset: StylePreset;
	heightState: HeightState;
	/** Whether the widget has been detached from its parentContainer */
	detached: boolean;
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
	/**
	 * Detach an inline widget from its parentContainer and float it on document.body.
	 * Moves the DOM node (preserving iframe state). Leaves a placeholder in the
	 * original position. Only works when preset is "inline" and a parentContainer
	 * exists. No-op if already detached or destroyed.
	 */
	detach(): void;
	/**
	 * Dock a previously detached widget back into its original parentContainer,
	 * replacing the placeholder. Restores the inline preset. No-op if not
	 * currently detached or if destroyed.
	 */
	dock(): void;
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
	/** Direct reference to the placeholder element, or null if not detached */
	readonly placeholder: HTMLElement | null;
}
