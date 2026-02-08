export {
	provideWidget,
	resolveAllowedOrigins,
	isOriginAllowed,
	resolveAnimateConfig,
} from "./widget-provider.ts";

export type {
	WidgetProviderOptions,
	WidgetProviderApi,
	WidgetState,
	WidgetMessage,
	StylePreset,
	StyleOverrides,
	AnimatePreset,
	MessageHandler,
	Unsubscribe,
} from "./types.ts";

export { MSG_PREFIX } from "./types.ts";

export {
	STYLE_PRESETS,
	IFRAME_BASE,
	ANIMATE_PRESETS,
	type AnimateConfig,
} from "./style-presets.ts";
