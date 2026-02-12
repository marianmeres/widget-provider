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
widget.open(); // show + auto-maximize on small screens
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
position.

```typescript
const widget = provideWidget({
	widgetUrl: "https://example.com/my-widget",
	parentContainer: document.getElementById("sidebar")!,
	stylePreset: "inline",
	placeholder: { content: "Widget is floating..." },
});

widget.detach(); // moves to body, switches to float style
widget.dock(); // returns to sidebar, restores inline style
```

### Message Protocol

Messages between the host and iframe are namespaced with `@@__widget_provider__@@`
prefix. The iframe can send built-in control messages: `ready`, `open`, `maximize`,
`minimize`, `maximizeHeight`, `minimizeHeight`, `maximizeWidth`, `minimizeWidth`,
`reset`, `hide`, `close`, `setPreset`, `detach`, `dock`, `nativeFullscreen`,
`exitNativeFullscreen`.

## API

See [API.md](API.md) for complete API documentation.

## License

[MIT](LICENSE)
