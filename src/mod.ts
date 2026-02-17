/**
 * @module widget-provider
 *
 * Iframe-based widget provider with positioning presets, bidirectional
 * postMessage communication, show/hide animations, drag-and-drop,
 * resize, detach/dock workflow, and reactive state.
 */

export {
	isOriginAllowed,
	provideWidget,
	resolveAllowedOrigins,
	resolveAnimateConfig,
} from "./widget-provider.ts";

export { makeDraggable, resolveEdge } from "./draggable.ts";
export { makeResizable } from "./resizable.ts";

export type {
	AnimatePreset,
	DimensionState,
	DraggableHandle,
	DraggableOptions,
	EdgeSnapOptions,
	HeightState,
	MessageHandler,
	PlaceholderOptions,
	ResizableHandle,
	ResizableOptions,
	SnapEdge,
	StyleOverrides,
	StylePreset,
	Unsubscribe,
	WidgetMessage,
	WidgetProviderApi,
	WidgetProviderOptions,
	WidgetState,
	WidthState,
} from "./types.ts";

export {
	MSG_PREFIX,
	MSG_TYPE_DESTROY,
	MSG_TYPE_DETACH,
	MSG_TYPE_DETACHED,
	MSG_TYPE_DOCK,
	MSG_TYPE_EXIT_NATIVE_FULLSCREEN,
	MSG_TYPE_HASH_REPORT,
	MSG_TYPE_HEIGHT_STATE,
	MSG_TYPE_HIDE,
	MSG_TYPE_IS_SMALL_SCREEN,
	MSG_TYPE_FULLSCREEN,
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
} from "./types.ts";

export {
	ANIMATE_PRESETS,
	type AnimateConfig,
	IFRAME_BASE,
	PLACEHOLDER_BASE,
	STYLE_PRESETS,
} from "./style-presets.ts";
