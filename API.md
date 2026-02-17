# API

## Functions

### `provideWidget(options)`

Create and embed an iframe-based widget. Returns a control API object.

**Parameters:**

- `options` (`WidgetProviderOptions`) — Configuration object (see below)

**Returns:** `WidgetProviderApi`

**Example:**

```typescript
import { provideWidget } from "@marianmeres/widget-provider";

const widget = provideWidget({
	widgetUrl: "https://example.com/widget",
	stylePreset: "float",
	animate: "slide-up",
	trigger: { content: "<span>Chat</span>" },
	draggable: true,
});
```

---

### `makeDraggable(container, iframe, options?)`

Make a fixed-position container draggable via a handle bar inserted at the top.
Uses the Pointer Events API for unified mouse + touch support.

Typically used internally by `provideWidget()` when `draggable` option is set
and preset is `"float"`. Can also be used standalone.

**Parameters:**

- `container` (`HTMLElement`) — The fixed-position container element
- `iframe` (`HTMLIFrameElement`) — The iframe inside the container
- `options` (`DraggableOptions`, optional) — Drag behavior configuration

**Returns:** `DraggableHandle`

---

### `makeResizable(container, iframe, options?)`

Make a fixed-position container resizable via a corner handle at the bottom-right.
Uses the Pointer Events API for unified mouse + touch support.

Typically used internally by `provideWidget()` when `resizable` option is set
and preset is `"float"`. Can also be used standalone.

**Parameters:**

- `container` (`HTMLElement`) — The fixed-position container element
- `iframe` (`HTMLIFrameElement`) — The iframe inside the container
- `options` (`ResizableOptions`, optional) — Resize behavior configuration

**Returns:** `ResizableHandle`

---

### `resolveEdge(atLeft, atRight, atTop, atBottom)`

Pure edge-resolution logic: given which viewport edges are touched,
return the single active edge, a corner, or `null` if none or ambiguous.

**Parameters:**

- `atLeft` (`boolean`) — Whether the element is touching the left edge
- `atRight` (`boolean`) — Whether the element is touching the right edge
- `atTop` (`boolean`) — Whether the element is touching the top edge
- `atBottom` (`boolean`) — Whether the element is touching the bottom edge

**Returns:** `SnapEdge | null`

---

### `resolveAllowedOrigins(explicit, widgetUrl)`

Resolve the list of allowed origins for postMessage validation.

**Parameters:**

- `explicit` (`string | string[] | undefined`) — Explicitly configured origin(s)
- `widgetUrl` (`string`) — The widget URL to derive origin from

**Returns:** `string[]` — Array of allowed origin strings

**Example:**

```typescript
resolveAllowedOrigins(undefined, "https://example.com/app");
// => ['https://example.com']

resolveAllowedOrigins(["https://a.com", "https://b.com"], "https://c.com/app");
// => ['https://a.com', 'https://b.com']
```

---

### `isOriginAllowed(origin, allowed)`

Check whether a given origin is in the allowed list.

**Parameters:**

- `origin` (`string`) — Origin to check
- `allowed` (`string[]`) — List of allowed origins (use `"*"` to allow any)

**Returns:** `boolean`

---

### `resolveAnimateConfig(opt)`

Resolve animation option into a concrete `AnimateConfig` or `null`.

**Parameters:**

- `opt` (`boolean | AnimatePreset | { preset?: AnimatePreset; transition?: string } | undefined`)

**Returns:** `AnimateConfig | null`

---

## Types

### `WidgetProviderOptions`

```typescript
interface WidgetProviderOptions {
	/** The URL of the SPA to embed (required) */
	widgetUrl: string;
	/** DOM element to append the widget into. Default: document.body */
	parentContainer?: HTMLElement;
	/** Positioning mode. Default: "inline" */
	stylePreset?: StylePreset;
	/** CSS overrides applied to the container wrapper div */
	styleOverrides?: StyleOverrides;
	/** Allowed origin(s) for postMessage validation. Derived from widgetUrl if omitted */
	allowedOrigin?: string | string[];
	/** Whether the widget starts visible. Default: true */
	visible?: boolean;
	/** Iframe sandbox attribute. Default: "allow-scripts allow-same-origin" */
	sandbox?: string;
	/** Additional iframe attributes (e.g. allow, referrerpolicy) */
	iframeAttrs?: Record<string, string>;
	/** Opt-in show/hide animation: true | AnimatePreset | { preset?, transition? } */
	animate?: boolean | AnimatePreset | { preset?: AnimatePreset; transition?: string };
	/** Built-in floating trigger button: true | { content?, style? } */
	trigger?: boolean | { content?: string; style?: Partial<CSSStyleDeclaration> };
	/** Enable drag-and-drop for float preset: true | DraggableOptions */
	draggable?: boolean | DraggableOptions;
	/** Enable free-resize for float preset: true | ResizableOptions */
	resizable?: boolean | ResizableOptions;
	/** Placeholder config for detach(). Only relevant for inline preset with parentContainer */
	placeholder?: boolean | PlaceholderOptions;
	/** Viewport width threshold (px) below which open() auto-maximizes. Default: 640. Set to 0 to disable */
	smallScreenBreakpoint?: number;
}
```

