import { assertEquals, assertThrows } from "@std/assert";
import {
	isOriginAllowed,
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
	MSG_TYPE_MAXIMIZE,
	MSG_TYPE_MAXIMIZE_HEIGHT,
	MSG_TYPE_MAXIMIZE_WIDTH,
	MSG_TYPE_MINIMIZE_HEIGHT,
	MSG_TYPE_MINIMIZE_WIDTH,
	MSG_TYPE_NATIVE_FULLSCREEN,
	MSG_TYPE_OPEN,
	MSG_TYPE_READY,
	MSG_TYPE_REQUEST_HASH,
	MSG_TYPE_RESET,
	MSG_TYPE_RESTORE,
	MSG_TYPE_SET_PRESET,
	MSG_TYPE_WIDTH_STATE,
	provideWidget,
	resolveAllowedOrigins,
	resolveEdge,
	STYLE_PRESETS,
} from "../src/mod.ts";

// --- resolveAllowedOrigins ---

Deno.test("resolveAllowedOrigins: derives origin from URL", () => {
	assertEquals(resolveAllowedOrigins(undefined, "https://example.com/app"), [
		"https://example.com",
	]);
});

Deno.test("resolveAllowedOrigins: derives origin with port", () => {
	assertEquals(
		resolveAllowedOrigins(undefined, "http://localhost:3000/widget"),
		["http://localhost:3000"],
	);
});

Deno.test("resolveAllowedOrigins: explicit string", () => {
	assertEquals(
		resolveAllowedOrigins("https://foo.com", "https://bar.com/app"),
		["https://foo.com"],
	);
});

Deno.test("resolveAllowedOrigins: explicit array", () => {
	assertEquals(
		resolveAllowedOrigins(
			["https://a.com", "https://b.com"],
			"https://c.com/app",
		),
		["https://a.com", "https://b.com"],
	);
});

Deno.test("resolveAllowedOrigins: invalid URL falls back to wildcard", () => {
	assertEquals(resolveAllowedOrigins(undefined, "not-a-url"), ["*"]);
});

// --- isOriginAllowed ---

Deno.test("isOriginAllowed: wildcard allows anything", () => {
	assertEquals(isOriginAllowed("https://evil.com", ["*"]), true);
});

Deno.test("isOriginAllowed: exact match", () => {
	assertEquals(isOriginAllowed("https://foo.com", ["https://foo.com"]), true);
});

Deno.test("isOriginAllowed: no match", () => {
	assertEquals(
		isOriginAllowed("https://evil.com", ["https://foo.com"]),
		false,
	);
});

Deno.test("isOriginAllowed: multiple allowed", () => {
	assertEquals(
		isOriginAllowed("https://b.com", ["https://a.com", "https://b.com"]),
		true,
	);
});

// --- MSG_PREFIX ---

Deno.test("MSG_PREFIX is namespaced", () => {
	assertEquals(MSG_PREFIX, "@@__widget_provider__@@");
});

// --- STYLE_PRESETS ---

Deno.test("STYLE_PRESETS has all three presets", () => {
	assertEquals("float" in STYLE_PRESETS, true);
	assertEquals("fullscreen" in STYLE_PRESETS, true);
	assertEquals("inline" in STYLE_PRESETS, true);
});

Deno.test("float preset uses fixed positioning", () => {
	assertEquals(STYLE_PRESETS.float.position, "fixed");
});

Deno.test("fullscreen preset covers viewport", () => {
	assertEquals(STYLE_PRESETS.fullscreen.position, "fixed");
	assertEquals(STYLE_PRESETS.fullscreen.width, "100vw");
	assertEquals(STYLE_PRESETS.fullscreen.height, "100vh");
});

Deno.test("inline preset uses relative positioning", () => {
	assertEquals(STYLE_PRESETS.inline.position, "relative");
});

// --- resolveEdge ---

Deno.test("resolveEdge: left edge", () => {
	assertEquals(resolveEdge(true, false, false, false), "left");
});

Deno.test("resolveEdge: right edge", () => {
	assertEquals(resolveEdge(false, true, false, false), "right");
});

Deno.test("resolveEdge: top edge", () => {
	assertEquals(resolveEdge(false, false, true, false), "top");
});

Deno.test("resolveEdge: bottom edge", () => {
	assertEquals(resolveEdge(false, false, false, true), "bottom");
});

Deno.test("resolveEdge: no edge returns null", () => {
	assertEquals(resolveEdge(false, false, false, false), null);
});

Deno.test("resolveEdge: corner (two edges) returns corner", () => {
	assertEquals(resolveEdge(true, false, true, false), "top-left");
	assertEquals(resolveEdge(true, false, false, true), "bottom-left");
	assertEquals(resolveEdge(false, true, true, false), "top-right");
	assertEquals(resolveEdge(false, true, false, true), "bottom-right");
});

Deno.test("resolveEdge: opposite edges returns null", () => {
	assertEquals(resolveEdge(true, true, false, false), null);
	assertEquals(resolveEdge(false, false, true, true), null);
});

Deno.test("resolveEdge: three or four edges returns null", () => {
	assertEquals(resolveEdge(true, true, true, false), null);
	assertEquals(resolveEdge(true, true, true, true), null);
});

