import type { AnimatePreset, StylePreset } from "./types.ts";

type CSSProps = Partial<CSSStyleDeclaration>;

/** CSS transition and visibility states for a show/hide animation */
export interface AnimateConfig {
	transition: string;
	hidden: CSSProps;
	visible: CSSProps;
}

/** Built-in animation configurations keyed by {@linkcode AnimatePreset} name */
export const ANIMATE_PRESETS: Record<AnimatePreset, AnimateConfig> = {
	"fade-scale": {
		transition: "opacity 200ms ease, transform 200ms ease",
		hidden: { opacity: "0", transform: "scale(0.9)" },
		visible: { opacity: "1", transform: "scale(1)" },
	},
	"slide-up": {
		transition: "opacity 200ms ease, transform 200ms ease",
		hidden: { opacity: "0", transform: "translateY(20px)" },
		visible: { opacity: "1", transform: "translateY(0)" },
	},
};

const BASE_CONTAINER: CSSProps = {
	boxSizing: "border-box",
	overflow: "hidden",
};

/** Base CSS styles applied to every widget iframe (100% size, no border) */
export const IFRAME_BASE: CSSProps = {
	width: "100%",
	height: "100%",
	border: "none",
	display: "block",
};

const PRESET_FLOAT: CSSProps = {
	...BASE_CONTAINER,
	position: "fixed",
	bottom: "20px",
	right: "20px",
	width: "380px",
	height: "520px",
	zIndex: "10000",
	borderRadius: "12px",
	boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
};

const PRESET_FULLSCREEN: CSSProps = {
	...BASE_CONTAINER,
	position: "fixed",
	top: "0",
	left: "0",
	// dynamic viewport units (dvw/dvh) track the *current* visible viewport, so the
	// overlay self-corrects as the mobile URL bar collapses/expands. Static vw/vh map
	// to the bar-collapsed (large) viewport and would clip the bottom when the bar shows.
	width: "100dvw",
	height: "100dvh",
	zIndex: "10000",
	// NOTE: intentionally no inline `padding` here. The injected PWA stylesheet
	// (see PWA_SAFE_AREA_CSS) pads the container by the device safe-area insets
	// when the host runs as an installed PWA. Leaving padding off the inline
	// styles lets that rule apply without `!important` and keeps it overridable
	// via `styleOverrides`. The browser default padding is 0, so non-PWA
	// rendering is unchanged.
	backgroundColor: "rgba(0,0,0,0.5)",
};

const PRESET_INLINE: CSSProps = {
	...BASE_CONTAINER,
	position: "relative",
	width: "100%",
	height: "100%",
};

/** Default CSS styles for the floating trigger button (fixed, circular, blue) */
export const TRIGGER_BASE: CSSProps = {
	position: "fixed",
	bottom: "20px",
	right: "20px",
	width: "56px",
	height: "56px",
	borderRadius: "50%",
	border: "none",
	background: "#1a73e8",
	color: "white",
	cursor: "pointer",
	zIndex: "10001",
	boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	padding: "0",
};

/** CSS property objects for each positioning mode keyed by {@linkcode StylePreset} name */
export const STYLE_PRESETS: Record<StylePreset, CSSProps> = {
	float: PRESET_FLOAT,
	fullscreen: PRESET_FULLSCREEN,
	inline: PRESET_INLINE,
};

/** Default CSS styles for the detach placeholder element */
export const PLACEHOLDER_BASE: CSSProps = {
	boxSizing: "border-box",
	width: "100%",
	height: "100%",
	border: "2px dashed rgba(128, 128, 128, 0.4)",
	borderRadius: "8px",
	background: "rgba(128, 128, 128, 0.06)",
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	color: "rgba(128, 128, 128, 0.6)",
	fontSize: "0.85rem",
	fontFamily: "system-ui, sans-serif",
};

/**
 * Shared base CSS for edge-snap / reset-snap ghost preview elements.
 * Consumers supplying their own `resetSnap.createGhost` can spread this
 * for visual consistency.
 */
export const GHOST_BASE: CSSProps = {
	position: "fixed",
	boxSizing: "border-box",
	border: "2px dashed rgba(128, 128, 128, 0.5)",
	borderRadius: "8px",
	background: "rgba(128, 128, 128, 0.1)",
	pointerEvents: "none",
	transition: "opacity 150ms ease",
	opacity: "0",
};

/**
 * Stable class added to every widget container. Acts as the selector hook for
 * the injected PWA safe-area stylesheet ({@linkcode PWA_SAFE_AREA_CSS}).
 */
export const WIDGET_CONTAINER_CLASS = "wp-widget-container";

