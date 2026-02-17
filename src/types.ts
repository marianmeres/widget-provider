/** Namespace prefix for all widget-provider postMessage types */
export const MSG_PREFIX = "@@__widget_provider__@@";

// --- Built-in message type constants ---

/** Iframe signals it is ready */
export const MSG_TYPE_READY = "__ready";
/** Request to open/show widget */
export const MSG_TYPE_OPEN = "__open";
/** Switch to fullscreen preset */
export const MSG_TYPE_FULLSCREEN = "__fullscreen";
/** Restore the initial preset */
export const MSG_TYPE_RESTORE = "__restore";
/** Maximize height axis only */
export const MSG_TYPE_MAXIMIZE_HEIGHT = "__maximizeHeight";
/** Minimize height axis only */
export const MSG_TYPE_MINIMIZE_HEIGHT = "__minimizeHeight";
/** Maximize width axis only */
export const MSG_TYPE_MAXIMIZE_WIDTH = "__maximizeWidth";
/** Minimize width axis only */
export const MSG_TYPE_MINIMIZE_WIDTH = "__minimizeWidth";
/** Reset both dimensions to preset defaults */
export const MSG_TYPE_RESET = "__reset";
/** Hide the widget */
export const MSG_TYPE_HIDE = "__hide";
/** Destroy the widget */
export const MSG_TYPE_DESTROY = "__destroy";
/** Switch style preset (payload: preset name) */
export const MSG_TYPE_SET_PRESET = "__setPreset";
/** Detach from parent container */
export const MSG_TYPE_DETACH = "__detach";
/** Dock back to parent container */
export const MSG_TYPE_DOCK = "__dock";
/** Request native browser fullscreen */
export const MSG_TYPE_NATIVE_FULLSCREEN = "__nativeFullscreen";
/** Exit native browser fullscreen */
export const MSG_TYPE_EXIT_NATIVE_FULLSCREEN = "__exitNativeFullscreen";
/** Current height state (payload: DimensionState) */
export const MSG_TYPE_HEIGHT_STATE = "__heightState";
/** Current width state (payload: DimensionState) */
export const MSG_TYPE_WIDTH_STATE = "__widthState";
/** Detach status (payload: boolean) */
export const MSG_TYPE_DETACHED = "__detached";
/** Small screen detection (payload: boolean) */
export const MSG_TYPE_IS_SMALL_SCREEN = "__isSmallScreen";
/** Current style preset (payload: StylePreset) */
export const MSG_TYPE_PRESET = "__preset";
/** Request iframe URL hash (cross-origin protocol) */
export const MSG_TYPE_REQUEST_HASH = "__requestHash";
/** Report iframe URL hash (cross-origin protocol) */
export const MSG_TYPE_HASH_REPORT = "__hashReport";

/** The structured envelope for all host <-> iframe messages */
export interface WidgetMessage<T = unknown> {
	type: string;
	payload?: T;
}

/** Built-in positioning modes for the widget container */
export type StylePreset = "float" | "fullscreen" | "inline";

/** Dimension states for the widget container (used by both height and width) */
export type DimensionState = "normal" | "minimized" | "maximized";

/** Height states for the widget container */
export type HeightState = DimensionState;

/** Width states for the widget container */
export type WidthState = DimensionState;

/** Named animation presets for show/hide transitions */
export type AnimatePreset = "fade-scale" | "slide-up";

/** CSS overrides applied on top of a style preset */
export type StyleOverrides = Partial<CSSStyleDeclaration>;

/** Callback for handling a typed message payload from the widget iframe */
export type MessageHandler<T = unknown> = (payload: T) => void;

/** Function that removes a previously registered listener or subscription */
export type Unsubscribe = () => void;

/** Which viewport edge the widget was snapped to */
export type SnapEdge =
	| "left"
	| "right"
	| "top"
	| "bottom"
	| "top-left"
	| "top-right"
	| "bottom-left"
	| "bottom-right";

/** Configuration for edge-snap behavior (drag-to-edge maximize) */
export interface EdgeSnapOptions {
	/** Dwell time (ms) at edge before ghost appears. Default: 500 */
	dwellMs?: number;
	/** CSS overrides for the ghost preview element */
	ghostStyle?: Partial<CSSStyleDeclaration>;
}

