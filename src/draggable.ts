import type { DraggableHandle, DraggableOptions } from "./types.ts";

const DEFAULT_HANDLE_HEIGHT = 24;
const DEFAULT_BOUNDARY_PADDING = 20;

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

	// --- handle element ---
	const handle = document.createElement("div");
	Object.assign(
		handle.style,
		{
			width: "100%",
			height: `${handleHeight}px`,
			cursor: "grab",
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
			userSelect: "none",
			touchAction: "none",
			flexShrink: "0",
		} satisfies Partial<CSSStyleDeclaration>,
	);

	if (options.handleStyle) {
		Object.assign(handle.style, options.handleStyle);
	}

	// grip indicator
	const grip = document.createElement("span");
	Object.assign(
		grip.style,
		{
			width: "32px",
			height: "4px",
			borderRadius: "2px",
			background: "rgba(128,128,128,0.35)",
			pointerEvents: "none",
		} satisfies Partial<CSSStyleDeclaration>,
	);
	handle.appendChild(grip);

	// insert handle before iframe and adjust iframe height
	container.insertBefore(handle, iframe);
	iframe.style.height = `calc(100% - ${handleHeight}px)`;

	// --- drag state ---
	let isDragging = false;
	let startX = 0;
	let startY = 0;
	let startLeft = 0;
	let startTop = 0;
	let savedTransition = "";

	function onPointerDown(e: PointerEvent): void {
		if (e.button !== 0) return; // left button only
		e.preventDefault();
		handle.setPointerCapture(e.pointerId);

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
		handle.removeEventListener("pointerdown", onPointerDown);
		if (isDragging) {
			iframe.style.pointerEvents = "";
			container.style.transition = savedTransition;
		}
		handle.remove();
		iframe.style.height = "100%";
	}

	return {
		get handleEl() {
			return handle;
		},
		destroy,
		resetPosition,
	};
}
