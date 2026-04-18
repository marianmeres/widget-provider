import type {
	DraggableHandle,
	DraggableOptions,
	EdgeSnapOptions,
	SnapEdge,
} from "./types.ts";
import { iconGrip } from "./iconGrip.ts";
import { GHOST_BASE } from "./style-presets.ts";

const DEFAULT_HANDLE_HEIGHT = 24;
const DEFAULT_BOUNDARY_PADDING = 20;
const DEFAULT_DWELL_MS = 500;

/**
 * Pure edge-resolution logic: given which viewport edges are touched,
 * return the single active edge or `null` if ambiguous (corner) or none.
 */
export function resolveEdge(
	atLeft: boolean,
	atRight: boolean,
	atTop: boolean,
	atBottom: boolean,
): SnapEdge | null {
	const count = [atLeft, atRight, atTop, atBottom].filter(Boolean).length;
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

/**
 * Make a fixed-position container draggable via a handle bar inserted at the top.
 *
 * Uses the Pointer Events API for unified mouse + touch support.
 * The handle uses `setPointerCapture` so all move/up events are reliably delivered
 * even when the pointer leaves the element.
 */
export function makeDraggable(
	container: HTMLElement,
	iframe: HTMLIFrameElement,
	options: DraggableOptions = {},
): DraggableHandle {
	const handleHeight = options.handleHeight ?? DEFAULT_HANDLE_HEIGHT;
	const boundaryPadding = options.boundaryPadding ?? DEFAULT_BOUNDARY_PADDING;

	// --- edge snap options ---
	const edgeSnapEnabled = options.edgeSnap !== false &&
		(!!options.edgeSnap || !!options.onEdgeSnap);
	const edgeSnapOpts: EdgeSnapOptions = typeof options.edgeSnap === "object"
		? options.edgeSnap
		: {};
	const dwellMs = edgeSnapOpts.dwellMs ?? DEFAULT_DWELL_MS;
	const onEdgeSnap = options.onEdgeSnap;

	// --- handle element (floating grip in top-left corner) ---
	const handle = document.createElement("div");
	Object.assign(
		handle.style,
		{
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
			color: "#808080",
		} satisfies Partial<CSSStyleDeclaration>,
	);

	if (options.handleStyle) {
		Object.assign(handle.style, options.handleStyle);
	}

	// grip icon
	handle.innerHTML = iconGrip;
	const svg = handle.querySelector("svg");
	if (svg) {
		svg.style.width = "100%";
		svg.style.height = "100%";
		svg.style.pointerEvents = "none";
	}

	// insert handle as an overlay (no layout impact on iframe)
	container.style.position ||= "relative";
	container.appendChild(handle);

	// --- drag state ---
	let isDragging = false;
	let startX = 0;
	let startY = 0;
	let startLeft = 0;
	let startTop = 0;
	let savedTransition = "";

	// --- snap state (shared by edge-snap and reset-snap) ---
	let dwellTimer: ReturnType<typeof setTimeout> | null = null;
	let activeEdge: SnapEdge | null = null;
	let ghostEl: HTMLElement | null = null;
	let snapPending = false;
	let resetPending = false;

	function detectEdge(newLeft: number, newTop: number): SnapEdge | null {
		if (!edgeSnapEnabled) return null;
		const vw = globalThis.innerWidth;
		const vh = globalThis.innerHeight;
		const cw = container.offsetWidth;
		const ch = container.offsetHeight;
		return resolveEdge(
			newLeft <= boundaryPadding,
			newLeft >= vw - cw - boundaryPadding,
			newTop <= boundaryPadding,
			newTop >= vh - ch - boundaryPadding,
		);
	}

	/**
	 * Build the built-in edge-snap ghost. Returns the element WITHOUT appending
	 * to the DOM — the caller is responsible for appending and animating-in.
	 * This matches the contract of user-supplied `resetSnap.createGhost`.
	 */
	function buildEdgeGhost(edge: SnapEdge): HTMLElement {
		const ghost = document.createElement("div");
		const rect = container.getBoundingClientRect();
		const vw = globalThis.innerWidth;
		const vh = globalThis.innerHeight;

		Object.assign(
			ghost.style,
			GHOST_BASE,
			{
				zIndex: "9999",
			} satisfies Partial<CSSStyleDeclaration>,
		);

		if (edge.includes("-")) {
			// Corner: maximize both axes preview — full viewport
			ghost.style.top = `${boundaryPadding}px`;
			ghost.style.left = `${boundaryPadding}px`;
			ghost.style.width = `${vw - boundaryPadding * 2}px`;
			ghost.style.height = `${vh - boundaryPadding * 2}px`;
		} else if (edge === "left" || edge === "right") {
			// Maximize height preview: full viewport height, same width/left
			ghost.style.top = `${boundaryPadding}px`;
			ghost.style.left = `${rect.left}px`;
			ghost.style.width = `${rect.width}px`;
			ghost.style.height = `${vh - boundaryPadding * 2}px`;
		} else {
			// Maximize width preview: full viewport width, same height/top
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

	/** Append a freshly-built ghost element and kick off the fade-in. */
	function mountGhost(el: HTMLElement): void {
		document.body.appendChild(el);
		requestAnimationFrame(() => {
			el.style.opacity = "1";
		});
	}

	function removeGhost(): void {
		if (ghostEl) {
			ghostEl.remove();
			ghostEl = null;
		}
	}

	function cancelSnap(): void {
		if (dwellTimer !== null) {
			clearTimeout(dwellTimer);
			dwellTimer = null;
		}
		activeEdge = null;
		snapPending = false;
		resetPending = false;
		removeGhost();
	}

	function onPointerDown(e: PointerEvent): void {
		if (e.button !== 0) return; // left button only
		e.preventDefault();
		e.stopPropagation();
		handle.setPointerCapture(e.pointerId);

		cancelSnap();

		isDragging = true;
		handle.style.cursor = "grabbing";

		// suppress CSS transitions during drag
		savedTransition = container.style.transition;
		container.style.transition = "none";

		// convert from bottom/right to top/left positioning
		const rect = container.getBoundingClientRect();
		container.style.top = `${rect.top}px`;
		container.style.left = `${rect.left}px`;
		container.style.bottom = "auto";
		container.style.right = "auto";

		startX = e.clientX;
		startY = e.clientY;
		startLeft = rect.left;
		startTop = rect.top;

		// prevent iframe from stealing events
		iframe.style.pointerEvents = "none";

		handle.addEventListener("pointermove", onPointerMove);
		handle.addEventListener("pointerup", onPointerUp);
		handle.addEventListener("pointercancel", onPointerUp);

		options.onDragStart?.();
	}

	function onPointerMove(e: PointerEvent): void {
		if (!isDragging) return;

		const dx = e.clientX - startX;
		const dy = e.clientY - startY;

		const vw = globalThis.innerWidth;
		const vh = globalThis.innerHeight;
		const cw = container.offsetWidth;
		const ch = container.offsetHeight;

		const newLeft = Math.max(
			boundaryPadding,
			Math.min(startLeft + dx, vw - cw - boundaryPadding),
		);
		const newTop = Math.max(
			boundaryPadding,
			Math.min(startTop + dy, vh - ch - boundaryPadding),
		);

		container.style.left = `${newLeft}px`;
		container.style.top = `${newTop}px`;

		// --- snap detection (edge-snap and reset-snap) ---
		if (!edgeSnapEnabled && !options.resetSnap) return;

		const edge = detectEdge(newLeft, newTop);
		const wantReset = !edge && !!options.resetSnap?.isActive();

		// No state change — stay in current snap mode
		if (edge && edge === activeEdge) return;
		if (wantReset && (resetPending || (dwellTimer && !activeEdge))) return;

		cancelSnap();

		if (edge) {
			activeEdge = edge;
			dwellTimer = setTimeout(() => {
				dwellTimer = null;
				ghostEl = buildEdgeGhost(edge);
				mountGhost(ghostEl);
				snapPending = true;
			}, dwellMs);
		} else if (wantReset) {
			dwellTimer = setTimeout(() => {
				dwellTimer = null;
				ghostEl = options.resetSnap!.createGhost();
				mountGhost(ghostEl);
				resetPending = true;
			}, dwellMs);
		}
	}

	function onPointerUp(e: PointerEvent): void {
		if (!isDragging) return;
		isDragging = false;
		handle.style.cursor = "grab";
		iframe.style.pointerEvents = "";
		container.style.transition = savedTransition;

		handle.releasePointerCapture(e.pointerId);
		handle.removeEventListener("pointermove", onPointerMove);
		handle.removeEventListener("pointerup", onPointerUp);
		handle.removeEventListener("pointercancel", onPointerUp);

		// --- snap on release ---
		const isCancel = e.type === "pointercancel";
		const snapFire = !isCancel && snapPending && activeEdge && onEdgeSnap;
		const resetFire = !isCancel && resetPending && options.onResetSnap;
		const edgeCaptured = activeEdge;
		cancelSnap();

		// Defer: callbacks may teardown/destroy this handle; must complete
		// after this event handler returns so listener cleanup doesn't race.
		queueMicrotask(() => {
			options.onDragEnd?.();
			if (snapFire && edgeCaptured) onEdgeSnap!(edgeCaptured);
			else if (resetFire) options.onResetSnap!();
		});
	}

	handle.addEventListener("pointerdown", onPointerDown);

	// --- public API ---
	function resetPosition(): void {
		container.style.top = "";
		container.style.left = "";
		container.style.bottom = "";
		container.style.right = "";
	}

	function destroy(): void {
		cancelSnap();
		handle.removeEventListener("pointerdown", onPointerDown);
		if (isDragging) {
			iframe.style.pointerEvents = "";
			container.style.transition = savedTransition;
		}
		handle.remove();
	}

	return {
		get handleEl() {
			return handle;
		},
		destroy,
		resetPosition,
	};
}
