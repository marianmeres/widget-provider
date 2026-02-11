# Conventions

## File Organisation

- Types and interfaces → `src/types.ts`
- Style/CSS logic → `src/style-presets.ts`
- Core implementation → `src/widget-provider.ts`
- Public exports → `src/mod.ts` (barrel)

## Naming

- Factory function: `provideWidget()` (not `createWidget`)
- Type names: PascalCase (`WidgetProviderOptions`, `StylePreset`)
- Constants: UPPER_SNAKE (`MSG_PREFIX`, `STYLE_PRESETS`, `ANIMATE_PRESETS`)
- Internal helpers: camelCase, not exported from `mod.ts`

## Patterns

### Message Protocol

All messages use `WidgetMessage` envelope with `MSG_PREFIX`:

```typescript
// Sending
send("myEvent", { data: 123 });
// Wire format: { type: "@@__widget_provider__@@myEvent", payload: { data: 123 } }

// Receiving
onMessage("myEvent", (payload) => { ... });
```

### Style Presets

Presets are plain `Partial<CSSStyleDeclaration>` objects applied via `Object.assign`:

```typescript
// Adding a new preset:
// 1. Add to StylePreset union in types.ts
// 2. Create CSS object in style-presets.ts
// 3. Add to STYLE_PRESETS record
```

### State Management

State is a `@marianmeres/store` instance with `WidgetState` shape. Subscribe with Svelte-compatible pattern:

```typescript
widget.subscribe((state) => {/* reactive */});
widget.get(); // snapshot
```

## Anti-Patterns

- Do not create multiple `provideWidget()` instances targeting the same container
- Do not call API methods after `destroy()`
- Do not use `"*"` for `allowedOrigin` in production

## Testing

- Pure utility functions (`resolveAllowedOrigins`, `isOriginAllowed`) are tested directly
- DOM-dependent `provideWidget()` requires browser environment (not tested in Deno unit tests)
- Run: `deno test`

## Formatting

- Tabs for indentation
- 90 char line width
- Run `deno fmt` before committing
