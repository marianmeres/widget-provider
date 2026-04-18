/**
 * @module widget-provider
 *
 * Iframe-based widget provider with positioning presets, bidirectional
 * postMessage communication, show/hide animations, drag-and-drop,
 * resize, detach/dock workflow, and reactive state.
 */

export {
	isOriginAllowed,
	parseTransitionMs,
	provideWidget,
	resolveAllowedOrigins,
	resolveAnimateConfig,
} from "./widget-provider.ts";

export { makeDraggable, resolveEdge } from "./draggable.ts";
export { makeResizable } from "./resizable.ts";

// Re-export all types and MSG_TYPE_* constants in one go (single source of truth).
export * from "./types.ts";

export {
	ANIMATE_PRESETS,
	type AnimateConfig,
	GHOST_BASE,
	IFRAME_BASE,
	PLACEHOLDER_BASE,
	STYLE_PRESETS,
} from "./style-presets.ts";
