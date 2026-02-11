# Architecture

## Overview

Single-function library that creates an iframe-based widget embedded in a host page. The host communicates with the iframe via `postMessage`, with origin validation and namespaced message types.

## Component Map

```
Host Page (provideWidget caller)
  │
  ├── Container <div>        ← styled by preset (float/fullscreen/inline)
  │     └── <iframe>         ← loads widgetUrl, sandboxed
  │
  ├── Trigger <button>       ← optional, auto-toggles visibility
  │
  └── State Store            ← @marianmeres/store (visible, ready, destroyed, preset)
        └── postMessage listener ← origin-validated, prefix-filtered
```

## Data Flow

```
Host → iframe:  widget.send(type, payload) → postMessage with MSG_PREFIX
iframe → Host:  postMessage with MSG_PREFIX → handleMessage → built-in handlers + onMessage callbacks

Built-in control messages (from iframe):
  ready, maximize, minimize, hide, close, setPreset, nativeFullscreen, exitNativeFullscreen
```

## Key Files

| File                     | Purpose                                                               |
| ------------------------ | --------------------------------------------------------------------- |
| `src/widget-provider.ts` | `provideWidget()` factory — creates DOM, wires messaging, returns API |
| `src/types.ts`           | All types, interfaces, `MSG_PREFIX` constant                          |
| `src/style-presets.ts`   | CSS preset objects, animation configs, apply functions                |
| `src/mod.ts`             | Public barrel export                                                  |

## External Dependencies

| Dependency           | Purpose                                                    |
| -------------------- | ---------------------------------------------------------- |
| `@marianmeres/store` | Reactive state store (Svelte-compatible subscribe pattern) |

## Security Boundaries

- **Origin validation**: `resolveAllowedOrigins()` derives from `widgetUrl` or uses explicit config. `isOriginAllowed()` checks incoming messages.
- **Iframe sandbox**: Defaults to `allow-scripts allow-same-origin`. Configurable via `sandbox` option.
- **Message namespace**: All messages prefixed with `@@__widget_provider__@@` to avoid collisions.
