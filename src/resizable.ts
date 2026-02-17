import type { ResizableHandle, ResizableOptions } from "./types.ts";
import { iconResize } from "./iconResize.ts";

const DEFAULT_HANDLE_SIZE = 20;
const DEFAULT_MIN_WIDTH = 200;
const DEFAULT_MIN_HEIGHT = 150;
const DEFAULT_BOUNDARY_PADDING = 20;

/**
 * Make a fixed-position container resizable via a corner handle at the bottom-right.
 *
 * Uses the Pointer Events API for unified mouse + touch support.
 * The handle uses `setPointerCapture` so all move/up events are reliably delivered
 * even when the pointer leaves the element.
 */
export function makeResizable(
	container: HTMLElement,
	iframe: HTMLIFrameElement,
	options: ResizableOptions = {},
): ResizableHandle {
	const handleSize = options.handleSize ?? DEFAULT_HANDLE_SIZE;
	const boundaryPadding = options.boundaryPadding ?? DEFAULT_BOUNDARY_PADDING;
	const minWidth = options.minWidth ?? DEFAULT_MIN_WIDTH;
	const minHeight = options.minHeight ?? DEFAULT_MIN_HEIGHT;

	// --- handle element (corner grip at bottom-right) ---
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
		color: "#808080",
	} satisfies Partial<CSSStyleDeclaration>);

	if (options.handleStyle) {
		Object.assign(handle.style, options.handleStyle);
	}

	// resize icon
	handle.innerHTML = iconResize;
	const svg = handle.querySelector("svg");
	if (svg) {
		svg.style.width = "100%";
		svg.style.height = "100%";
		svg.style.pointerEvents = "none";
	}

	// insert handle as an overlay (no layout impact on iframe)
	container.style.position ||= "relative";
	container.appendChild(handle);

	// --- resize state ---
	let isResizing = false;
	let startX = 0;
	let startY = 0;
	let startWidth = 0;
	let startHeight = 0;
	let savedTransition = "";

	function onPointerDown(e: PointerEvent): void {
		if (e.button !== 0) return; // left button only
		e.preventDefault();
		handle.setPointerCapture(e.pointerId);

		isResizing = true;

		// suppress CSS transitions during resize
		savedTransition = container.style.transition;
		container.style.transition = "none";

		// convert from bottom/right to top/left positioning so
		// the top-left corner stays pinned while bottom-right follows the pointer
		const rect = container.getBoundingClientRect();
		container.style.top = `${rect.top}px`;
		container.style.left = `${rect.left}px`;
		container.style.bottom = "auto";
		container.style.right = "auto";

		startX = e.clientX;
		startY = e.clientY;
		startWidth = rect.width;
		startHeight = rect.height;

		// prevent iframe from stealing events
		iframe.style.pointerEvents = "none";

		handle.addEventListener("pointermove", onPointerMove);
		handle.addEventListener("pointerup", onPointerUp);
		handle.addEventListener("pointercancel", onPointerUp);
	}

	function onPointerMove(e: PointerEvent): void {
		if (!isResizing) return;

		const dx = e.clientX - startX;
		const dy = e.clientY - startY;

		const maxW =
			options.maxWidth ?? globalThis.innerWidth - boundaryPadding;
		const maxH =
			options.maxHeight ?? globalThis.innerHeight - boundaryPadding;

		let newWidth = startWidth + dx;
		let newHeight = startHeight + dy;

		// clamp to min/max
		newWidth = Math.max(minWidth, Math.min(newWidth, maxW));
		newHeight = Math.max(minHeight, Math.min(newHeight, maxH));

		// ensure we don't exceed viewport boundary from current position
		const containerLeft = container.getBoundingClientRect().left;
		const containerTop = container.getBoundingClientRect().top;
		newWidth = Math.min(
			newWidth,
			globalThis.innerWidth - containerLeft - boundaryPadding,
		);
		newHeight = Math.min(
			newHeight,
			globalThis.innerHeight - containerTop - boundaryPadding,
		);

		container.style.width = `${newWidth}px`;
		container.style.height = `${newHeight}px`;
	}

	function onPointerUp(e: PointerEvent): void {
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

	// --- public API ---
	function resetSize(): void {
		container.style.width = "";
		container.style.height = "";
	}

	function destroy(): void {
		handle.removeEventListener("pointerdown", onPointerDown);
		if (isResizing) {
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
		resetSize,
	};
}