// --- provideWidget static constants ---

Deno.test("provideWidget exposes MSG_PREFIX as static property", () => {
	assertEquals(provideWidget.MSG_PREFIX, "@@__widget_provider__@@");
	assertEquals(provideWidget.MSG_PREFIX, MSG_PREFIX);
});

Deno.test("provideWidget exposes all MSG_TYPE_* as static properties", () => {
	const expected: Record<string, string> = {
		MSG_TYPE_READY: "__ready",
		MSG_TYPE_OPEN: "__open",
		MSG_TYPE_MAXIMIZE: "__maximize",
		MSG_TYPE_RESTORE: "__restore",
		MSG_TYPE_MAXIMIZE_HEIGHT: "__maximizeHeight",
		MSG_TYPE_MINIMIZE_HEIGHT: "__minimizeHeight",
		MSG_TYPE_MAXIMIZE_WIDTH: "__maximizeWidth",
		MSG_TYPE_MINIMIZE_WIDTH: "__minimizeWidth",
		MSG_TYPE_RESET: "__reset",
		MSG_TYPE_HIDE: "__hide",
		MSG_TYPE_DESTROY: "__destroy",
		MSG_TYPE_SET_PRESET: "__setPreset",
		MSG_TYPE_DETACH: "__detach",
		MSG_TYPE_DOCK: "__dock",
		MSG_TYPE_NATIVE_FULLSCREEN: "__nativeFullscreen",
		MSG_TYPE_EXIT_NATIVE_FULLSCREEN: "__exitNativeFullscreen",
		MSG_TYPE_HEIGHT_STATE: "__heightState",
		MSG_TYPE_WIDTH_STATE: "__widthState",
		MSG_TYPE_DETACHED: "__detached",
		MSG_TYPE_IS_SMALL_SCREEN: "__isSmallScreen",
		MSG_TYPE_REQUEST_HASH: "__requestHash",
		MSG_TYPE_HASH_REPORT: "__hashReport",
	};
	for (const [key, value] of Object.entries(expected)) {
		assertEquals(
			(provideWidget as unknown as Record<string, string>)[key],
			value,
			`provideWidget.${key} should be "${value}"`,
		);
	}
});

Deno.test("provideWidget static properties match standalone exports", () => {
	assertEquals(provideWidget.MSG_TYPE_READY, MSG_TYPE_READY);
	assertEquals(provideWidget.MSG_TYPE_OPEN, MSG_TYPE_OPEN);
	assertEquals(provideWidget.MSG_TYPE_MAXIMIZE, MSG_TYPE_MAXIMIZE);
	assertEquals(provideWidget.MSG_TYPE_RESTORE, MSG_TYPE_RESTORE);
	assertEquals(provideWidget.MSG_TYPE_MAXIMIZE_HEIGHT, MSG_TYPE_MAXIMIZE_HEIGHT);
	assertEquals(provideWidget.MSG_TYPE_MINIMIZE_HEIGHT, MSG_TYPE_MINIMIZE_HEIGHT);
	assertEquals(provideWidget.MSG_TYPE_MAXIMIZE_WIDTH, MSG_TYPE_MAXIMIZE_WIDTH);
	assertEquals(provideWidget.MSG_TYPE_MINIMIZE_WIDTH, MSG_TYPE_MINIMIZE_WIDTH);
	assertEquals(provideWidget.MSG_TYPE_RESET, MSG_TYPE_RESET);
	assertEquals(provideWidget.MSG_TYPE_HIDE, MSG_TYPE_HIDE);
	assertEquals(provideWidget.MSG_TYPE_DESTROY, MSG_TYPE_DESTROY);
	assertEquals(provideWidget.MSG_TYPE_SET_PRESET, MSG_TYPE_SET_PRESET);
	assertEquals(provideWidget.MSG_TYPE_DETACH, MSG_TYPE_DETACH);
	assertEquals(provideWidget.MSG_TYPE_DOCK, MSG_TYPE_DOCK);
	assertEquals(provideWidget.MSG_TYPE_NATIVE_FULLSCREEN, MSG_TYPE_NATIVE_FULLSCREEN);
	assertEquals(
		provideWidget.MSG_TYPE_EXIT_NATIVE_FULLSCREEN,
		MSG_TYPE_EXIT_NATIVE_FULLSCREEN,
	);
	assertEquals(provideWidget.MSG_TYPE_HEIGHT_STATE, MSG_TYPE_HEIGHT_STATE);
	assertEquals(provideWidget.MSG_TYPE_WIDTH_STATE, MSG_TYPE_WIDTH_STATE);
	assertEquals(provideWidget.MSG_TYPE_DETACHED, MSG_TYPE_DETACHED);
	assertEquals(provideWidget.MSG_TYPE_IS_SMALL_SCREEN, MSG_TYPE_IS_SMALL_SCREEN);
	assertEquals(provideWidget.MSG_TYPE_REQUEST_HASH, MSG_TYPE_REQUEST_HASH);
	assertEquals(provideWidget.MSG_TYPE_HASH_REPORT, MSG_TYPE_HASH_REPORT);
});
