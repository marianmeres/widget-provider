# Architecture

## Overview

Single-function library that creates an iframe-based widget embedded in a host page. The host communicates with the iframe via `postMessage`, with origin validation and namespaced message types.

## Component Map

```
Host Page (provideWidget caller)
  │
  ├── Container <div>        ← styled by preset (float/fullscreen/inline)
  │     ├── Drag Handle      ← optional, float preset only (via makeDraggable)
  │     ├── Resize Handle    ← optional, float preset only (via makeResizable)
  │     └── <iframe>         ← loads widgetUrl, sandboxed
  │
  ├── Trigger <button>       ← optional, auto-toggles visibility
  │
  ├── Placeholder <div>      ← replaces container when detached (inline only)
  │
  └── State Store            ← @marianmeres/store
        │                       (visible, ready, destroyed, preset, heightState,
        │                        widthState, detached, isSmallScreen)
        └── postMessage listener ← origin-validated, prefix-filtered
```

## Data Flow

```
Host → iframe:  widget.send(type, payload) → postMessage with MSG_PREFIX
iframe → Host:  postMessage with MSG_PREFIX → handleMessage → built-in handlers + onMessage callbacks

Built-in control messages (from iframe):
  ready, open, fullscreen, restore, maximizeHeight, minimizeHeight,
  maximizeWidth, minimizeWidth, reset, hide, destroy, setPreset,
  detach, dock, nativeFullscreen, exitNativeFullscreen

Host → iframe state notifications (sent on ready + on change):
  preset              — payload: StylePreset (current positioning mode)
  heightState         — payload: DimensionState
  widthState          — payload: DimensionState
  detached            — payload: boolean
  isSmallScreen       — payload: boolean

Host → iframe protocol messages:
  requestHash         — sent before detach/dock DOM moves to request current hash

Iframe → Host protocol responses (optional):
  hashReport          — payload: location.hash (enables cross-origin hash preservation)
```

## Preset-specific Behavior

| Feature        | inline | float | fullscreen |
| -------------- | ------ | ----- | ---------- |
| Height control | no-op  | yes   | yes        |
| Width control  | no-op  | yes   | yes        |
| Draggable      | no     | yes   | no         |
| Resizable      | no     | yes   | no         |
| Detach/dock    | yes    | no    | no         |
| Trigger button | yes    | yes   | yes        |
| Animations     | yes    | yes   | yes        |

## Key Files

| File                     | Purpose                                                               |
| ------------------------ | --------------------------------------------------------------------- |
| `src/widget-provider.ts` | `provideWidget()` factory — creates DOM, wires messaging, returns API |
| `src/types.ts`           | All types, interfaces, `MSG_PREFIX` and `MSG_TYPE_*` constants        |
| `src/style-presets.ts`   | CSS preset objects, animation configs, apply functions                |
| `src/draggable.ts`       | `makeDraggable()` — pointer-event based drag for float containers     |
| `src/resizable.ts`       | `makeResizable()` — pointer-event based resize for float containers   |
| `src/iconGrip.ts`        | SVG icon for drag handle                                              |
| `src/iconResize.ts`      | SVG icon for resize handle                                            |
| `src/mod.ts`             | Public barrel export                                                  |

## External Dependencies

| Dependency            | Purpose                                                    |
| --------------------- | ---------------------------------------------------------- |
| `@marianmeres/store`  | Reactive state store (Svelte-compatible subscribe pattern) |
| `@marianmeres/pubsub` | Internal message dispatch for onMessage handlers           |
| `@marianmeres/clog`   | Debug logging                                              |

## Security Boundaries

- **Origin validation**: `resolveAllowedOrigins()` derives from `widgetUrl` or uses explicit config. `isOriginAllowed()` checks incoming messages.
  - Fallback-to-wildcard (invalid URL, no `allowedOrigin`) logs a `clog.warn` on construction — production should always pass an explicit `allowedOrigin`.
  - `send()` targets the iframe's actual origin once any valid message has been received (remembered from `event.origin`). Before the first message, single-origin configs target that origin; multi-origin configs fall back to the first entry with a one-time warning.
- **Iframe sandbox**: Defaults to `allow-scripts allow-same-origin`. Note: when `widgetUrl` is same-origin as the host, `allow-same-origin` lets the iframe script remove its own sandbox attribute — effectively no sandbox. Override via `sandbox` option for isolated widgets.
- **Message namespace**: All messages prefixed with `@@__widget_provider__@@` to avoid collisions.
- **`innerHTML` sinks**: `trigger.content` and `placeholder.content` are assigned via `innerHTML` — treat them as trusted HTML; never interpolate untrusted data.

## Detach / Dock

- Both `detach()` and `dock()` are serialized through a shared promise chain. Rapid or interleaved calls run in order; each `_detach`/`_dock` body is a no-op if state already matches the target.
- URL preservation: same-origin uses `iframe.contentWindow.location.href` (preserves full navigation path); cross-origin falls back to the `requestHash`/`hashReport` postMessage protocol (50ms timeout, hash only).
- `dock()` recovers gracefully if the placeholder was removed by external code between detach and dock: it appends the container to the original parent and logs a warning.
- `destroy()` nulls `originalParent`, `presetBeforeDetach`, `placeholderEl`, and `triggerEl` after cleanup so detached DOM subtrees can be garbage-collected.

## Axis + Interaction State

Drag and resize interactions update inline CSS directly. To keep that geometry alive across single-axis actions (e.g. `maximizeHeight()` while the widget is dragged to a custom horizontal position), the internal `captureUserGeometry()` runs on drag end and resize end, writing the current `top/left/width/height` into the `heightOverrides`/`widthOverrides` records. `resetToPreset` always re-applies whichever axis isn't being re-maximized — user position survives.

Rules:

- Capture only happens for axes whose state is `"normal"` (maximized/minimized axes keep their recipe-based overrides).
- `clearAxisOverrides()` runs in `setPreset`, `detach`, `dock`, `reset` — all of which intentionally discard interactive geometry.
