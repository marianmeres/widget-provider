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
const CLOG_STYLED = Symbol.for("@marianmeres/clog-styled");
const COLORS = [
    "#969696",
    "#d26565",
    "#cba14d",
    "#8eba36",
    "#3dc73d",
    "#4dcba1",
    "#67afd3",
    "#8e8ed4",
    "#b080c8",
    "#be5b9d"
];
function autoColor(str) {
    return COLORS[strHash(str) % COLORS.length];
}
function strHash(str) {
    let hash = 0;
    for(let i = 0; i < str.length; i++){
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash = hash & hash;
    }
    return hash >>> 0;
}
const LEVEL_MAP = {
    debug: "DEBUG",
    log: "INFO",
    warn: "WARNING",
    error: "ERROR"
};
function _detectRuntime() {
    if (typeof window !== "undefined" && window?.document) {
        return "browser";
    }
    if (globalThis.Deno?.version?.deno) return "deno";
    if (globalThis.process?.versions?.node) return "node";
    return "unknown";
}
const GLOBAL_KEY = Symbol.for("@marianmeres/clog");
const GLOBAL = globalThis[GLOBAL_KEY] ??= {
    hook: undefined,
    writer: undefined,
    jsonOutput: false,
    debug: undefined
};
function _processStyledArgs(args) {
    let format = "";
    const values = [];
    for (const arg of args){
        if (arg?.[CLOG_STYLED]) {
            format += `%c${arg.text}%c `;
            values.push(arg.style, "");
        } else if (typeof arg === "string") {
            format += `${arg} `;
        } else {
            format += "%o ";
            values.push(arg);
        }
    }
    return [
        format.trim(),
        values
    ];
}
function _hasStyledArgs(args) {
    return args.some((arg)=>arg?.[CLOG_STYLED]);
}
function _cleanStyledArgs(args) {
    return args.map((arg)=>arg?.[CLOG_STYLED] ? arg.text : arg);
}
function _stringifyArgs(args, config) {
    if (!(config?.stringify ?? GLOBAL.stringify)) return args;
    return args.map((arg)=>{
        if (arg === null || arg === undefined) return arg;
        if (typeof arg !== "object") return arg;
        if (arg?.[CLOG_STYLED]) return arg.text;
        try {
            return JSON.stringify(arg);
        } catch  {
            return String(arg);
        }
    });
}
function stringifyValue(arg) {
    if (arg === null) return "null";
    if (arg === undefined) return "undefined";
    if (typeof arg !== "object") return String(arg);
    if (arg?.[CLOG_STYLED]) return arg.text;
    try {
        return JSON.stringify(arg);
    } catch  {
        return String(arg);
    }
}
function _captureStack(limit) {
    const stack = new Error().stack || "";
    const lines = stack.split("\n");
    const relevant = lines.slice(5);
    if (typeof limit === "number" && limit > 0) {
        return relevant.slice(0, limit);
    }
    return relevant;
}
function _formatStack(lines) {
    return "\n---\nStack:\n" + lines.map((v)=>"  " + v.trim()).join("\n");
}
const defaultWriter = (data)=>{
    const { level, namespace, args, timestamp, config } = data;
    const runtime = _detectRuntime();
    const processedArgs = _stringifyArgs(args, config);
    const stacktraceConfig = config?.stacktrace ?? GLOBAL.stacktrace;
    const stackStr = stacktraceConfig ? _formatStack(_captureStack(typeof stacktraceConfig === "number" ? stacktraceConfig : undefined)) : null;
    const consoleMethod = {
        DEBUG: "debug",
        INFO: "log",
        WARNING: "warn",
        ERROR: "error"
    }[level];
    const ns = namespace ? `[${namespace}]` : "";
    const shouldConcat = config?.concat ?? GLOBAL.concat;
    if (shouldConcat) {
        const stringified = args.map(stringifyValue).join(" ");
        const output = runtime === "browser" ? ns ? `${ns} ${stringified}` : stringified : `[${timestamp}] [${level}]${ns ? ` ${ns}` : ""} ${stringified}`;
        console[consoleMethod](output, ...stackStr ? [
            stackStr
        ] : []);
        return;
    }
    const hasStyled = _hasStyledArgs(processedArgs);
    if ((runtime === "browser" || runtime === "deno") && hasStyled) {
        const [content, contentValues] = _processStyledArgs(processedArgs);
        if (runtime === "browser") {
            console[consoleMethod](ns ? `${ns} ${content}` : content, ...contentValues, ...stackStr ? [
                stackStr
            ] : []);
        } else {
            const prefix = `[${timestamp}] [${level}]${ns ? ` ${ns}` : ""}`;
            console[consoleMethod](`${prefix} ${content}`, ...contentValues, ...stackStr ? [
                stackStr
            ] : []);
        }
        return;
    }
    const cleanedArgs = _cleanStyledArgs(processedArgs);
    if (runtime === "browser") {
        if (ns) {
            console[consoleMethod](ns, ...cleanedArgs, ...stackStr ? [
                stackStr
            ] : []);
        } else {
            console[consoleMethod](...cleanedArgs, ...stackStr ? [
                stackStr
            ] : []);
        }
    } else {
        if (GLOBAL.jsonOutput) {
            const output = {
                timestamp,
                level,
                namespace,
                message: cleanedArgs[0],
                ...data.meta && {
                    meta: data.meta
                }
            };
            cleanedArgs.slice(1).forEach((arg, i)=>{
                output[`arg_${i}`] = arg?.stack ?? arg;
            });
            if (stackStr) {
                output.stack = stackStr;
            }
            console[consoleMethod](JSON.stringify(output));
        } else {
            const prefix = `[${timestamp}] [${level}]${ns ? ` ${ns}` : ""}`.trim();
            console[consoleMethod](prefix, ...cleanedArgs, ...stackStr ? [
                stackStr
            ] : []);
        }
    }
};
const colorWriter = (color)=>(data)=>{
        const { level, namespace, args, timestamp, config } = data;
        const runtime = _detectRuntime();
        if (runtime !== "browser" && runtime !== "deno" || !namespace) {
            return defaultWriter(data);
        }
        if (config?.concat ?? GLOBAL.concat) {
            return defaultWriter(data);
        }
        const processedArgs = _stringifyArgs(args, config);
        const stacktraceConfig = config?.stacktrace ?? GLOBAL.stacktrace;
        const stackStr = stacktraceConfig ? _formatStack(_captureStack(typeof stacktraceConfig === "number" ? stacktraceConfig : undefined)) : null;
        const consoleMethod = {
            DEBUG: "debug",
            INFO: "log",
            WARNING: "warn",
            ERROR: "error"
        }[level];
        const ns = `[${namespace}]`;
        if (color === "auto") {
            color = autoColor(namespace);
        }
        if (_hasStyledArgs(processedArgs)) {
            const [content, contentValues] = _processStyledArgs(processedArgs);
            if (runtime === "browser") {
                console[consoleMethod](`%c${ns}%c ${content}`, `color:${color}`, "", ...contentValues, ...stackStr ? [
                    stackStr
                ] : []);
            } else {
                const prefix = `[${timestamp}] [${level}] %c${ns}%c`;
                console[consoleMethod](`${prefix} ${content}`, `color:${color}`, "", ...contentValues, ...stackStr ? [
                    stackStr
                ] : []);
            }
        } else {
            if (runtime === "browser") {
                console[consoleMethod](`%c${ns}`, `color:${color}`, ...processedArgs, ...stackStr ? [
                    stackStr
                ] : []);
            } else {
                const prefix = `[${timestamp}] [${level}] %c${ns}`;
                console[consoleMethod](prefix, `color:${color}`, ...processedArgs, ...stackStr ? [
                    stackStr
                ] : []);
            }
        }
    };
