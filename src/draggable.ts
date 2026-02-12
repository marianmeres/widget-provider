import type {
	DraggableHandle,
	DraggableOptions,
	EdgeSnapOptions,
	SnapEdge,
} from "./types.ts";
import { iconGrip } from "./iconGrip.ts";

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
			top: "0",
			left: "0",
			zIndex: "1",
			width: `${handleHeight}px`,
			height: `${handleHeight}px`,
			cursor: "grab",
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
			userSelect: "none",
			touchAction: "none",
			opacity: "0.4",
			color: "inherit",
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

	function createGhost(edge: SnapEdge): HTMLElement {
		const ghost = document.createElement("div");
		const rect = container.getBoundingClientRect();
		const vw = globalThis.innerWidth;
		const vh = globalThis.innerHeight;

		Object.assign(
			ghost.style,
			{
				position: "fixed",
				boxSizing: "border-box",
				border: "2px dashed rgba(128, 128, 128, 0.5)",
				borderRadius: "8px",
				background: "rgba(128, 128, 128, 0.1)",
				zIndex: "9999",
				pointerEvents: "none",
				transition: "opacity 150ms ease",
				opacity: "0",
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

		document.body.appendChild(ghost);
		requestAnimationFrame(() => {
			ghost.style.opacity = "1";
		});

		return ghost;
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
				ghostEl = createGhost(edge);
				snapPending = true;
			}, dwellMs);
		} else if (wantReset) {
			dwellTimer = setTimeout(() => {
				dwellTimer = null;
				ghostEl = options.resetSnap!.createGhost();
				document.body.appendChild(ghostEl);
				requestAnimationFrame(() => {
					ghostEl!.style.opacity = "1";
				});
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
		if (!isCancel && snapPending && activeEdge && onEdgeSnap) {
			const edge = activeEdge;
			cancelSnap();
			// Defer: callback triggers maximizeAxis -> teardownInteractions ->
			// destroy() on this draggable. Must complete after this handler.
			queueMicrotask(() => onEdgeSnap(edge));
		} else if (!isCancel && resetPending && options.onResetSnap) {
			cancelSnap();
			queueMicrotask(() => options.onResetSnap!());
		} else {
			cancelSnap();
		}
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
