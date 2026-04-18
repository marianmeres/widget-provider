# @marianmeres/widget-provider

[![NPM](https://img.shields.io/npm/v/@marianmeres/widget-provider)](https://www.npmjs.com/package/@marianmeres/widget-provider)
[![JSR](https://jsr.io/badges/@marianmeres/widget-provider)](https://jsr.io/@marianmeres/widget-provider)
[![License](https://img.shields.io/npm/l/@marianmeres/widget-provider)](LICENSE)

Embed an iframe-based widget into a host page with built-in positioning presets,
bidirectional postMessage communication, show/hide animations, drag-and-drop,
resize, detach/dock workflow, and reactive state.

## Installation

```bash
npm install @marianmeres/widget-provider
```

Or via JSR:

```bash
deno add jsr:@marianmeres/widget-provider
```

## Usage

```typescript
import { provideWidget } from "@marianmeres/widget-provider";

const widget = provideWidget({
	widgetUrl: "https://example.com/my-widget",
	stylePreset: "float", // "float" | "fullscreen" | "inline"
	animate: true, // fade-scale animation
	trigger: true, // show floating trigger button when hidden
	draggable: true, // drag handle for float preset
	resizable: true, // resize handle for float preset
});

// Control visibility
widget.open(); // show + auto-fullscreen on small screens
widget.show();
widget.hide();
widget.toggle();

// Dimension control (float/fullscreen only — no-op when inline)
widget.maximizeHeight();
widget.minimizeHeight();
widget.maximizeWidth();
widget.minimizeWidth();
widget.reset();

// Send messages to the iframe
widget.send("greet", { name: "World" });

// Listen for messages from the iframe
const unsub = widget.onMessage("response", (payload) => {
	console.log(payload);
});

// Subscribe to reactive state changes
widget.subscribe((state) => {
	console.log(state.visible, state.ready, state.heightState, state.detached);
});

// Clean up
widget.destroy();
```

### Style Presets

| Preset         | Description                             |
| -------------- | --------------------------------------- |
| `"inline"`     | Flows within parent container (default) |
| `"float"`      | Fixed bottom-right chat-widget style    |
| `"fullscreen"` | Covers viewport with backdrop overlay   |

### Detach / Dock (inline only)

An inline widget can be temporarily detached from its parent container and floated
on `document.body`, leaving a placeholder behind. Dock returns it to the original
position. Both methods are async and preserve the iframe's current URL across
the DOM move:

- **Same-origin**: full URL (including any in-iframe navigation) is preserved by
  reading `contentWindow.location.href`.
- **Cross-origin**: hash only, via the optional `requestHash`/`hashReport`
  postMessage protocol. If the iframe doesn't respond within 50ms, the URL is
  re-set without a hash.

Rapid or interleaved `detach()`/`dock()` calls are serialized through an internal
promise chain, so they can't corrupt placeholder/parent state.

```typescript
const widget = provideWidget({
	widgetUrl: "https://example.com/my-widget",
	parentContainer: document.getElementById("sidebar")!,
	stylePreset: "inline",
	placeholder: { content: "Widget is floating..." },
});

await widget.detach(); // moves to body, switches to float style, preserves URL
await widget.dock(); // returns to sidebar, restores inline style, preserves URL
```

### Message Protocol

Messages between the host and iframe are namespaced with `@@__widget_provider__@@`
prefix. The iframe can send built-in control messages: `ready`, `open`, `fullscreen`,
`restore`, `maximizeHeight`, `minimizeHeight`, `maximizeWidth`, `minimizeWidth`,
`reset`, `hide`, `destroy`, `setPreset`, `detach`, `dock`, `nativeFullscreen`,
`exitNativeFullscreen`.

The host sends state notifications to the iframe on `ready` and whenever values
change: `preset`, `heightState`, `widthState`, `detached`, `isSmallScreen`.

The host also sends `requestHash` before detach/dock DOM moves. **Same-origin**
iframes: the host reads `contentWindow.location.href` synchronously and re-assigns
the full URL after the DOM move — in-iframe navigation (including subpaths) is
preserved. **Cross-origin** iframes: the iframe can opt in to hash preservation
by replying with `hashReport` (preserves only the hash):

```javascript
// Iframe-side: opt-in hash preservation for cross-origin
const PREFIX = "@@__widget_provider__@@";
window.addEventListener("message", (event) => {
	if (event.data?.type === PREFIX + "requestHash") {
		window.parent.postMessage(
			{ type: PREFIX + "hashReport", payload: location.hash },
			event.origin,
		);
	}
});
```

### Security

- **Always pass an explicit `allowedOrigin`** in production. If the URL parse
  fails and `allowedOrigin` is omitted, the library falls back to `"*"` and
  logs a warning — origin validation is effectively disabled in that case.
- **Sandbox**: Default is `"allow-scripts allow-same-origin"`. When the widget
  is served from the same origin as the host, `allow-same-origin` lets the
  iframe script remove its own sandbox attribute — there is effectively no
  sandbox in that setup. For widgets you don't fully control, either serve from
  a different origin or drop `allow-same-origin`.
- **`innerHTML` sinks**: `trigger.content` and `placeholder.content` are
  assigned via `innerHTML`. Treat them as trusted HTML; never interpolate
  untrusted input.

## API

See [API.md](API.md) for complete API documentation.

## License

[MIT](LICENSE)
