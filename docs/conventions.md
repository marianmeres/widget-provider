# Conventions

## File Organisation

- Types and interfaces → `src/types.ts`
- Style/CSS logic → `src/style-presets.ts`
- Core implementation → `src/widget-provider.ts`
- Drag-and-drop → `src/draggable.ts`
- Resize → `src/resizable.ts`
- SVG icons → `src/iconGrip.ts`, `src/iconResize.ts`
- Public exports → `src/mod.ts` (barrel)

## Naming

- Factory function: `provideWidget()` (not `createWidget`)
- Type names: PascalCase (`WidgetProviderOptions`, `StylePreset`)
- Constants: UPPER_SNAKE (`MSG_PREFIX`, `STYLE_PRESETS`, `ANIMATE_PRESETS`)
- Internal helpers: camelCase, not exported from `mod.ts`

## Patterns

### Message Protocol

All messages use `WidgetMessage` envelope with `MSG_PREFIX`:

```typescript
// Sending
send("myEvent", { data: 123 });
// Wire format: { type: "@@__widget_provider__@@myEvent", payload: { data: 123 } }

// Receiving
onMessage("myEvent", (payload) => { ... });
```

### Style Presets

Presets are plain `Partial<CSSStyleDeclaration>` objects applied via `Object.assign`:

```typescript
// Adding a new preset:
// 1. Add to StylePreset union in types.ts
// 2. Create CSS object in style-presets.ts
// 3. Add to STYLE_PRESETS record
```

### State Management

State is a `@marianmeres/store` instance with `WidgetState` shape. Subscribe with Svelte-compatible pattern:

```typescript
widget.subscribe((state) => {/* reactive */});
widget.get(); // snapshot
```

### Preset Guards

Actions that don't apply to the current preset silently no-op and log a `clog.warn` to aid debugging. Guard pattern:

```typescript
function someAction(): void {
	if (state.get().destroyed) return;
	if (state.get().preset === "inline") {
		clog.warn(`someAction() is a no-op when preset is "inline"`);
		return;
	}
	// ... action logic
}
```

Current guards:

- **Dimension actions** (`maximizeHeight`, `minimizeHeight`, `maximizeWidth`, `minimizeWidth`, `reset`) → no-op when `preset === "inline"`
- **Detach** → no-op when `preset !== "inline"` or no `parentContainer`
- **Draggable** → only set up when `preset === "float"`
- **Resizable** → only set up when `preset === "float"`
- **setPreset** to unknown preset → no-op with warn

### Async DOM Move with URL Preservation

`detach()` and `dock()` are async (`Promise<void>`) because they capture the iframe's current URL before the DOM move (re-parenting reloads an iframe). Same-origin reads `contentWindow.location.href` synchronously and reassigns the iframe to that full URL — in-iframe navigation is preserved. Cross-origin falls back to the `requestHash`/`hashReport` postMessage round-trip with a 50ms timeout, preserving hash only.

Both methods go through a shared promise chain (`serializeDetachDock`) so rapid or interleaved calls run in order and can't corrupt `originalParent` / `placeholderEl` state mid-flight. Each `_detach`/`_dock` body is also a state-level no-op if the target state is already reached.

Internal callers (e.g. `setPreset` docking on inline, `handleMessage` dispatching `__detach` / `__dock`) fire-and-forget the returned promise.

### Interaction Geometry Capture

On drag end and resize end, the current container `top/left/width/height` is captured into `heightOverrides` and `widthOverrides` for any axis still in `"normal"` state. This is the mechanism that lets `maximizeHeight()` after a drag or resize preserve the user-chosen width/position rather than resetting to preset defaults. `setPreset`, `detach`, `dock`, and `reset` explicitly clear these overrides — those operations are meant to discard interactive geometry.

### Small-screen Auto-fullscreen Flag

`open()` tracks an internal `smallScreenAutoFullscreen` boolean. When `open()` auto-switches to fullscreen because `isSmallScreen` is true, the flag becomes true. The flag is cleared by any explicit `setPreset` / `fullscreen` / `restore` / subsequent `open()`. A later `open()` on a large viewport only reverts to the initial preset when the flag is set — so an explicit user preset choice survives a hide/show cycle.

## Anti-Patterns

- Do not create multiple `provideWidget()` instances targeting the same container
- Do not call API methods after `destroy()`
- Do not use `"*"` for `allowedOrigin` in production
- Do not put untrusted HTML in `trigger.content` or `placeholder.content` (both use `innerHTML`)
- Do not supply a `resetSnap.createGhost` that appends its returned element — the caller appends it (see `DraggableOptions.resetSnap`)

## Testing

- Pure utility functions (`resolveAllowedOrigins`, `isOriginAllowed`, `resolveEdge`) are tested directly
- DOM-dependent `provideWidget()` requires browser environment (not tested in Deno unit tests)
- Run: `deno test`

## Formatting

- Tabs for indentation
- 90 char line width
- Run `deno fmt` before committing