---

### `WidgetProviderApi`

The object returned by `provideWidget()`.

| Method / Property           | Signature                                                         | Description                                                                 |
| --------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `open()`                    | `() => void`                                                      | Show and auto-maximize on small screens, or minimize on first open          |
| `show()`                    | `() => void`                                                      | Show the widget container                                                   |
| `hide()`                    | `() => void`                                                      | Hide the widget container                                                   |
| `toggle()`                  | `() => void`                                                      | Toggle visibility                                                           |
| `destroy()`                 | `() => void`                                                      | Remove iframe, listeners, DOM elements. Irreversible                        |
| `setPreset(preset)`         | `(preset: StylePreset) => void`                                   | Switch style preset at runtime                                              |
| `maximize()`                | `() => void`                                                      | Switch to fullscreen preset                                                 |
| `minimize()`                | `() => void`                                                      | Switch back to initial preset                                               |
| `maximizeHeight(offset?)`   | `(offset?: number) => void`                                       | Maximize height keeping width/position. No-op when inline                   |
| `minimizeHeight(height?)`   | `(height?: number) => void`                                       | Collapse to minimal height (default 48px). No-op when inline                |
| `maximizeWidth(offset?)`    | `(offset?: number) => void`                                       | Maximize width keeping height/position. No-op when inline                   |
| `minimizeWidth(width?)`     | `(width?: number) => void`                                        | Collapse to minimal width (default 48px). No-op when inline                 |
| `reset()`                   | `() => void`                                                      | Reset both height and width to current preset's defaults. No-op when inline |
| `requestNativeFullscreen()` | `() => Promise<void>`                                             | Browser fullscreen for iframe                                               |
| `exitNativeFullscreen()`    | `() => Promise<void>`                                             | Exit browser fullscreen                                                     |
| `detach()`                  | `() => Promise<void>`                                             | Float an inline widget to document.body, leaving a placeholder. Preserves iframe hash. Inline only |
| `dock()`                    | `() => Promise<void>`                                             | Return a detached widget to its original parentContainer. Preserves iframe hash                    |
| `send(type, payload?)`      | `<T>(type: string, payload?: T) => void`                          | Send message to iframe                                                      |
| `onMessage(type, handler)`  | `<T>(type: string, handler: (payload: T) => void) => Unsubscribe` | Listen for iframe messages                                                  |
| `subscribe(cb)`             | `(cb: (state: WidgetState) => void) => Unsubscribe`               | Reactive state subscription                                                 |
| `get()`                     | `() => WidgetState`                                               | Get current state snapshot                                                  |
| `iframe`                    | `readonly HTMLIFrameElement`                                      | Direct iframe element reference                                             |
| `container`                 | `readonly HTMLElement`                                            | Direct container div reference                                              |
| `trigger`                   | `readonly HTMLElement \| null`                                    | Trigger button reference, or null                                           |
| `placeholder`               | `readonly HTMLElement \| null`                                    | Placeholder element reference (only present while detached), or null        |

---

### `WidgetState`

```typescript
interface WidgetState {
	visible: boolean;
	ready: boolean;
	destroyed: boolean;
	preset: StylePreset;
	heightState: HeightState;
	widthState: WidthState;
	/** Whether the widget has been detached from its parentContainer */
	detached: boolean;
	/** Whether the viewport width is below the configured smallScreenBreakpoint */
	isSmallScreen: boolean;
}
```

---

### `DimensionState`

```typescript
type DimensionState = "normal" | "minimized" | "maximized";
```

---

### `HeightState`

```typescript
type HeightState = DimensionState;
```

---

### `WidthState`

```typescript
type WidthState = DimensionState;
```

---

### `DraggableOptions`