function createClog(namespace, config) {
    const ns = namespace ?? false;
    const _apply = (level, args)=>{
        const message = String(args[0] ?? "");
        const getMetaFn = config?.getMeta ?? GLOBAL.getMeta;
        const meta = getMetaFn?.();
        const data = {
            level: LEVEL_MAP[level],
            namespace: ns,
            args,
            timestamp: new Date().toISOString(),
            config,
            meta
        };
        GLOBAL.hook?.(data);
        let writer = GLOBAL.writer ?? config?.writer;
        if (!writer && config?.color) {
            writer = colorWriter(config.color);
        }
        writer = writer ?? defaultWriter;
        writer(data);
        return message;
    };
    const logger = (...args)=>_apply("log", args);
    logger.debug = (...args)=>{
        if ((config?.debug ?? GLOBAL.debug) === false) {
            return String(args[0] ?? "");
        }
        return _apply("debug", args);
    };
    logger.log = (...args)=>_apply("log", args);
    logger.warn = (...args)=>_apply("warn", args);
    logger.error = (...args)=>_apply("error", args);
    Object.defineProperty(logger, "ns", {
        value: ns,
        writable: false
    });
    return logger;
}
createClog.global = GLOBAL;
createClog.reset = ()=>{
    createClog.global.hook = undefined;
    createClog.global.writer = undefined;
    createClog.global.jsonOutput = false;
    createClog.global.debug = undefined;
    createClog.global.stringify = undefined;
    createClog.global.concat = undefined;
    createClog.global.stacktrace = undefined;
    createClog.global.getMeta = undefined;
};
const clog = createClog("widget-provider");
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
    const pubsub = createPubSub({
        onError: (error)=>{
            clog.warn("message handler error:", error);
        }
    });
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
        pubsub.publish(data.type, data.payload);
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
        pubsub.unsubscribeAll();
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
        return pubsub.subscribe(prefixedType, handler);
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
export { isOriginAllowed as isOriginAllowed, provideWidget as provideWidget, resolveAllowedOrigins as resolveAllowedOrigins, resolveAnimateConfig as resolveAnimateConfig };
export { MSG_PREFIX as MSG_PREFIX };
export { ANIMATE_PRESETS as ANIMATE_PRESETS, IFRAME_BASE as IFRAME_BASE, STYLE_PRESETS as STYLE_PRESETS };
