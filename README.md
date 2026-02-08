# @marianmeres/widget-provider

[![NPM](https://img.shields.io/npm/v/@marianmeres/widget-provider)](https://www.npmjs.com/package/@marianmeres/widget-provider)
[![JSR](https://jsr.io/badges/@marianmeres/widget-provider)](https://jsr.io/@marianmeres/widget-provider)
[![License](https://img.shields.io/npm/l/@marianmeres/widget-provider)](LICENSE)

Embed an iframe-based widget into a host page with built-in positioning presets,
bidirectional postMessage communication, show/hide animations, and reactive state.

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
import { provideWidget } from '@marianmeres/widget-provider';

const widget = provideWidget({
    widgetUrl: 'https://example.com/my-widget',
    stylePreset: 'float',        // "float" | "fullscreen" | "inline"
    animate: true,               // fade-scale animation
    trigger: true,               // show floating trigger button when hidden
});

// Control visibility
widget.show();
widget.hide();
widget.toggle();

// Send messages to the iframe
widget.send('greet', { name: 'World' });

// Listen for messages from the iframe
const unsub = widget.onMessage('response', (payload) => {
    console.log(payload);
});

// Subscribe to reactive state changes
widget.subscribe((state) => {
    console.log(state.visible, state.ready);
});

// Clean up
widget.destroy();
```

### Style Presets

| Preset | Description |
|--------|-------------|
| `"inline"` | Flows within parent container (default) |
| `"float"` | Fixed bottom-right chat-widget style |
| `"fullscreen"` | Covers viewport with backdrop overlay |

### Message Protocol

Messages between the host and iframe are namespaced with `@@__widget_provider__@@`
prefix. The iframe can send built-in control messages: `ready`, `maximize`, `minimize`,
`hide`, `close`, `setPreset`, `nativeFullscreen`, `exitNativeFullscreen`.

## API

See [API.md](API.md) for complete API documentation.

## License

[MIT](LICENSE)
