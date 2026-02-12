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

export { MSG_PREFIX } from "./types.ts";

export {
	ANIMATE_PRESETS,
	type AnimateConfig,
	IFRAME_BASE,
	PLACEHOLDER_BASE,
	STYLE_PRESETS,
} from "./style-presets.ts";
