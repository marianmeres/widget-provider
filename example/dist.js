class PubSub {
    #subs = new Map();
    #onError;
    constructor(options){
        this.#onError = options?.onError ?? this.#defaultErrorHandler;
    }
    #defaultErrorHandler(error, topic, isWildcard) {
        const prefix = isWildcard ? "wildcard subscriber" : "subscriber";
        console.error(`Error in ${prefix} for topic "${topic}":`, error);
    }
    publish(topic, data) {
        this.#subs.get(topic)?.forEach((cb)=>{
            try {
                cb(data);
            } catch (error) {
                this.#onError(error, topic, false);
            }
        });
        if (topic !== "*") {
            this.#subs.get("*")?.forEach((cb)=>{
                try {
                    cb({
                        event: topic,
                        data
                    });
                } catch (error) {
                    this.#onError(error, topic, true);
                }
            });
        }
        return this.#subs.has(topic);
    }
    subscribe(topic, cb) {
        if (!this.#subs.has(topic)) {
            this.#subs.set(topic, new Set());
        }
        this.#subs.get(topic).add(cb);
        return ()=>this.unsubscribe(topic, cb);
    }
    unsubscribe(topic, cb) {
        if (!this.#subs.has(topic)) return false;
        const subscribers = this.#subs.get(topic);
        let removed = true;
        if (typeof cb === "function") {
            removed = subscribers.delete(cb);
            if (subscribers?.size === 0) {
                this.#subs.delete(topic);
            }
        } else {
            this.#subs.delete(topic);
        }
        return removed;
    }
    subscribeOnce(topic, cb) {
        const onceWrapper = (data)=>{
            try {
                cb(data);
            } finally{
                this.unsubscribe(topic, onceWrapper);
            }
        };
        return this.subscribe(topic, onceWrapper);
    }
    unsubscribeAll(topic) {
        if (topic) {
            if (!this.#subs.has(topic)) {
                return false;
            }
            this.#subs.delete(topic);
            return true;
        }
        this.#subs.clear();
        return true;
    }
    isSubscribed(topic, cb, considerWildcard = true) {
        let has = !!this.#subs.get(topic)?.has(cb);
        if (considerWildcard) {
            has ||= !!this.#subs.get("*")?.has(cb);
        }
        return has;
    }
    __dump() {
        return Object.fromEntries(this.#subs.entries());
    }
}
function createPubSub(options) {
    return new PubSub(options);
}
const isFn = (v)=>typeof v === "function";
const assertFn = (v, prefix = "")=>{
    if (!isFn(v)) throw new TypeError(`${prefix} Expecting function arg`.trim());
};
const createStore = (initial, options = null)=>{
    const _maybePersist = (v)=>{
        if (options?.persist) {
            try {
                options.persist(v);
            } catch (e) {
                if (options.onPersistError) {
                    options.onPersistError(e);
                } else {
                    console.warn("Store persistence failed:", e);
                }
            }
        }
    };
    const _pubsub = createPubSub(options?.onError ? {
        onError: (e)=>options.onError(e)
    } : undefined);
    let _value = initial;
    _maybePersist(_value);
    const get = ()=>_value;
    const set = (value)=>{
        if (_value !== value) {
            _value = value;
            _maybePersist(_value);
            _pubsub.publish("change", _value);
        }
    };
    const update = (cb)=>{
        assertFn(cb, "[update]");
        set(cb(get()));
    };
    const subscribe = (cb)=>{
        assertFn(cb, "[subscribe]");
        cb(_value);
        return _pubsub.subscribe("change", cb);
    };
    return {
        set,
        get,
        update,
        subscribe
    };
};
new Map();
const ANIMATE_PRESETS = {
    "fade-scale": {
        transition: "opacity 200ms ease, transform 200ms ease",
        hidden: {
            opacity: "0",
            transform: "scale(0.9)"
        },
        visible: {
            opacity: "1",
            transform: "scale(1)"
        }
    },
    "slide-up": {
        transition: "opacity 200ms ease, transform 200ms ease",
        hidden: {
            opacity: "0",
            transform: "translateY(20px)"
        },
        visible: {
            opacity: "1",
            transform: "translateY(0)"
        }
    }
};
const BASE_CONTAINER = {
    boxSizing: "border-box",
    overflow: "hidden"
};
const IFRAME_BASE = {
    width: "100%",
    height: "100%",
    border: "none",
    display: "block"
};
const PRESET_FLOAT = {
    ...BASE_CONTAINER,
    position: "fixed",
    bottom: "20px",
    right: "20px",
    width: "380px",
    height: "520px",
    zIndex: "10000",
    borderRadius: "12px",
    boxShadow: "0 4px 24px rgba(0,0,0,0.15)"
};
const PRESET_FULLSCREEN = {
    ...BASE_CONTAINER,
    position: "fixed",
    top: "0",
    left: "0",
    width: "100vw",
    height: "100vh",
    zIndex: "10000",
    padding: "2rem",
    backgroundColor: "rgba(0,0,0,0.5)"
};
const PRESET_INLINE = {
    ...BASE_CONTAINER,
    position: "relative",
    width: "100%",
    height: "100%"
};
const TRIGGER_BASE = {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    width: "56px",
    height: "56px",
    borderRadius: "50%",
    border: "none",
    background: "#1a73e8",
    color: "white",
    cursor: "pointer",
    zIndex: "10001",
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0"
};
const STYLE_PRESETS = {
    float: PRESET_FLOAT,
    fullscreen: PRESET_FULLSCREEN,
    inline: PRESET_INLINE
};
function applyPreset(container, preset, overrides) {
    const base = STYLE_PRESETS[preset];
    if (!base) {
        throw new Error(`Unknown style preset: "${preset}"`);
    }
    Object.assign(container.style, base, overrides);
}
function applyIframeBaseStyles(iframe) {
    Object.assign(iframe.style, IFRAME_BASE);
}
const MSG_PREFIX = "@@__widget_provider__@@";
const DEFAULT_TRIGGER_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
function resolveAllowedOrigins(explicit, widgetUrl) {
    if (explicit) {
        return Array.isArray(explicit) ? explicit : [
            explicit
        ];
    }
    try {
        return [
            new URL(widgetUrl).origin
        ];
    } catch  {
        return [
            "*"
        ];
    }
}
function isOriginAllowed(origin, allowed) {
    if (allowed.includes("*")) return true;
    return allowed.includes(origin);
}
function resolveAnimateConfig(opt) {
    if (!opt) return null;
    if (opt === true) return ANIMATE_PRESETS["fade-scale"];
    if (typeof opt === "string") return ANIMATE_PRESETS[opt] ?? null;
    const base = ANIMATE_PRESETS[opt.preset ?? "fade-scale"];
    if (!base) return null;
    return opt.transition ? {
        ...base,
        transition: opt.transition
    } : base;
}
function provideWidget(options) {
    const { widgetUrl, parentContainer, stylePreset = "inline", styleOverrides = {}, allowedOrigin, visible = true, sandbox = "allow-scripts allow-same-origin", iframeAttrs = {} } = options;
    if (!widgetUrl) {
        throw new Error("widgetUrl is required");
    }
    const origins = resolveAllowedOrigins(allowedOrigin, widgetUrl);
    const initialPreset = stylePreset;
    const anim = resolveAnimateConfig(options.animate);
    const state = createStore({
        visible,
        ready: false,
        destroyed: false,
        preset: stylePreset
    });
    const container = document.createElement("div");
    const iframe = document.createElement("iframe");
    applyPreset(container, stylePreset, styleOverrides);
    applyIframeBaseStyles(iframe);
    iframe.src = widgetUrl;
    if (sandbox) {
        iframe.setAttribute("sandbox", sandbox);
    }
    iframe.setAttribute("allowfullscreen", "");
    for (const [k, v] of Object.entries(iframeAttrs)){
        iframe.setAttribute(k, v);
    }
    container.appendChild(iframe);
    if (anim) {
        container.style.transition = anim.transition;
    }
    if (!visible) {
        container.style.display = "none";
        if (anim) {
            Object.assign(container.style, anim.hidden);
        }
    }
    const messageHandlers = new Map();
    function handleMessage(event) {
        if (!isOriginAllowed(event.origin, origins)) return;
        if (event.source !== iframe.contentWindow) return;
        const data = event.data;
        if (!data || typeof data.type !== "string") return;
        if (!data.type.startsWith(MSG_PREFIX)) return;
        const bareType = data.type.slice(MSG_PREFIX.length);
        switch(bareType){
            case "ready":
                state.update((s)=>({
                        ...s,
                        ready: true
                    }));
                break;
            case "maximize":
                maximize();
                break;
            case "minimize":
                minimize();
                break;
            case "hide":
                hide();
                break;
            case "close":
                destroy();
                break;
            case "setPreset":
                if (typeof data.payload === "string" && data.payload in STYLE_PRESETS) {
                    setPreset(data.payload);
                }
                break;
            case "nativeFullscreen":
                requestNativeFullscreen();
                break;
            case "exitNativeFullscreen":
                exitNativeFullscreen();
                break;
        }
        const handlers = messageHandlers.get(data.type);
        if (handlers) {
            for (const h of handlers){
                try {
                    h(data.payload);
                } catch (e) {
                    console.warn("[widget-provider] message handler error:", e);
                }
            }
        }
    }
    globalThis.addEventListener("message", handleMessage);
    const appendTarget = parentContainer || document.body;
    appendTarget.appendChild(container);
    const triggerOpts = options.trigger;
    let triggerEl = null;
    if (triggerOpts) {
        triggerEl = document.createElement("button");
        Object.assign(triggerEl.style, TRIGGER_BASE);
        if (typeof triggerOpts === "object" && triggerOpts.style) {
            Object.assign(triggerEl.style, triggerOpts.style);
        }
        const content = typeof triggerOpts === "object" && triggerOpts.content ? triggerOpts.content : DEFAULT_TRIGGER_ICON;
        triggerEl.innerHTML = content;
        if (visible) {
            triggerEl.style.display = "none";
        }
        triggerEl.addEventListener("click", ()=>show());
        appendTarget.appendChild(triggerEl);
    }
    function show() {
        if (state.get().destroyed) return;
        if (anim) {
            Object.assign(container.style, anim.hidden);
            container.style.display = "";
            container.offsetHeight;
            Object.assign(container.style, anim.visible);
        } else {
            container.style.display = "";
        }
        if (triggerEl) triggerEl.style.display = "none";
        state.update((s)=>({
                ...s,
                visible: true
            }));
    }
    function hide() {
        if (state.get().destroyed) return;
        if (triggerEl) triggerEl.style.display = "";
        state.update((s)=>({
                ...s,
                visible: false
            }));
        if (anim) {
            Object.assign(container.style, anim.hidden);
            const done = ()=>{
                if (!state.get().visible) {
                    container.style.display = "none";
                }
            };
            container.addEventListener("transitionend", done, {
                once: true
            });
            setTimeout(done, 250);
        } else {
            container.style.display = "none";
        }
    }
    function toggle() {
        if (state.get().visible) hide();
        else show();
    }
    function setPreset(preset) {
        if (state.get().destroyed) return;
        if (!(preset in STYLE_PRESETS)) return;
        container.style.cssText = "";
        applyPreset(container, preset, styleOverrides);
        if (anim) {
            container.style.transition = anim.transition;
        }
        if (!state.get().visible) {
            container.style.display = "none";
            if (anim) {
                Object.assign(container.style, anim.hidden);
            }
        }
        state.update((s)=>({
                ...s,
                preset
            }));
    }
    function maximize() {
        setPreset("fullscreen");
    }
    function minimize() {
        setPreset(initialPreset);
    }
    function requestNativeFullscreen() {
        if (state.get().destroyed) return Promise.resolve();
        return iframe.requestFullscreen();
    }
    function exitNativeFullscreen() {
        if (!document.fullscreenElement) return Promise.resolve();
        return document.exitFullscreen();
    }
    function destroy() {
        if (state.get().destroyed) return;
        globalThis.removeEventListener("message", handleMessage);
        messageHandlers.clear();
        iframe.src = "about:blank";
        container.remove();
        triggerEl?.remove();
        state.update((s)=>({
                visible: false,
                ready: false,
                destroyed: true,
                preset: s.preset
            }));
    }
    function send(type, payload) {
        if (state.get().destroyed) return;
        iframe.contentWindow?.postMessage({
            type: `${MSG_PREFIX}${type}`,
            payload
        }, origins[0] || "*");
    }
    function onMessage(type, handler) {
        const prefixedType = `${MSG_PREFIX}${type}`;
        if (!messageHandlers.has(prefixedType)) {
            messageHandlers.set(prefixedType, new Set());
        }
        messageHandlers.get(prefixedType).add(handler);
        return ()=>{
            messageHandlers.get(prefixedType)?.delete(handler);
        };
    }
    return {
        show,
        hide,
        toggle,
        destroy,
        setPreset,
        maximize,
        minimize,
        requestNativeFullscreen,
        exitNativeFullscreen,
        send,
        onMessage,
        subscribe: state.subscribe,
        get: state.get,
        get iframe () {
            return iframe;
        },
        get container () {
            return container;
        },
        get trigger () {
            return triggerEl;
        }
    };
}
export { provideWidget as provideWidget, resolveAllowedOrigins as resolveAllowedOrigins, isOriginAllowed as isOriginAllowed, resolveAnimateConfig as resolveAnimateConfig };
export { MSG_PREFIX as MSG_PREFIX };
export { STYLE_PRESETS as STYLE_PRESETS, IFRAME_BASE as IFRAME_BASE, ANIMATE_PRESETS as ANIMATE_PRESETS };