/** Configuration for drag-and-drop behavior in float mode */
export interface DraggableOptions {
	/** Height of the drag handle bar in pixels. Default: 24 */
	handleHeight?: number;
	/** CSS overrides for the drag handle element */
	handleStyle?: Partial<CSSStyleDeclaration>;
	/** Minimum gap (px) between the widget edge and the viewport edge. Default: 20 */
	boundaryPadding?: number;
	/**
	 * Enable edge-snap behavior (ghost preview + maximize perpendicular axis on release).
	 * - `true` → enable with defaults
	 * - object → enable with custom options
	 * - `false` → explicitly disable
	 */
	edgeSnap?: boolean | EdgeSnapOptions;
	/**
	 * Called when the pointer is released while the edge-snap ghost is showing.
	 * Receives the detected edge. The consumer translates this to the appropriate
	 * axis maximize action.
	 */
	onEdgeSnap?: (edge: SnapEdge) => void;
	/**
	 * Reset-snap: opposite of edge-snap. When dragging away from edges,
	 * shows a ghost preview after a dwell period and resets on release.
	 * Provide `isActive` to control when reset-snap is available and
	 * `createGhost` to build the preview element.
	 */
	resetSnap?: {
		/** Whether reset-snap should activate (checked each pointer move) */
		isActive: () => boolean;
		/** Create the ghost preview element for the reset target */
		createGhost: () => HTMLElement;
	};
	/** Called when pointer is released while the reset-snap ghost is showing */
	onResetSnap?: () => void;
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

/** Configuration for resize behavior in float mode */
export interface ResizableOptions {
	/** Size of the resize handle area in pixels. Default: 20 */
	handleSize?: number;
	/** CSS overrides for the resize handle element */
	handleStyle?: Partial<CSSStyleDeclaration>;
	/** Minimum gap (px) between the widget edge and the viewport edge. Default: 20 */
	boundaryPadding?: number;
	/** Minimum width in pixels. Default: 200 */
	minWidth?: number;
	/** Minimum height in pixels. Default: 150 */
	minHeight?: number;
	/** Maximum width in pixels. Default: viewport width minus padding */
	maxWidth?: number;
	/** Maximum height in pixels. Default: viewport height minus padding */
	maxHeight?: number;
	/** Called when a manual resize interaction ends (pointer released after resizing) */
	onResizeEnd?: () => void;
}

/** Control handle returned by makeResizable, used for cleanup */
export interface ResizableHandle {
	/** The resize handle DOM element */
	readonly handleEl: HTMLElement;
	/** Remove all event listeners and the handle element */
	destroy(): void;
	/** Reset size to the preset default (clears inline width/height) */
	resetSize(): void;
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
	 * Enable free-resize for the float preset.
	 * Only effective when stylePreset is "float".
	 * - `true` → enable with defaults
	 * - object → enable with custom options
	 */
	resizable?: boolean | ResizableOptions;

	/**
	 * Configuration for the placeholder element left behind when detach() is called.
	 * Only relevant when stylePreset is "inline" and parentContainer is set.
	 * - `true` → enable with defaults
	 * - object → enable with custom options
	 */
	placeholder?: boolean | PlaceholderOptions;

	/**
	 * Viewport width threshold (px) below which `open()` switches to fullscreen.
	 * Default: 640. Set to 0 to disable.
	 */
	smallScreenBreakpoint?: number;
}

/** Reactive state tracked in the store */
export interface WidgetState {
	visible: boolean;
	ready: boolean;
	destroyed: boolean;
	preset: StylePreset;
	heightState: HeightState;
	widthState: WidthState;
	/** Whether the widget has been detached from its parentContainer */
	detached: boolean;
	/** Whether the viewport width is below the configured smallScreenBreakpoint */
	isSmallScreen: boolean;
}

/** Control API returned by {@linkcode provideWidget} */
export interface WidgetProviderApi {
	/** Show the widget, switching to fullscreen if viewport is below smallScreenBreakpoint */
	open(): void;
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
	/** Switch to fullscreen preset */
	fullscreen(): void;
	/** Restore the initial preset (reverse of fullscreen) */
	restore(): void;
	/** Maximize only the widget height, keeping width and horizontal position */
	maximizeHeight(offset?: number): void;
	/** Collapse the widget to a minimal height (default 48px) */
	minimizeHeight(height?: number): void;
	/** Maximize only the widget width, keeping height and vertical position */
	maximizeWidth(offset?: number): void;
	/** Collapse the widget to a minimal width (default 48px) */
	minimizeWidth(width?: number): void;
	/** Reset both height and width back to the current preset's defaults */
	reset(): void;
	/** Request native browser fullscreen for the iframe */
	requestNativeFullscreen(): Promise<void>;
	/** Exit native browser fullscreen */
	exitNativeFullscreen(): Promise<void>;
	/**
	 * Detach an inline widget from its parentContainer and float it on document.body.
	 * Leaves a placeholder in the original position. Preserves the iframe's current
	 * URL hash across the DOM move (same-origin directly, cross-origin via
	 * `requestHash`/`hashReport` postMessage protocol). Only works when preset is
	 * "inline" and a parentContainer exists. No-op if already detached or destroyed.
	 */
	detach(): Promise<void>;
	/**
	 * Dock a previously detached widget back into its original parentContainer,
	 * replacing the placeholder. Restores the inline preset. Preserves the iframe's
	 * current URL hash across the DOM move. No-op if not currently detached or
	 * if destroyed.
	 */
	dock(): Promise<void>;
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
