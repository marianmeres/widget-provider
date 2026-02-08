import type { AnimatePreset, StylePreset } from "./types.ts";

type CSSProps = Partial<CSSStyleDeclaration>;

export interface AnimateConfig {
	transition: string;
	hidden: CSSProps;
	visible: CSSProps;
}

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
	width: "100vw",
	height: "100vh",
	zIndex: "10000",
	padding: "2rem",
	backgroundColor: "rgba(0,0,0,0.5)",
};

const PRESET_INLINE: CSSProps = {
	...BASE_CONTAINER,
	position: "relative",
	width: "100%",
	height: "100%",
};

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

export const STYLE_PRESETS: Record<StylePreset, CSSProps> = {
	float: PRESET_FLOAT,
	fullscreen: PRESET_FULLSCREEN,
	inline: PRESET_INLINE,
};

export function applyPreset(
	container: HTMLElement,
	preset: StylePreset,
	overrides: Partial<CSSStyleDeclaration>,
): void {
	const base = STYLE_PRESETS[preset];
	if (!base) {
		throw new Error(`Unknown style preset: "${preset}"`);
	}
	Object.assign(container.style, base, overrides);
}

export function applyIframeBaseStyles(iframe: HTMLIFrameElement): void {
	Object.assign(iframe.style, IFRAME_BASE);
}
