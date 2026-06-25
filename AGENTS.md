# @marianmeres/widget-provider — Agent Guide

## Quick Reference

- **Stack**: Deno, TypeScript, browser DOM APIs
- **Runtime**: Deno (primary), npm (secondary via build)
- **Dependencies**: `@marianmeres/store` (reactive state), `@marianmeres/pubsub` (internal message dispatch), `@marianmeres/clog` (debug logging)
- **Test**: `deno test` | **Build**: `deno task npm:build` | **Publish**: `deno task publish`

## Project Structure

```
/src
  mod.ts              — Public entry point (re-exports)
  types.ts            — All type definitions and constants
  style-presets.ts    — CSS preset configs and apply functions
  widget-provider.ts  — Core provideWidget() implementation
  draggable.ts        — makeDraggable() for float preset drag-and-drop
  resizable.ts        — makeResizable() for float preset resize
  iconGrip.ts         — SVG icon for drag handle
  iconResize.ts       — SVG icon for resize handle
/tests                — Deno tests (unit tests for pure functions)
/scripts              — npm build script
/example              — Dev example app
```

## What This Library Does

Embeds an iframe-based widget into a host page with:

- Style presets (float, fullscreen, inline) for positioning
- postMessage-based bidirectional communication (namespaced with `@@__widget_provider__@@`)
- Show/hide animations (fade-scale, slide-up)
- Height and width control (maximize/minimize/reset for each axis — no-op when preset is inline)
- Optional trigger button (auto-toggles with widget visibility)
- Drag-and-drop with edge-snap (float preset only, via handle bar)
- Free-resize with corner handle (float preset only)
- Detach/dock workflow (inline preset only — float the widget, leave placeholder, preserve iframe hash)
- Small-screen detection with auto-fullscreen on `open()`
- PWA safe-area handling: the `fullscreen` preset is padded by device safe-area
  insets when the host runs as an installed PWA (requires host `viewport-fit=cover`)
- Reactive state via `@marianmeres/store` (Svelte-compatible subscribe)

## Critical Conventions

1. All message types are prefixed with `MSG_PREFIX` (`@@__widget_provider__@@`)
2. Types live in `types.ts`, style logic in `style-presets.ts`, core logic in `widget-provider.ts`
3. `mod.ts` is the sole public entry point — all public exports go through it (use `export * from "./types.ts"` for the shared types/consts surface so adding a new constant only requires editing `types.ts`)
4. `STATIC_PROPS` in `widget-provider.ts` is the single source for `provideWidget.MSG_TYPE_*` convenience attachments — add new constants there as well as in `types.ts`, no separate type expression to maintain
5. Use Deno formatting: tabs, 90 char line width (`deno fmt`)
6. `provideWidget()` is the only user-facing factory — returns `WidgetProviderApi`
7. Preset-specific guards: actions that don't apply to a preset silently no-op (e.g. dimension actions when inline, detach when not inline, draggable/resizable when not float). Guards `clog.warn` the no-op reason so consumers can debug
8. `detach()` and `dock()` are async (`Promise<void>`) — they capture iframe URL before DOM moves: same-origin preserves the full `contentWindow.location.href`; cross-origin falls back to hash-only via `requestHash`/`hashReport` postMessage protocol (50ms timeout). Calls are serialized through an internal promise chain so rapid detach/dock pairs can't interleave
9. `styleOverrides` is applied on every `applyPreset` call (including runtime `setPreset` switches) — preset-conditional overrides would require a per-preset map
10. `open()` tracks an internal `smallScreenAutoFullscreen` flag so that a later `open()` on a large viewport only auto-reverts when the prior open() did the auto-switch. Explicit `setPreset/fullscreen/restore` calls clear the flag
11. On drag end + resize end, current container geometry is captured into `heightOverrides`/`widthOverrides` (axes whose state is `"normal"`). This lets `resetToPreset` reapply user geometry when the other axis is being changed — a plain `maximizeHeight()` no longer clobbers a dragged/resized width
12. Styling is otherwise 100% inline, with ONE deliberate exception: `ensureGlobalStyles()` injects a singleton `<style>` (`PWA_SAFE_AREA_CSS`) so the `fullscreen` preset can use `@media (display-mode: standalone/fullscreen)` to pad by `env(safe-area-inset-*)` (can't express `@media` inline). It works WITHOUT `!important` only because the fullscreen preset writes no inline `padding` — INVARIANT: never set inline padding on the baseline fullscreen container (maximize/minimize set `padding: 0` on purpose to opt out). Depends on host `viewport-fit=cover`; `warnIfPwaMissingViewportFit()` emits a dev `clog.warn` when it's missing

## Before Making Changes

- [ ] Check existing patterns in similar files
- [ ] Run `deno test`
- [ ] Run `deno fmt`
- [ ] Ensure all public exports are re-exported from `mod.ts`

## Documentation Index

- [Architecture](./docs/architecture.md)
- [Conventions](./docs/conventions.md)
- [Tasks](./docs/tasks.md)
