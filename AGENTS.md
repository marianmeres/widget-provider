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
- Detach/dock workflow (inline preset only — float the widget, leave placeholder)
- Small-screen detection with auto-maximize on `open()`
- Reactive state via `@marianmeres/store` (Svelte-compatible subscribe)

## Critical Conventions

1. All message types are prefixed with `MSG_PREFIX` (`@@__widget_provider__@@`)
2. Types live in `types.ts`, style logic in `style-presets.ts`, core logic in `widget-provider.ts`
3. `mod.ts` is the sole public entry point — all public exports go through it
4. Use Deno formatting: tabs, 90 char line width (`deno fmt`)
5. `provideWidget()` is the only user-facing factory — returns `WidgetProviderApi`
6. Preset-specific guards: actions that don't apply to a preset silently no-op (e.g. dimension actions when inline, detach when not inline, draggable/resizable when not float)

## Before Making Changes

- [ ] Check existing patterns in similar files
- [ ] Run `deno test`
- [ ] Run `deno fmt`
- [ ] Ensure all public exports are re-exported from `mod.ts`

## Documentation Index

- [Architecture](./docs/architecture.md)
- [Conventions](./docs/conventions.md)
- [Tasks](./docs/tasks.md)
