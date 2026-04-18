if (typeof Symbol.dispose === "undefined") {
    Symbol.dispose = Symbol.for("Symbol.dispose");
}
const WILDCARD = "*";
class PubSub {
    #subs = new Map();
    #onError;
    constructor(options){
        this.#onError = options?.onError ?? this.#defaultErrorHandler;
        this.publish = this.publish.bind(this);
        this.subscribe = this.subscribe.bind(this);
        this.subscribeOnce = this.subscribeOnce.bind(this);
        this.subscribeMany = this.subscribeMany.bind(this);
        this.unsubscribe = this.unsubscribe.bind(this);
        this.unsubscribeAll = this.unsubscribeAll.bind(this);
        this.isSubscribed = this.isSubscribed.bind(this);
        this.subscriberCount = this.subscriberCount.bind(this);
        this.hasSubscribers = this.hasSubscribers.bind(this);
        this.topics = this.topics.bind(this);
    }
    #defaultErrorHandler(error, topic, isWildcard) {
        const prefix = isWildcard ? "wildcard subscriber" : "subscriber";
        console.error(`Error in ${prefix} for topic "${topic}":`, error);
    }
    #invoke(cb, data, topic, isWildcard) {
        try {
            const result = cb(data);
            if (result && typeof result.then === "function") {
                result.catch((reason)=>{
                    const err = reason instanceof Error ? reason : new Error(String(reason));
                    this.#onError(err, topic, isWildcard);
                });
            }
        } catch (error) {
            this.#onError(error, topic, isWildcard);
        }
    }
    #makeUnsubscriber(fn) {
        const u = ()=>fn();
        u[Symbol.dispose] = fn;
        return u;
    }
    publish(topic, data) {
        if (topic === WILDCARD) {
            throw new Error(`Cannot publish to wildcard topic "*". "*" is reserved for subscribers; publish to a real topic name instead.`);
        }
        const direct = this.#subs.get(topic);
        const hadDirect = !!direct && direct.size > 0;
        if (direct) {
            for (const cb of [
                ...direct
            ]){
                this.#invoke(cb, data, topic, false);
            }
        }
        const wildcards = this.#subs.get(WILDCARD);
        if (wildcards && wildcards.size > 0) {
            const envelope = {
                event: topic,
                data
            };
            for (const cb of [
                ...wildcards
            ]){
                this.#invoke(cb, envelope, topic, true);
            }
        }
        return hadDirect;
    }
    subscribe(topic, cb) {
        let bucket = this.#subs.get(topic);
        if (!bucket) {
            bucket = new Set();
            this.#subs.set(topic, bucket);
        }
        bucket.add(cb);
        return this.#makeUnsubscriber(()=>{
            this.unsubscribe(topic, cb);
        });
    }
    subscribeOnce(topic, cb) {
        let fired = false;
        const onceWrapper = (data)=>{
            if (fired) return;
            fired = true;
            this.unsubscribe(topic, onceWrapper);
            return cb(data);
        };
        return this.subscribe(topic, onceWrapper);
    }
    subscribeMany(topics, cb) {
        const unsubs = topics.map((t)=>this.subscribe(t, cb));
        return this.#makeUnsubscriber(()=>{
            for (const u of unsubs)u();
        });
    }
    unsubscribe(topic, cb) {
        const bucket = this.#subs.get(topic);
        if (!bucket) return false;
        if (typeof cb === "function") {
            const removed = bucket.delete(cb);
            if (bucket.size === 0) this.#subs.delete(topic);
            return removed;
        }
        return this.#subs.delete(topic);
    }
    unsubscribeAll(topic) {
        if (topic !== undefined) return this.#subs.delete(topic);
        if (this.#subs.size === 0) return false;
        this.#subs.clear();
        return true;
    }
    isSubscribed(topic, cb, considerWildcard = true) {
        if (this.#subs.get(topic)?.has(cb)) return true;
        if (considerWildcard && this.#subs.get(WILDCARD)?.has(cb)) return true;
        return false;
    }
    subscriberCount(topic) {
        if (topic !== undefined) return this.#subs.get(topic)?.size ?? 0;
        let total = 0;
        for (const set of this.#subs.values())total += set.size;
        return total;
    }
    hasSubscribers(topic) {
        return (this.#subs.get(topic)?.size ?? 0) > 0;
    }
    topics() {
        return [
            ...this.#subs.keys()
        ];
    }
    __dump() {
        const out = {};
        for (const [topic, set] of this.#subs.entries()){
            out[topic] = new Set(set);
        }
        return out;
    }
}
function createPubSub(options) {
    return new PubSub(options);
}
const isFn = (v)=>typeof v === "function";
const assertFn = (v, prefix = "")=>{
    if (!isFn(v)) throw new TypeError(`${prefix} Expecting function arg`.trim());
};
const strictEqual = (a, b)=>a === b;
function createStore(initial, options = null) {
    const _equal = options?.equal ?? strictEqual;
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
    const _handleInitialSubscriberError = (e)=>{
        const err = e instanceof Error ? e : new Error(String(e));
        if (options?.onError) {
            options.onError(err, "change", false);
        } else {
            console.error(`Error in subscriber for topic "change":`, err);
        }
    };
    const _pubsub = createPubSub(options?.onError ? {
        onError: (e, topic, isWildcard)=>options.onError(e, topic, isWildcard)
    } : undefined);
    let _value = initial;
    if (options?.eagerPersist !== false) {
        _maybePersist(_value);
    }
    const get = ()=>_value;
    let _notifying = false;
    let _hasPending = false;
    let _pendingValue;
    const _applyChange = (value)=>{
        _value = value;
        _maybePersist(_value);
        _pubsub.publish("change", _value);
    };
    const set = (value)=>{
        if (_equal(_value, value)) return;
        if (_notifying) {
            _hasPending = true;
            _pendingValue = value;
            return;
        }
        _notifying = true;
        try {
            _applyChange(value);
            while(_hasPending){
                const next = _pendingValue;
                _hasPending = false;
                if (!_equal(_value, next)) _applyChange(next);
            }
        } finally{
            _notifying = false;
            _hasPending = false;
        }
    };
    const update = (cb)=>{
        assertFn(cb, "[update]");
        set(cb(get()));
    };
    const subscribe = (cb)=>{
        assertFn(cb, "[subscribe]");
        try {
            cb(_value);
        } catch (e) {
            _handleInitialSubscriberError(e);
        }
        return _pubsub.subscribe("change", cb);
    };
    return {
        set,
        get,
        update,
        subscribe
    };
}
new Map();
const iconGrip = `
<svg
  xmlns="http://www.w3.org/2000/svg"
  width="24"
  height="24"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
>
  <circle cx="12" cy="5" r="1" />
  <circle cx="19" cy="5" r="1" />
  <circle cx="5" cy="5" r="1" />
  <circle cx="12" cy="12" r="1" />
  <circle cx="19" cy="12" r="1" />
  <circle cx="5" cy="12" r="1" />
  <circle cx="12" cy="19" r="1" />
  <circle cx="19" cy="19" r="1" />
  <circle cx="5" cy="19" r="1" />
</svg>
`;
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
    padding: "0",
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
const PLACEHOLDER_BASE = {
    boxSizing: "border-box",
    width: "100%",
    height: "100%",
    border: "2px dashed rgba(128, 128, 128, 0.4)",
    borderRadius: "8px",
    background: "rgba(128, 128, 128, 0.06)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "rgba(128, 128, 128, 0.6)",
    fontSize: "0.85rem",
    fontFamily: "system-ui, sans-serif"
};
const GHOST_BASE = {
    position: "fixed",
    boxSizing: "border-box",
    border: "2px dashed rgba(128, 128, 128, 0.5)",
    borderRadius: "8px",
    background: "rgba(128, 128, 128, 0.1)",
    pointerEvents: "none",
    transition: "opacity 150ms ease",
    opacity: "0"
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
function resolveEdge(atLeft, atRight, atTop, atBottom) {
    const count = [
        atLeft,
        atRight,
        atTop,
        atBottom
    ].filter(Boolean).length;
    if (count === 2) {
        if (atTop && atLeft) return "top-left";
        if (atTop && atRight) return "top-right";
        if (atBottom && atLeft) return "bottom-left";
        if (atBottom && atRight) return "bottom-right";
        return null;
    }
    if (count !== 1) return null;
    if (atLeft) return "left";
    if (atRight) return "right";
    if (atTop) return "top";
    return atBottom ? "bottom" : null;
}
function makeDraggable(container, iframe, options = {}) {
    const handleHeight = options.handleHeight ?? 24;
    const boundaryPadding = options.boundaryPadding ?? 20;
    const edgeSnapEnabled = options.edgeSnap !== false && (!!options.edgeSnap || !!options.onEdgeSnap);
    const edgeSnapOpts = typeof options.edgeSnap === "object" ? options.edgeSnap : {};
    const dwellMs = edgeSnapOpts.dwellMs ?? 500;
    const onEdgeSnap = options.onEdgeSnap;
    const handle = document.createElement("div");
    Object.assign(handle.style, {
        position: "absolute",
        top: "4px",
        left: "4px",
        zIndex: "1",
        width: `${handleHeight}px`,
        height: `${handleHeight}px`,
        cursor: "grab",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        userSelect: "none",
        touchAction: "none",
        opacity: "0.6",
        color: "#808080"
    });
    if (options.handleStyle) {
        Object.assign(handle.style, options.handleStyle);
    }
    handle.innerHTML = iconGrip;
    const svg = handle.querySelector("svg");
    if (svg) {
        svg.style.width = "100%";
        svg.style.height = "100%";
        svg.style.pointerEvents = "none";
    }
    container.style.position ||= "relative";
    container.appendChild(handle);
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    let savedTransition = "";
    let dwellTimer = null;
    let activeEdge = null;
    let ghostEl = null;
    let snapPending = false;
    let resetPending = false;
    function detectEdge(newLeft, newTop) {
        if (!edgeSnapEnabled) return null;
        const vw = globalThis.innerWidth;
        const vh = globalThis.innerHeight;
        const cw = container.offsetWidth;
        const ch = container.offsetHeight;
        return resolveEdge(newLeft <= boundaryPadding, newLeft >= vw - cw - boundaryPadding, newTop <= boundaryPadding, newTop >= vh - ch - boundaryPadding);
    }
    function buildEdgeGhost(edge) {
        const ghost = document.createElement("div");
        const rect = container.getBoundingClientRect();
        const vw = globalThis.innerWidth;
        const vh = globalThis.innerHeight;
        Object.assign(ghost.style, GHOST_BASE, {
            zIndex: "9999"
        });
        if (edge.includes("-")) {
            ghost.style.top = `${boundaryPadding}px`;
            ghost.style.left = `${boundaryPadding}px`;
            ghost.style.width = `${vw - boundaryPadding * 2}px`;
            ghost.style.height = `${vh - boundaryPadding * 2}px`;
        } else if (edge === "left" || edge === "right") {
            ghost.style.top = `${boundaryPadding}px`;
            ghost.style.left = `${rect.left}px`;
            ghost.style.width = `${rect.width}px`;
            ghost.style.height = `${vh - boundaryPadding * 2}px`;
        } else {
            ghost.style.top = `${rect.top}px`;
            ghost.style.left = `${boundaryPadding}px`;
            ghost.style.width = `${vw - boundaryPadding * 2}px`;
            ghost.style.height = `${rect.height}px`;
        }
        if (edgeSnapOpts.ghostStyle) {
            Object.assign(ghost.style, edgeSnapOpts.ghostStyle);
        }
        return ghost;
    }
    function mountGhost(el) {
        document.body.appendChild(el);
        requestAnimationFrame(()=>{
            el.style.opacity = "1";
        });
    }
    function removeGhost() {
        if (ghostEl) {
            ghostEl.remove();
            ghostEl = null;
        }
    }
    function cancelSnap() {
        if (dwellTimer !== null) {
            clearTimeout(dwellTimer);
            dwellTimer = null;
        }
        activeEdge = null;
        snapPending = false;
        resetPending = false;
        removeGhost();
    }
    function onPointerDown(e) {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        handle.setPointerCapture(e.pointerId);
        cancelSnap();
        isDragging = true;
        handle.style.cursor = "grabbing";
        savedTransition = container.style.transition;
        container.style.transition = "none";
        const rect = container.getBoundingClientRect();
        container.style.top = `${rect.top}px`;
        container.style.left = `${rect.left}px`;
        container.style.bottom = "auto";
        container.style.right = "auto";
        startX = e.clientX;
        startY = e.clientY;
        startLeft = rect.left;
        startTop = rect.top;
        iframe.style.pointerEvents = "none";
        handle.addEventListener("pointermove", onPointerMove);
        handle.addEventListener("pointerup", onPointerUp);
        handle.addEventListener("pointercancel", onPointerUp);
        options.onDragStart?.();
    }
    function onPointerMove(e) {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const vw = globalThis.innerWidth;
        const vh = globalThis.innerHeight;
        const cw = container.offsetWidth;
        const ch = container.offsetHeight;
        const newLeft = Math.max(boundaryPadding, Math.min(startLeft + dx, vw - cw - boundaryPadding));
        const newTop = Math.max(boundaryPadding, Math.min(startTop + dy, vh - ch - boundaryPadding));
        container.style.left = `${newLeft}px`;
        container.style.top = `${newTop}px`;
        if (!edgeSnapEnabled && !options.resetSnap) return;
        const edge = detectEdge(newLeft, newTop);
        const wantReset = !edge && !!options.resetSnap?.isActive();
        if (edge && edge === activeEdge) return;
        if (wantReset && (resetPending || dwellTimer && !activeEdge)) return;
        cancelSnap();
        if (edge) {
            activeEdge = edge;
            dwellTimer = setTimeout(()=>{
                dwellTimer = null;
                ghostEl = buildEdgeGhost(edge);
                mountGhost(ghostEl);
                snapPending = true;
            }, dwellMs);
        } else if (wantReset) {
            dwellTimer = setTimeout(()=>{
                dwellTimer = null;
                ghostEl = options.resetSnap.createGhost();
                mountGhost(ghostEl);
                resetPending = true;
            }, dwellMs);
        }
    }
    function onPointerUp(e) {
        if (!isDragging) return;
        isDragging = false;
        handle.style.cursor = "grab";
        iframe.style.pointerEvents = "";
        container.style.transition = savedTransition;
        handle.releasePointerCapture(e.pointerId);
        handle.removeEventListener("pointermove", onPointerMove);
        handle.removeEventListener("pointerup", onPointerUp);
        handle.removeEventListener("pointercancel", onPointerUp);
        const isCancel = e.type === "pointercancel";
        const snapFire = !isCancel && snapPending && activeEdge && onEdgeSnap;
        const resetFire = !isCancel && resetPending && options.onResetSnap;
        const edgeCaptured = activeEdge;
        cancelSnap();
        queueMicrotask(()=>{
            options.onDragEnd?.();
            if (snapFire && edgeCaptured) onEdgeSnap(edgeCaptured);
            else if (resetFire) options.onResetSnap();
        });
    }
    handle.addEventListener("pointerdown", onPointerDown);
    function resetPosition() {
        container.style.top = "";
        container.style.left = "";
        container.style.bottom = "";
        container.style.right = "";
    }
    function destroy() {
        cancelSnap();
        handle.removeEventListener("pointerdown", onPointerDown);
        if (isDragging) {
            iframe.style.pointerEvents = "";
            container.style.transition = savedTransition;
        }
        handle.remove();
    }
    return {
        get handleEl () {
            return handle;
        },
        destroy,
        resetPosition
    };
}
const iconResize = `
<svg
  xmlns="http://www.w3.org/2000/svg"
  width="24"
  height="24"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
>
  <line x1="21" y1="11" x2="11" y2="21" />
  <line x1="21" y1="15" x2="15" y2="21" />
  <line x1="21" y1="19" x2="19" y2="21" />
</svg>
`;
function makeResizable(container, iframe, options = {}) {
    const handleSize = options.handleSize ?? 20;
    const boundaryPadding = options.boundaryPadding ?? 20;
    const minWidth = options.minWidth ?? 200;
    const minHeight = options.minHeight ?? 150;
    const handle = document.createElement("div");
    Object.assign(handle.style, {
        position: "absolute",
        bottom: "2px",
        right: "2px",
        zIndex: "1",
        width: `${handleSize}px`,
        height: `${handleSize}px`,
        cursor: "nwse-resize",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        userSelect: "none",
        touchAction: "none",
        opacity: "0.6",
        color: "#808080"
    });
    if (options.handleStyle) {
        Object.assign(handle.style, options.handleStyle);
    }
    handle.innerHTML = iconResize;
    const svg = handle.querySelector("svg");
    if (svg) {
        svg.style.width = "100%";
        svg.style.height = "100%";
        svg.style.pointerEvents = "none";
    }
    container.style.position ||= "relative";
    container.appendChild(handle);
    let isResizing = false;
    let startX = 0;
    let startY = 0;
    let startWidth = 0;
    let startHeight = 0;
    let savedTransition = "";
    function onPointerDown(e) {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        handle.setPointerCapture(e.pointerId);
        isResizing = true;
        savedTransition = container.style.transition;
        container.style.transition = "none";
        const rect = container.getBoundingClientRect();
        container.style.top = `${rect.top}px`;
        container.style.left = `${rect.left}px`;
        container.style.bottom = "auto";
        container.style.right = "auto";
        startX = e.clientX;
        startY = e.clientY;
        startWidth = rect.width;
        startHeight = rect.height;
        iframe.style.pointerEvents = "none";
        handle.addEventListener("pointermove", onPointerMove);
        handle.addEventListener("pointerup", onPointerUp);
        handle.addEventListener("pointercancel", onPointerUp);
    }
    function onPointerMove(e) {
        if (!isResizing) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const maxW = options.maxWidth ?? globalThis.innerWidth - boundaryPadding;
        const maxH = options.maxHeight ?? globalThis.innerHeight - boundaryPadding;
        let newWidth = startWidth + dx;
        let newHeight = startHeight + dy;
        newWidth = Math.max(minWidth, Math.min(newWidth, maxW));
        newHeight = Math.max(minHeight, Math.min(newHeight, maxH));
        const containerLeft = container.getBoundingClientRect().left;
        const containerTop = container.getBoundingClientRect().top;
        newWidth = Math.min(newWidth, globalThis.innerWidth - containerLeft - boundaryPadding);
        newHeight = Math.min(newHeight, globalThis.innerHeight - containerTop - boundaryPadding);
        container.style.width = `${newWidth}px`;
        container.style.height = `${newHeight}px`;
    }
    function onPointerUp(e) {
        if (!isResizing) return;
        isResizing = false;
        iframe.style.pointerEvents = "";
        container.style.transition = savedTransition;
        handle.releasePointerCapture(e.pointerId);
        handle.removeEventListener("pointermove", onPointerMove);
        handle.removeEventListener("pointerup", onPointerUp);
        handle.removeEventListener("pointercancel", onPointerUp);
        options.onResizeEnd?.();
    }
    handle.addEventListener("pointerdown", onPointerDown);
    function resetSize() {
        container.style.width = "";
        container.style.height = "";
    }
    function destroy() {
        handle.removeEventListener("pointerdown", onPointerDown);
        if (isResizing) {
            iframe.style.pointerEvents = "";
            container.style.transition = savedTransition;
        }
        handle.remove();
    }
    return {
        get handleEl () {
            return handle;
        },
        destroy,
        resetSize
    };
}
const MSG_PREFIX = "@@__widget_provider__@@";
const MSG_TYPE_READY = "__ready";
const MSG_TYPE_OPEN = "__open";
const MSG_TYPE_FULLSCREEN = "__fullscreen";
const MSG_TYPE_RESTORE = "__restore";
const MSG_TYPE_MAXIMIZE_HEIGHT = "__maximizeHeight";
const MSG_TYPE_MINIMIZE_HEIGHT = "__minimizeHeight";
const MSG_TYPE_MAXIMIZE_WIDTH = "__maximizeWidth";
const MSG_TYPE_MINIMIZE_WIDTH = "__minimizeWidth";
const MSG_TYPE_RESET = "__reset";
const MSG_TYPE_HIDE = "__hide";
const MSG_TYPE_DESTROY = "__destroy";
const MSG_TYPE_SET_PRESET = "__setPreset";
const MSG_TYPE_DETACH = "__detach";
const MSG_TYPE_DOCK = "__dock";
const MSG_TYPE_NATIVE_FULLSCREEN = "__nativeFullscreen";
const MSG_TYPE_EXIT_NATIVE_FULLSCREEN = "__exitNativeFullscreen";
const MSG_TYPE_HEIGHT_STATE = "__heightState";
const MSG_TYPE_WIDTH_STATE = "__widthState";
const MSG_TYPE_DETACHED = "__detached";
const MSG_TYPE_IS_SMALL_SCREEN = "__isSmallScreen";
const MSG_TYPE_PRESET = "__preset";
const MSG_TYPE_REQUEST_HASH = "__requestHash";
const MSG_TYPE_HASH_REPORT = "__hashReport";
export { MSG_PREFIX as MSG_PREFIX };
export { MSG_TYPE_READY as MSG_TYPE_READY };
export { MSG_TYPE_OPEN as MSG_TYPE_OPEN };
export { MSG_TYPE_FULLSCREEN as MSG_TYPE_FULLSCREEN };
export { MSG_TYPE_RESTORE as MSG_TYPE_RESTORE };
export { MSG_TYPE_MAXIMIZE_HEIGHT as MSG_TYPE_MAXIMIZE_HEIGHT };
export { MSG_TYPE_MINIMIZE_HEIGHT as MSG_TYPE_MINIMIZE_HEIGHT };
export { MSG_TYPE_MAXIMIZE_WIDTH as MSG_TYPE_MAXIMIZE_WIDTH };
export { MSG_TYPE_MINIMIZE_WIDTH as MSG_TYPE_MINIMIZE_WIDTH };
export { MSG_TYPE_RESET as MSG_TYPE_RESET };
export { MSG_TYPE_HIDE as MSG_TYPE_HIDE };
export { MSG_TYPE_DESTROY as MSG_TYPE_DESTROY };
export { MSG_TYPE_SET_PRESET as MSG_TYPE_SET_PRESET };
export { MSG_TYPE_DETACH as MSG_TYPE_DETACH };
export { MSG_TYPE_DOCK as MSG_TYPE_DOCK };
export { MSG_TYPE_NATIVE_FULLSCREEN as MSG_TYPE_NATIVE_FULLSCREEN };
export { MSG_TYPE_EXIT_NATIVE_FULLSCREEN as MSG_TYPE_EXIT_NATIVE_FULLSCREEN };
export { MSG_TYPE_HEIGHT_STATE as MSG_TYPE_HEIGHT_STATE };
export { MSG_TYPE_WIDTH_STATE as MSG_TYPE_WIDTH_STATE };
export { MSG_TYPE_DETACHED as MSG_TYPE_DETACHED };
export { MSG_TYPE_IS_SMALL_SCREEN as MSG_TYPE_IS_SMALL_SCREEN };
export { MSG_TYPE_PRESET as MSG_TYPE_PRESET };
export { MSG_TYPE_REQUEST_HASH as MSG_TYPE_REQUEST_HASH };
export { MSG_TYPE_HASH_REPORT as MSG_TYPE_HASH_REPORT };
const CLOG_STYLED = Symbol.for("@marianmeres/clog-styled");
const SAFE_COLORS = {
    gray: "#969696",
    grey: "#969696",
    red: "#d26565",
    orange: "#cba14d",
    yellow: "#cba14d",
    green: "#3dc73d",
    teal: "#4dcba1",
    cyan: "#4dcba1",
    blue: "#67afd3",
    purple: "#8e8ed4",
    magenta: "#b080c8",
    pink: "#be5b9d"
};
const AUTO_PALETTE = [
    SAFE_COLORS.gray,
    SAFE_COLORS.red,
    SAFE_COLORS.orange,
    "#8eba36",
    SAFE_COLORS.green,
    SAFE_COLORS.teal,
    SAFE_COLORS.blue,
    SAFE_COLORS.purple,
    SAFE_COLORS.magenta,
    SAFE_COLORS.pink
];
const _autoColorCache = new Map();
function autoColor(namespace) {
    const cached = _autoColorCache.get(namespace);
    if (cached !== undefined) return cached;
    const color = AUTO_PALETTE[strHash(namespace) % AUTO_PALETTE.length];
    _autoColorCache.set(namespace, color);
    return color;
}
function strHash(str) {
    let hash = 0;
    for(let i = 0; i < str.length; i++){
        hash = (hash << 5) - hash + str.charCodeAt(i) | 0;
    }
    return hash >>> 0;
}
const LEVEL_MAP = {
    debug: "DEBUG",
    log: "INFO",
    warn: "WARNING",
    error: "ERROR"
};
const CLOG_SKIP = Symbol.for("@marianmeres/clog-skip");
const CLOG_INSTANCE = Symbol.for("@marianmeres/clog-instance");
const GLOBAL_KEY = Symbol.for("@marianmeres/clog");
const GLOBAL = globalThis[GLOBAL_KEY] ??= {
    hook: undefined,
    writer: undefined,
    jsonOutput: false,
    debug: undefined
};
let _cachedRuntime = null;
function detectRuntime() {
    if (_cachedRuntime !== null) return _cachedRuntime;
    if (typeof window !== "undefined" && window?.document) {
        return _cachedRuntime = "browser";
    }
    if (globalThis.Deno?.version?.deno) return _cachedRuntime = "deno";
    if (globalThis.process?.versions?.node) {
        return _cachedRuntime = "node";
    }
    return _cachedRuntime = "unknown";
}
const CLOG_FRAME_MARKERS = [
    "clog.ts",
    "colors.ts"
];
function isClogFrame(line) {
    return CLOG_FRAME_MARKERS.some((m)=>line.includes(m));
}
function captureStackLines(limit) {
    const stack = new Error().stack || "";
    const lines = stack.split("\n");
    const relevant = [];
    for (const raw of lines){
        const line = raw.trimEnd();
        if (!line) continue;
        if (/^Error(:|$)/.test(line.trim())) continue;
        if (isClogFrame(line)) continue;
        relevant.push(line);
    }
    if (typeof limit === "number" && limit > 0) {
        return relevant.slice(0, limit);
    }
    return relevant;
}
function formatStack(lines) {
    return "\n---\nStack:\n" + lines.map((v)=>"  " + v.trim()).join("\n");
}
function renderNs(ns) {
    if (!ns) return "";
    return ns.split(":").map((s)=>`[${s}]`).join(" ");
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
function _hasStyledArgs(args) {
    return args.some((arg)=>arg?.[CLOG_STYLED]);
}
function _cleanStyledArgs(args) {
    return args.map((arg)=>arg?.[CLOG_STYLED] ? arg.text : arg);
}
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
function firstArgAsString(args, config) {
    if (args.length === 0) return "";
    const concat = config?.concat ?? GLOBAL.concat;
    const stringify = config?.stringify ?? GLOBAL.stringify;
    if (concat || stringify) return stringifyValue(args[0]);
    return String(args[0] ?? "");
}
const CONSOLE_METHOD = {
    DEBUG: "debug",
    INFO: "log",
    WARNING: "warn",
    ERROR: "error"
};
const defaultWriter = (data)=>{
    const { level, namespace, args, timestamp, config, stack } = data;
    const runtime = detectRuntime();
    const consoleMethod = CONSOLE_METHOD[level];
    const nsText = renderNs(namespace);
    const stackStr = stack && stack.length ? formatStack(stack) : null;
    const shouldConcat = config?.concat ?? GLOBAL.concat;
    if (shouldConcat) {
        const stringified = args.map(stringifyValue).join(" ");
        const output = runtime === "browser" ? nsText ? `${nsText} ${stringified}` : stringified : `[${timestamp}] [${level}]${nsText ? ` ${nsText}` : ""} ${stringified}`;
        console[consoleMethod](output, ...stackStr ? [
            stackStr
        ] : []);
        return;
    }
    const processedArgs = _stringifyArgs(args, config);
    const hasStyled = _hasStyledArgs(processedArgs);
    if ((runtime === "browser" || runtime === "deno") && hasStyled) {
        const [content, contentValues] = _processStyledArgs(processedArgs);
        if (runtime === "browser") {
            console[consoleMethod](nsText ? `${nsText} ${content}` : content, ...contentValues, ...stackStr ? [
                stackStr
            ] : []);
        } else {
            const prefix = `[${timestamp}] [${level}]${nsText ? ` ${nsText}` : ""}`;
            console[consoleMethod](`${prefix} ${content}`, ...contentValues, ...stackStr ? [
                stackStr
            ] : []);
        }
        return;
    }
    const cleanedArgs = _cleanStyledArgs(processedArgs);
    if (runtime === "browser") {
        if (nsText) {
            console[consoleMethod](nsText, ...cleanedArgs, ...stackStr ? [
                stackStr
            ] : []);
        } else {
            console[consoleMethod](...cleanedArgs, ...stackStr ? [
                stackStr
            ] : []);
        }
        return;
    }
    const useJson = config?.jsonOutput ?? GLOBAL.jsonOutput;
    if (useJson) {
        const output = {
            timestamp,
            level,
            ...namespace ? {
                namespace
            } : {},
            message: cleanedArgs[0],
            ...data.meta && {
                meta: data.meta
            }
        };
        cleanedArgs.slice(1).forEach((arg, i)=>{
            output[`arg_${i}`] = arg?.stack ?? arg;
        });
        if (stackStr) output.stack = stackStr;
        console[consoleMethod](JSON.stringify(output));
        return;
    }
    const prefix = `[${timestamp}] [${level}]${nsText ? ` ${nsText}` : ""}`.trim();
    console[consoleMethod](prefix, ...cleanedArgs, ...stackStr ? [
        stackStr
    ] : []);
};
const colorWriter = (configuredColor)=>(data)=>{
        const { level, namespace, args, timestamp, config, stack } = data;
        const runtime = detectRuntime();
        if (runtime !== "browser" && runtime !== "deno" || !namespace || (config?.concat ?? GLOBAL.concat)) {
            return defaultWriter(data);
        }
        const color = configuredColor === "auto" ? autoColor(namespace) : configuredColor;
        const processedArgs = _stringifyArgs(args, config);
        const consoleMethod = CONSOLE_METHOD[level];
        const stackStr = stack && stack.length ? formatStack(stack) : null;
        const nsText = renderNs(namespace);
        if (_hasStyledArgs(processedArgs)) {
            const [content, contentValues] = _processStyledArgs(processedArgs);
            if (runtime === "browser") {
                console[consoleMethod](`%c${nsText}%c ${content}`, `color:${color}`, "", ...contentValues, ...stackStr ? [
                    stackStr
                ] : []);
            } else {
                const prefix = `[${timestamp}] [${level}] %c${nsText}%c`;
                console[consoleMethod](`${prefix} ${content}`, `color:${color}`, "", ...contentValues, ...stackStr ? [
                    stackStr
                ] : []);
            }
            return;
        }
        if (runtime === "browser") {
            console[consoleMethod](`%c${nsText}`, `color:${color}`, ...processedArgs, ...stackStr ? [
                stackStr
            ] : []);
        } else {
            const prefix = `[${timestamp}] [${level}] %c${nsText}`;
            console[consoleMethod](prefix, `color:${color}`, ...processedArgs, ...stackStr ? [
                stackStr
            ] : []);
        }
    };
function createClog(namespace, config) {
    const ns = namespace ?? false;
    const _apply = (level, args)=>{
        const clonedArgs = args.slice();
        const getMetaFn = config?.getMeta ?? GLOBAL.getMeta;
        const stacktraceConfig = config?.stacktrace ?? GLOBAL.stacktrace;
        const stack = stacktraceConfig ? captureStackLines(typeof stacktraceConfig === "number" ? stacktraceConfig : undefined) : undefined;
        const data = {
            level: LEVEL_MAP[level],
            namespace: ns,
            args: clonedArgs,
            timestamp: new Date().toISOString(),
            config,
            stack
        };
        if (getMetaFn) {
            let _meta;
            let _metaComputed = false;
            Object.defineProperty(data, "meta", {
                get () {
                    if (!_metaComputed) {
                        _metaComputed = true;
                        try {
                            _meta = getMetaFn();
                        } catch  {
                            _meta = undefined;
                        }
                    }
                    return _meta;
                },
                enumerable: true,
                configurable: true
            });
        }
        const hookResult = GLOBAL.hook?.(data);
        if (hookResult !== CLOG_SKIP) {
            let writer = GLOBAL.writer ?? config?.writer;
            if (!writer && config?.color) writer = colorWriter(config.color);
            writer = writer ?? defaultWriter;
            writer(data);
        }
        return firstArgAsString(clonedArgs, config);
    };
    const logger = (...args)=>_apply("log", args);
    logger.debug = (...args)=>{
        if ((config?.debug ?? GLOBAL.debug) === false) {
            return firstArgAsString(args, config);
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
    Object.defineProperty(logger, CLOG_INSTANCE, {
        value: {
            ns,
            config
        },
        enumerable: false,
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
function parseTransitionMs(transition, fallbackMs = 250) {
    const match = transition.match(/(\d+(?:\.\d+)?)\s*(ms|s)\b/);
    if (!match) return fallbackMs;
    const value = parseFloat(match[1]);
    return match[2] === "s" ? value * 1000 : value;
}
function _provideWidget(options) {
    const { widgetUrl, parentContainer, stylePreset = "inline", styleOverrides = {}, allowedOrigin, visible = true, sandbox = "allow-scripts allow-same-origin", iframeAttrs = {}, smallScreenBreakpoint = 640 } = options;
    if (!widgetUrl) {
        throw new Error("widgetUrl is required");
    }
    const origins = resolveAllowedOrigins(allowedOrigin, widgetUrl);
    const initialPreset = stylePreset;
    const anim = resolveAnimateConfig(options.animate);
    if (!allowedOrigin && origins[0] === "*") {
        clog.warn(`Could not derive origin from widgetUrl="${widgetUrl}" — falling back to "*". ` + `This disables origin validation; pass an explicit allowedOrigin for production.`);
    }
    function checkSmallScreen() {
        return smallScreenBreakpoint > 0 && globalThis.innerWidth < smallScreenBreakpoint;
    }
    const state = createStore({
        visible,
        ready: false,
        destroyed: false,
        preset: stylePreset,
        heightState: "normal",
        widthState: "normal",
        detached: false,
        isSmallScreen: checkSmallScreen()
    });
    let smallScreenAutoFullscreen = false;
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
    let lastIframeOrigin = null;
    let sendOriginWarned = false;
    function handleMessage(event) {
        if (!isOriginAllowed(event.origin, origins)) return;
        if (event.source !== iframe.contentWindow) return;
        const data = event.data;
        if (!data || typeof data.type !== "string") return;
        if (!data.type.startsWith(MSG_PREFIX)) return;
        lastIframeOrigin = event.origin;
        const bareType = data.type.slice(MSG_PREFIX.length);
        switch(bareType){
            case MSG_TYPE_READY:
                state.update((s)=>({
                        ...s,
                        ready: true
                    }));
                send(MSG_TYPE_PRESET, state.get().preset);
                send(MSG_TYPE_HEIGHT_STATE, state.get().heightState);
                send(MSG_TYPE_WIDTH_STATE, state.get().widthState);
                send(MSG_TYPE_DETACHED, state.get().detached);
                send(MSG_TYPE_IS_SMALL_SCREEN, state.get().isSmallScreen);
                break;
            case MSG_TYPE_OPEN:
                open();
                break;
            case MSG_TYPE_FULLSCREEN:
                fullscreen();
                break;
            case MSG_TYPE_RESTORE:
                restore();
                break;
            case MSG_TYPE_MAXIMIZE_HEIGHT:
                maximizeHeight(typeof data.payload === "number" ? data.payload : undefined);
                break;
            case MSG_TYPE_MINIMIZE_HEIGHT:
                minimizeHeight(typeof data.payload === "number" ? data.payload : undefined);
                break;
            case MSG_TYPE_MAXIMIZE_WIDTH:
                maximizeWidth(typeof data.payload === "number" ? data.payload : undefined);
                break;
            case MSG_TYPE_MINIMIZE_WIDTH:
                minimizeWidth(typeof data.payload === "number" ? data.payload : undefined);
                break;
            case MSG_TYPE_RESET:
                reset();
                break;
            case MSG_TYPE_HIDE:
                hide();
                break;
            case MSG_TYPE_DESTROY:
                destroy();
                break;
            case MSG_TYPE_SET_PRESET:
                if (typeof data.payload === "string" && data.payload in STYLE_PRESETS) {
                    setPreset(data.payload);
                }
                break;
            case MSG_TYPE_DETACH:
                detach();
                break;
            case MSG_TYPE_DOCK:
                dock();
                break;
            case MSG_TYPE_NATIVE_FULLSCREEN:
                requestNativeFullscreen();
                break;
            case MSG_TYPE_EXIT_NATIVE_FULLSCREEN:
                exitNativeFullscreen();
                break;
        }
        pubsub.publish(data.type, data.payload);
    }
    globalThis.addEventListener("message", handleMessage);
    function handleResize() {
        const small = checkSmallScreen();
        if (small !== state.get().isSmallScreen) {
            state.update((s)=>({
                    ...s,
                    isSmallScreen: small
                }));
            send(MSG_TYPE_IS_SMALL_SCREEN, small);
        }
    }
    globalThis.addEventListener("resize", handleResize);
    const appendTarget = parentContainer || document.body;
    appendTarget.appendChild(container);
    let placeholderEl = null;
    let originalParent = null;
    let presetBeforeDetach = null;
    function readSameOriginIframeUrl() {
        try {
            return iframe.contentWindow?.location?.href ?? null;
        } catch  {
            return null;
        }
    }
    function requestIframeHash(timeoutMs = 50) {
        return new Promise((resolve)=>{
            let done = false;
            const unsub = onMessage(MSG_TYPE_HASH_REPORT, (payload)=>{
                if (!done) {
                    done = true;
                    unsub();
                    resolve(typeof payload === "string" ? payload : "");
                }
            });
            setTimeout(()=>{
                if (!done) {
                    done = true;
                    unsub();
                    resolve("");
                }
            }, timeoutMs);
            send(MSG_TYPE_REQUEST_HASH);
        });
    }
    async function captureIframeUrlForReload() {
        const sameOrigin = readSameOriginIframeUrl();
        if (sameOrigin) return sameOrigin;
        const hash = await requestIframeHash();
        return widgetUrl.split("#")[0] + hash;
    }
    const resolvePlaceholderOpts = ()=>typeof options.placeholder === "object" ? options.placeholder : {};
    let heightOverrides = null;
    let widthOverrides = null;
    const AXIS_CONFIG = {
        height: {
            startProp: "top",
            endProp: "bottom",
            sizeProp: "height",
            viewportUnit: "vh",
            viewportSize: ()=>globalThis.innerHeight,
            stateKey: "heightState",
            msgType: MSG_TYPE_HEIGHT_STATE,
            getOverrides: ()=>heightOverrides,
            setOverrides: (v)=>{
                heightOverrides = v;
            }
        },
        width: {
            startProp: "left",
            endProp: "right",
            sizeProp: "width",
            viewportUnit: "vw",
            viewportSize: ()=>globalThis.innerWidth,
            stateKey: "widthState",
            msgType: MSG_TYPE_WIDTH_STATE,
            getOverrides: ()=>widthOverrides,
            setOverrides: (v)=>{
                widthOverrides = v;
            }
        }
    };
    function captureUserGeometry() {
        const s = state.get();
        const rect = container.getBoundingClientRect();
        if (s.heightState === "normal") {
            heightOverrides = {
                top: `${rect.top}px`,
                bottom: "auto",
                height: `${rect.height}px`
            };
        }
        if (s.widthState === "normal") {
            widthOverrides = {
                left: `${rect.left}px`,
                right: "auto",
                width: `${rect.width}px`
            };
        }
    }
    let draggableHandle = null;
    const resolveDragOpts = ()=>{
        const base = typeof options.draggable === "object" ? options.draggable : {};
        const defaultResetSnap = {
            isActive: ()=>{
                const s = state.get();
                return s.heightState === "maximized" && s.widthState === "maximized";
            },
            createGhost: ()=>{
                const presetStyle = {
                    ...STYLE_PRESETS[state.get().preset],
                    ...styleOverrides
                };
                const rect = container.getBoundingClientRect();
                const ghost = document.createElement("div");
                Object.assign(ghost.style, GHOST_BASE, {
                    zIndex: "10001",
                    top: `${rect.top}px`,
                    left: `${rect.left}px`,
                    width: presetStyle.width ?? "380px",
                    height: presetStyle.height ?? "520px"
                });
                return ghost;
            }
        };
        const defaultOnResetSnap = ()=>{
            const s = state.get();
            if (s.heightState === "maximized" && s.widthState === "maximized") {
                const presetStyle = {
                    ...STYLE_PRESETS[s.preset],
                    ...styleOverrides
                };
                container.style.width = presetStyle.width ?? "";
                container.style.height = presetStyle.height ?? "";
                clearAxisOverrides();
                state.update((st)=>({
                        ...st,
                        heightState: "normal",
                        widthState: "normal"
                    }));
                send(MSG_TYPE_HEIGHT_STATE, "normal");
                send(MSG_TYPE_WIDTH_STATE, "normal");
            }
        };
        const defaultOnEdgeSnap = (edge)=>{
            const rect = container.getBoundingClientRect();
            if (edge.includes("-")) {
                maximizeHeight();
                maximizeWidth();
            } else if (edge === "left" || edge === "right") {
                maximizeHeight();
                container.style.left = `${rect.left}px`;
                container.style.right = "auto";
                container.style.width = `${rect.width}px`;
            } else {
                maximizeWidth();
                container.style.top = `${rect.top}px`;
                container.style.bottom = "auto";
                container.style.height = `${rect.height}px`;
            }
        };
        const defaultOnDragEnd = ()=>{
            captureUserGeometry();
            base.onDragEnd?.();
        };
        return {
            ...base,
            edgeSnap: base.edgeSnap ?? true,
            resetSnap: base.resetSnap ?? defaultResetSnap,
            onResetSnap: base.onResetSnap ?? defaultOnResetSnap,
            onEdgeSnap: base.onEdgeSnap ?? defaultOnEdgeSnap,
            onDragEnd: defaultOnDragEnd
        };
    };
    function teardownDraggable() {
        if (draggableHandle) {
            draggableHandle.destroy();
            draggableHandle = null;
        }
    }
    function setupDraggable() {
        if (state.get().preset === "float" && options.draggable) {
            draggableHandle = makeDraggable(container, iframe, resolveDragOpts());
        }
    }
    let resizableHandle = null;
    const resolveResizeOpts = ()=>{
        const base = typeof options.resizable === "object" ? options.resizable : {};
        return {
            ...base,
            onResizeEnd: ()=>{
                const s = state.get();
                const wasNonNormal = s.heightState !== "normal" || s.widthState !== "normal";
                if (wasNonNormal) {
                    state.update((st)=>({
                            ...st,
                            heightState: "normal",
                            widthState: "normal"
                        }));
                }
                captureUserGeometry();
                if (wasNonNormal) {
                    send(MSG_TYPE_HEIGHT_STATE, "normal");
                    send(MSG_TYPE_WIDTH_STATE, "normal");
                }
                base.onResizeEnd?.();
            }
        };
    };
    function teardownResizable() {
        if (resizableHandle) {
            resizableHandle.destroy();
            resizableHandle = null;
        }
    }
    function setupResizable() {
        if (state.get().preset === "float" && options.resizable) {
            resizableHandle = makeResizable(container, iframe, resolveResizeOpts());
        }
    }
    function teardownInteractions() {
        teardownDraggable();
        teardownResizable();
    }
    function setupInteractions() {
        setupDraggable();
        setupResizable();
    }
    setupInteractions();
    function resetToPreset(presetOverride, skipAxisReapply) {
        const preset = presetOverride ?? state.get().preset;
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
        for (const [axis, cfg] of Object.entries(AXIS_CONFIG)){
            if (axis === skipAxisReapply) continue;
            const overrides = cfg.getOverrides();
            if (overrides) {
                Object.assign(container.style, overrides);
            }
        }
    }
    function clearAxisOverrides() {
        heightOverrides = null;
        widthOverrides = null;
    }
    function maximizeAxis(axis, offset) {
        if (state.get().destroyed) return;
        if (state.get().preset === "inline") {
            clog.warn(`maximize${axis === "height" ? "Height" : "Width"}() is a no-op when preset is "inline"`);
            return;
        }
        const cfg = AXIS_CONFIG[axis];
        teardownInteractions();
        resetToPreset(undefined, axis);
        let o;
        if (offset !== undefined) {
            o = offset;
        } else {
            const rect = container.getBoundingClientRect();
            const vs = cfg.viewportSize();
            if (rect.width === 0 && rect.height === 0) {
                o = 20;
            } else {
                const startDist = axis === "height" ? rect.top : rect.left;
                const endDist = vs - (axis === "height" ? rect.bottom : rect.right);
                o = Math.max(0, Math.min(startDist, endDist));
            }
        }
        const overrides = {
            [cfg.startProp]: `${o}px`,
            [cfg.endProp]: "",
            [cfg.sizeProp]: `calc(100${cfg.viewportUnit} - ${o * 2}px)`
        };
        cfg.setOverrides(overrides);
        Object.assign(container.style, overrides);
        state.update((s)=>({
                ...s,
                [cfg.stateKey]: "maximized"
            }));
        setupInteractions();
        send(cfg.msgType, "maximized");
    }
    function minimizeAxis(axis, size) {
        if (state.get().destroyed) return;
        if (state.get().preset === "inline") {
            clog.warn(`minimize${axis === "height" ? "Height" : "Width"}() is a no-op when preset is "inline"`);
            return;
        }
        const cfg = AXIS_CONFIG[axis];
        teardownInteractions();
        resetToPreset(undefined, axis);
        const overrides = {
            [cfg.sizeProp]: `${size ?? 48}px`
        };
        cfg.setOverrides(overrides);
        Object.assign(container.style, overrides);
        state.update((s)=>({
                ...s,
                [cfg.stateKey]: "minimized"
            }));
        setupInteractions();
        send(cfg.msgType, "minimized");
    }
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
        triggerEl.addEventListener("click", ()=>open());
        appendTarget.appendChild(triggerEl);
    }
    function open() {
        show();
        const small = state.get().isSmallScreen;
        if (small) {
            if (state.get().preset !== "fullscreen") {
                _setPreset("fullscreen");
                smallScreenAutoFullscreen = true;
            }
        } else if (smallScreenAutoFullscreen) {
            smallScreenAutoFullscreen = false;
            _setPreset(initialPreset);
        }
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
            setTimeout(done, parseTransitionMs(anim.transition) + 50);
        } else {
            container.style.display = "none";
        }
    }
    function toggle() {
        if (state.get().visible) hide();
        else show();
    }
    function setPreset(preset) {
        smallScreenAutoFullscreen = false;
        _setPreset(preset);
    }
    function _setPreset(preset) {
        if (state.get().destroyed) return;
        if (!(preset in STYLE_PRESETS)) {
            clog.warn(`setPreset: unknown preset "${preset}"`);
            return;
        }
        if (state.get().detached && preset === "inline") {
            dock();
            return;
        }
        teardownInteractions();
        clearAxisOverrides();
        resetToPreset(preset);
        state.update((s)=>({
                ...s,
                preset,
                heightState: "normal",
                widthState: "normal"
            }));
        setupInteractions();
        send(MSG_TYPE_PRESET, preset);
        send(MSG_TYPE_HEIGHT_STATE, "normal");
        send(MSG_TYPE_WIDTH_STATE, "normal");
    }
    function fullscreen() {
        setPreset("fullscreen");
    }
    function restore() {
        setPreset(initialPreset);
    }
    function maximizeHeight(offset) {
        maximizeAxis("height", offset);
    }
    function minimizeHeight(height) {
        minimizeAxis("height", height);
    }
    function maximizeWidth(offset) {
        maximizeAxis("width", offset);
    }
    function minimizeWidth(width) {
        minimizeAxis("width", width);
    }
    function reset() {
        if (state.get().destroyed) return;
        if (state.get().preset === "inline") {
            clog.warn(`reset() is a no-op when preset is "inline"`);
            return;
        }
        clearAxisOverrides();
        setPreset(state.get().preset);
    }
    function requestNativeFullscreen() {
        if (state.get().destroyed) return Promise.resolve();
        return iframe.requestFullscreen();
    }
    function exitNativeFullscreen() {
        if (state.get().destroyed) return Promise.resolve();
        if (!document.fullscreenElement) return Promise.resolve();
        return document.exitFullscreen();
    }
    function destroy() {
        if (state.get().destroyed) return;
        if (state.get().detached) {
            placeholderEl?.remove();
            placeholderEl = null;
        }
        teardownInteractions();
        globalThis.removeEventListener("message", handleMessage);
        globalThis.removeEventListener("resize", handleResize);
        pubsub.unsubscribeAll();
        iframe.src = "about:blank";
        container.remove();
        triggerEl?.remove();
        originalParent = null;
        presetBeforeDetach = null;
        placeholderEl = null;
        triggerEl = null;
        state.update((s)=>({
                visible: false,
                ready: false,
                destroyed: true,
                preset: s.preset,
                heightState: s.heightState,
                widthState: s.widthState,
                detached: false,
                isSmallScreen: s.isSmallScreen
            }));
    }
    let detachDockChain = Promise.resolve();
    function serializeDetachDock(task) {
        const next = detachDockChain.then(task);
        detachDockChain = next.catch(()=>{});
        return next;
    }
    async function _detach() {
        const s = state.get();
        if (s.destroyed || s.detached) return;
        if (!parentContainer) {
            clog.warn("detach() requires a parentContainer");
            return;
        }
        if (s.preset !== "inline") {
            clog.warn(`detach() only works with "inline" preset (current: "${s.preset}")`);
            return;
        }
        originalParent = parentContainer;
        presetBeforeDetach = s.preset;
        const rect = container.getBoundingClientRect();
        placeholderEl = document.createElement("div");
        const placeholderOpts = resolvePlaceholderOpts();
        Object.assign(placeholderEl.style, PLACEHOLDER_BASE);
        placeholderEl.style.width = `${rect.width}px`;
        placeholderEl.style.height = `${rect.height}px`;
        if (placeholderOpts.style) {
            Object.assign(placeholderEl.style, placeholderOpts.style);
        }
        if (placeholderOpts.content) {
            placeholderEl.innerHTML = placeholderOpts.content;
        }
        originalParent.insertBefore(placeholderEl, container);
        container.style.visibility = "hidden";
        iframe.src = await captureIframeUrlForReload();
        document.body.appendChild(container);
        const detachedPreset = state.get().isSmallScreen ? "fullscreen" : "float";
        teardownInteractions();
        clearAxisOverrides();
        resetToPreset(detachedPreset);
        state.update((st)=>({
                ...st,
                preset: detachedPreset,
                detached: true,
                heightState: "normal",
                widthState: "normal"
            }));
        setupInteractions();
        send(MSG_TYPE_DETACHED, true);
        send(MSG_TYPE_HEIGHT_STATE, "normal");
        send(MSG_TYPE_WIDTH_STATE, "normal");
    }
    async function _dock() {
        const s = state.get();
        if (s.destroyed || !s.detached) return;
        if (!originalParent || !placeholderEl) return;
        teardownInteractions();
        container.style.visibility = "hidden";
        iframe.src = await captureIframeUrlForReload();
        if (placeholderEl.parentNode === originalParent) {
            originalParent.insertBefore(container, placeholderEl);
        } else {
            clog.warn("dock(): placeholder was disconnected; appending container to original parent");
            originalParent.appendChild(container);
        }
        placeholderEl.remove();
        placeholderEl = null;
        const restorePreset = presetBeforeDetach ?? "inline";
        clearAxisOverrides();
        resetToPreset(restorePreset);
        state.update((st)=>({
                ...st,
                preset: restorePreset,
                detached: false,
                heightState: "normal",
                widthState: "normal"
            }));
        setupInteractions();
        send(MSG_TYPE_DETACHED, false);
        send(MSG_TYPE_HEIGHT_STATE, "normal");
        send(MSG_TYPE_WIDTH_STATE, "normal");
        originalParent = null;
        presetBeforeDetach = null;
    }
    function detach() {
        return serializeDetachDock(_detach);
    }
    function dock() {
        return serializeDetachDock(_dock);
    }
    function send(type, payload) {
        if (state.get().destroyed) return;
        let target;
        if (lastIframeOrigin) {
            target = lastIframeOrigin;
        } else if (origins.length === 1) {
            target = origins[0];
        } else {
            target = origins[0] || "*";
            if (!sendOriginWarned) {
                sendOriginWarned = true;
                clog.warn(`send() called before any iframe message with multiple allowedOrigin entries; ` + `targeting "${target}". Subsequent sends will use the iframe's actual origin.`);
            }
        }
        iframe.contentWindow?.postMessage({
            type: `${MSG_PREFIX}${type}`,
            payload
        }, target);
    }
    function onMessage(type, handler) {
        const prefixedType = `${MSG_PREFIX}${type}`;
        return pubsub.subscribe(prefixedType, handler);
    }
    return {
        open,
        show,
        hide,
        toggle,
        destroy,
        setPreset,
        fullscreen,
        restore,
        maximizeHeight,
        minimizeHeight,
        maximizeWidth,
        minimizeWidth,
        reset,
        requestNativeFullscreen,
        exitNativeFullscreen,
        detach,
        dock,
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
        },
        get placeholder () {
            return placeholderEl;
        }
    };
}
const STATIC_PROPS = {
    MSG_PREFIX,
    MSG_TYPE_READY,
    MSG_TYPE_OPEN,
    MSG_TYPE_FULLSCREEN,
    MSG_TYPE_RESTORE,
    MSG_TYPE_MAXIMIZE_HEIGHT,
    MSG_TYPE_MINIMIZE_HEIGHT,
    MSG_TYPE_MAXIMIZE_WIDTH,
    MSG_TYPE_MINIMIZE_WIDTH,
    MSG_TYPE_RESET,
    MSG_TYPE_HIDE,
    MSG_TYPE_DESTROY,
    MSG_TYPE_SET_PRESET,
    MSG_TYPE_DETACH,
    MSG_TYPE_DOCK,
    MSG_TYPE_NATIVE_FULLSCREEN,
    MSG_TYPE_EXIT_NATIVE_FULLSCREEN,
    MSG_TYPE_HEIGHT_STATE,
    MSG_TYPE_WIDTH_STATE,
    MSG_TYPE_DETACHED,
    MSG_TYPE_IS_SMALL_SCREEN,
    MSG_TYPE_PRESET,
    MSG_TYPE_REQUEST_HASH,
    MSG_TYPE_HASH_REPORT
};
const provideWidget = Object.assign(_provideWidget, STATIC_PROPS);
export { isOriginAllowed as isOriginAllowed, parseTransitionMs as parseTransitionMs, provideWidget as provideWidget, resolveAllowedOrigins as resolveAllowedOrigins, resolveAnimateConfig as resolveAnimateConfig };
export { makeDraggable as makeDraggable, resolveEdge as resolveEdge };
export { makeResizable as makeResizable };
export { ANIMATE_PRESETS as ANIMATE_PRESETS, GHOST_BASE as GHOST_BASE, IFRAME_BASE as IFRAME_BASE, PLACEHOLDER_BASE as PLACEHOLDER_BASE, STYLE_PRESETS as STYLE_PRESETS };
