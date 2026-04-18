# Tasks

## Add a New Style Preset

### Steps

1. Add preset name to `StylePreset` union in `src/types.ts`
2. Create CSS object in `src/style-presets.ts` (extend `BASE_CONTAINER`)
3. Add to `STYLE_PRESETS` record in `src/style-presets.ts`

### Template

```typescript
// src/types.ts
export type StylePreset = "float" | "fullscreen" | "inline" | "new-preset";

// src/style-presets.ts
const PRESET_NEW: CSSProps = {
	...BASE_CONTAINER,
	// CSS properties
};

export const STYLE_PRESETS: Record<StylePreset, CSSProps> = {
	// ... existing
	"new-preset": PRESET_NEW,
};
```

### Checklist

- [ ] Type union updated
- [ ] CSS object created
- [ ] STYLE_PRESETS record updated
- [ ] `deno test` passes

## Add a New Animation Preset

### Steps

1. Add preset name to `AnimatePreset` union in `src/types.ts`
2. Add `AnimateConfig` entry in `ANIMATE_PRESETS` in `src/style-presets.ts`

### Checklist

- [ ] Type union updated
- [ ] Preset config added with `transition`, `hidden`, `visible` properties

## Add a New Built-in Control Message

### Steps

1. Add `MSG_TYPE_*` constant to `src/types.ts`
2. `src/mod.ts` uses `export * from "./types.ts"` — no edit needed there
3. Add the constant to `STATIC_PROPS` in `src/widget-provider.ts` (single source for the `provideWidget.MSG_TYPE_*` static attachment — no separate type expression to maintain)
4. Import the constant at the top of `src/widget-provider.ts` if the switch uses it
5. Add `case` to `switch (bareType)` in `handleMessage()` in `src/widget-provider.ts`
6. Implement handler function if needed (guard `destroyed` early)

### Template

```typescript
// src/types.ts
export const MSG_TYPE_MY_CONTROL = "__myControl";

// src/widget-provider.ts — import + STATIC_PROPS + handleMessage switch
import { /* ..., */ MSG_TYPE_MY_CONTROL } from "./types.ts";

const STATIC_PROPS = {
	/* ..., */
	MSG_TYPE_MY_CONTROL,
} as const;

case MSG_TYPE_MY_CONTROL:
    myControlFunction();
    break;
```

### Checklist

- [ ] Constant added to `src/types.ts`
- [ ] Added to `STATIC_PROPS` in `src/widget-provider.ts`
- [ ] Imported in the switch file
- [ ] Case added to `handleMessage` switch
- [ ] Handler implemented with `destroyed` guard
- [ ] Test added confirming static property exposure (`provideWidget.MSG_TYPE_MY_CONTROL`)

## Build and Publish

### Steps

1. Run `deno test` to verify
2. Run `deno task release` to bump version
3. Run `deno task publish` to publish to JSR + npm

### Checklist

- [ ] Tests pass
- [ ] Version bumped
- [ ] Published to both registries
