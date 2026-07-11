// Shared test setup for frontend (jsdom) tests: browser API polyfills that
// jsdom does not implement but the app expects to exist.
import "@testing-library/jest-dom/vitest";

// matchMedia — used by mobile/desktop gating and theme detection.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

// IntersectionObserver — used by CountUp and lazy-render components.
if (!(window as any).IntersectionObserver) {
  (window as any).IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  };
}

// ResizeObserver — used by Radix UI and recharts.
if (!(window as any).ResizeObserver) {
  (window as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// scrollTo with options object is not implemented in jsdom.
window.scrollTo = () => {};
Element.prototype.scrollTo = () => {};
Element.prototype.scrollIntoView = () => {};

// Radix uses PointerEvent APIs jsdom lacks.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}

// pdfjs-dist (imported by DeliveryNoteCard) touches canvas APIs at module load.
if (!(globalThis as any).DOMMatrix) {
  (globalThis as any).DOMMatrix = class DOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    constructor(_init?: unknown) {}
    static fromMatrix() {
      return new (globalThis as any).DOMMatrix();
    }
  };
}
if (!(globalThis as any).Path2D) {
  (globalThis as any).Path2D = class Path2D {
    addPath() {}
    moveTo() {}
    lineTo() {}
    closePath() {}
  };
}
if (!(globalThis as any).ImageData) {
  (globalThis as any).ImageData = class ImageData {
    width = 0;
    height = 0;
    data = new Uint8ClampedArray(0);
    constructor(w?: number, h?: number) {
      this.width = w ?? 0;
      this.height = h ?? 0;
    }
  };
}
// URL.createObjectURL is missing in jsdom (used for blob previews).
if (!URL.createObjectURL) {
  URL.createObjectURL = () => "blob:test";
  URL.revokeObjectURL = () => {};
}