```typescript
interface DraggableOptions {
	/** Height of the drag handle bar in pixels. Default: 24 */
	handleHeight?: number;
	/** CSS overrides for the drag handle element */
	handleStyle?: Partial<CSSStyleDeclaration>;
	/** Minimum gap (px) between widget edge and viewport edge. Default: 20 */
	boundaryPadding?: number;
	/** Enable edge-snap (ghost preview + maximize on release). true | EdgeSnapOptions | false */
	edgeSnap?: boolean | EdgeSnapOptions;
	/** Called when pointer is released while the edge-snap ghost is showing */
	onEdgeSnap?: (edge: SnapEdge) => void;
	/** Reset-snap: shows a ghost and resets dimensions when dragging away from edges */
	resetSnap?: {
		isActive: () => boolean;
		createGhost: () => HTMLElement;
	};
	/** Called when pointer is released while the reset-snap ghost is showing */
	onResetSnap?: () => void;
}
```

---

### `DraggableHandle`

```typescript
interface DraggableHandle {
	/** The drag handle DOM element */
	readonly handleEl: HTMLElement;
	/** Remove all event listeners and the handle element */
	destroy(): void;
	/** Reset position to the preset default (clears top/left, restores bottom/right) */
	resetPosition(): void;
}
```

---

### `EdgeSnapOptions`

```typescript
interface EdgeSnapOptions {
	/** Dwell time (ms) at edge before ghost appears. Default: 500 */
	dwellMs?: number;
	/** CSS overrides for the ghost preview element */
	ghostStyle?: Partial<CSSStyleDeclaration>;
}
```

---

### `SnapEdge`

```typescript
type SnapEdge =
	| "left"
	| "right"
	| "top"
	| "bottom"
	| "top-left"
	| "top-right"
	| "bottom-left"
	| "bottom-right";
```

---

### `ResizableOptions`

```typescript
interface ResizableOptions {
	/** Size of the resize handle area in pixels. Default: 20 */
	handleSize?: number;
	/** CSS overrides for the resize handle element */
	handleStyle?: Partial<CSSStyleDeclaration>;
	/** Minimum gap (px) between widget edge and viewport edge. Default: 20 */
	boundaryPadding?: number;
	/** Minimum width in pixels. Default: 200 */
	minWidth?: number;
	/** Minimum height in pixels. Default: 150 */
	minHeight?: number;
	/** Maximum width in pixels. Default: viewport width minus padding */
	maxWidth?: number;
	/** Maximum height in pixels. Default: viewport height minus padding */
	maxHeight?: number;
	/** Called when a manual resize interaction ends */
	onResizeEnd?: () => void;
}
```

---

### `ResizableHandle`

```typescript
interface ResizableHandle {
	/** The resize handle DOM element */
	readonly handleEl: HTMLElement;
	/** Remove all event listeners and the handle element */
	destroy(): void;
	/** Reset size to the preset default (clears inline width/height) */
	resetSize(): void;
}
```

---

### `PlaceholderOptions`

```typescript
interface PlaceholderOptions {
	/** CSS overrides for the placeholder div */
	style?: Partial<CSSStyleDeclaration>;
	/** HTML content inside the placeholder (e.g., informational text) */
	content?: string;
}
```

---

### `WidgetMessage<T>`

```typescript
interface WidgetMessage<T = unknown> {
	type: string;
	payload?: T;
}
```

---

### `StylePreset`

```typescript
type StylePreset = "float" | "fullscreen" | "inline";
```

---

### `AnimatePreset`

```typescript
type AnimatePreset = "fade-scale" | "slide-up";
```

---

### `StyleOverrides`

```typescript
type StyleOverrides = Partial<CSSStyleDeclaration>;
```

---

### `AnimateConfig`

```typescript
interface AnimateConfig {
	transition: string;
	hidden: Partial<CSSStyleDeclaration>;
	visible: Partial<CSSStyleDeclaration>;
}
```

---

## Constants

### `MSG_PREFIX`

`"@@__widget_provider__@@"` — Namespace prefix for all postMessage types.

### `STYLE_PRESETS`

`Record<StylePreset, Partial<CSSStyleDeclaration>>` — CSS property objects for each positioning mode.

### `ANIMATE_PRESETS`

`Record<AnimatePreset, AnimateConfig>` — Animation configurations for show/hide transitions.

### `IFRAME_BASE`

`Partial<CSSStyleDeclaration>` — Base CSS applied to all iframes (100% width/height, no border).

### `PLACEHOLDER_BASE`

`Partial<CSSStyleDeclaration>` — Default CSS for the detach placeholder element (dashed border, centered content).