/**
 * `data-*` attribute (set on the container by {@linkcode applyPreset}) that
 * reflects the active {@linkcode StylePreset}. Lets the injected stylesheet
 * target the fullscreen overlay specifically.
 */
export const WIDGET_PRESET_ATTR = "data-wp-preset";

/** `id` of the singleton `<style>` element injected by {@linkcode ensureGlobalStyles}. */
export const PWA_STYLE_ELEMENT_ID = "wp-pwa-safe-area-styles";

/**
 * CSS injected once into `<head>` to make the `fullscreen` preset usable inside
 * an installed PWA. This is the ONE deliberate exception to the library's
 * otherwise all-inline styling — `@media` rules cannot live in inline styles.
 *
 * When the host page runs in `standalone`/`fullscreen` display mode there is no
 * browser chrome, so a `100dvw × 100dvh` overlay extends under the device status
 * bar / notch / home indicator and its top/bottom content becomes unreachable.
 * This rule pads the fullscreen container by the safe-area insets so the iframe
 * sits within the safe area, while the semi-transparent backdrop still covers
 * the whole screen (the padding band shows the backdrop, not the host page).
 *
 * - Gated to PWA display modes — a normal browser tab keeps its chrome and needs
 *   no inset, so the rule never applies there. The `standalone` arm is
 *   iOS-critical: iOS PWAs only ever report `standalone`, never `fullscreen` —
 *   do not remove it.
 * - REQUIRES the HOST page's viewport meta to include `viewport-fit=cover`,
 *   otherwise `env(safe-area-inset-*)` resolves to `0` (the `, 0px` fallback)
 *   and this is a silent no-op. The library cannot set the host meta; see
 *   `warnIfPwaMissingViewportFit` in widget-provider.ts for the dev warning.
 * - No `!important`: this works *only* because no inline `padding` is written on
 *   the fullscreen container — inline styles always beat a non-!important author
 *   rule regardless of selector specificity. INVARIANT: never set inline padding
 *   on the baseline fullscreen container, or this rule is silently defeated.
 *   (maximize/minimize intentionally set inline `padding: 0` to opt out.) The
 *   escape hatch for consumers is the same: a `styleOverrides.padding` shorthand
 *   overrides all four insets at once; per-side longhands override one side.
 */
export const PWA_SAFE_AREA_CSS = `
@media (display-mode: standalone), (display-mode: fullscreen) {
	.${WIDGET_CONTAINER_CLASS}[${WIDGET_PRESET_ATTR}="fullscreen"] {
		padding-top: env(safe-area-inset-top, 0px);
		padding-right: env(safe-area-inset-right, 0px);
		padding-bottom: env(safe-area-inset-bottom, 0px);
		padding-left: env(safe-area-inset-left, 0px);
	}
}`;

/**
 * Inject the PWA safe-area stylesheet ({@linkcode PWA_SAFE_AREA_CSS}) exactly
 * once. Idempotent (guards on the element `id`) and a no-op when there is no
 * document (SSR / non-DOM contexts).
 */
export function ensureGlobalStyles(): void {
	if (typeof document === "undefined") return;
	if (document.getElementById(PWA_STYLE_ELEMENT_ID)) return;
	const style = document.createElement("style");
	style.id = PWA_STYLE_ELEMENT_ID;
	style.textContent = PWA_SAFE_AREA_CSS;
	(document.head ?? document.documentElement)?.appendChild(style);
}

/**
 * Apply a style preset (and optional overrides) to the widget container element.
 *
 * Also tags the container with {@linkcode WIDGET_CONTAINER_CLASS} and a
 * `data-wp-preset` attribute and ensures the PWA safe-area stylesheet is present
 * (see {@linkcode PWA_SAFE_AREA_CSS}).
 *
 * @throws {Error} If the preset name is not recognized.
 */
export function applyPreset(
	container: HTMLElement,
	preset: StylePreset,
	overrides: Partial<CSSStyleDeclaration>,
): void {
	const base = STYLE_PRESETS[preset];
	if (!base) {
		throw new Error(`Unknown style preset: "${preset}"`);
	}
	ensureGlobalStyles();
	container.classList.add(WIDGET_CONTAINER_CLASS);
	container.setAttribute(WIDGET_PRESET_ATTR, preset);
	Object.assign(container.style, base, overrides);
}

/** Apply the base CSS styles ({@linkcode IFRAME_BASE}) to a widget iframe element. */
export function applyIframeBaseStyles(iframe: HTMLIFrameElement): void {
	Object.assign(iframe.style, IFRAME_BASE);
}
