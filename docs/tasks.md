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

1. Add `case` to `switch (bareType)` in `handleMessage()` in `src/widget-provider.ts`
2. Implement handler function if needed

### Template

```typescript
case "myControl":
    myControlFunction();
    break;
```

### Checklist

- [ ] Case added to switch
- [ ] Handler implemented
- [ ] No-op if destroyed

## Build and Publish

### Steps

1. Run `deno test` to verify
2. Run `deno task release` to bump version
3. Run `deno task publish` to publish to JSR + npm

### Checklist

- [ ] Tests pass
- [ ] Version bumped
- [ ] Published to both registries
