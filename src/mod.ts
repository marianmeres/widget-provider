export {
	isOriginAllowed,
	provideWidget,
	resolveAllowedOrigins,
	resolveAnimateConfig,
} from "./widget-provider.ts";

export type {
	AnimatePreset,
	HeightState,
	MessageHandler,
	StyleOverrides,
	StylePreset,
	Unsubscribe,
	WidgetMessage,
	WidgetProviderApi,
	WidgetProviderOptions,
	WidgetState,
} from "./types.ts";

export { MSG_PREFIX } from "./types.ts";

export {
	ANIMATE_PRESETS,
	type AnimateConfig,
	IFRAME_BASE,
	STYLE_PRESETS,
} from "./style-presets.ts";
