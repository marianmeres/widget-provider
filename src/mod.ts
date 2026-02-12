export {
	isOriginAllowed,
	provideWidget,
	resolveAllowedOrigins,
	resolveAnimateConfig,
} from "./widget-provider.ts";

export { makeDraggable } from "./draggable.ts";
export { makeResizable } from "./resizable.ts";

export type {
	AnimatePreset,
	DimensionState,
	DraggableHandle,
	DraggableOptions,
	HeightState,
	MessageHandler,
	PlaceholderOptions,
	ResizableHandle,
	ResizableOptions,
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
