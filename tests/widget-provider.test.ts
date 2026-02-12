import { assertEquals, assertThrows } from "@std/assert";
import {
	isOriginAllowed,
	MSG_PREFIX,
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

Deno.test("resolveEdge: corner (two edges) returns null", () => {
	assertEquals(resolveEdge(true, false, true, false), null);
	assertEquals(resolveEdge(true, false, false, true), null);
	assertEquals(resolveEdge(false, true, true, false), null);
	assertEquals(resolveEdge(false, true, false, true), null);
});

Deno.test("resolveEdge: all edges returns null", () => {
	assertEquals(resolveEdge(true, true, true, true), null);
});
