import "@testing-library/jest-dom";

// Polyfills for layout engines (ELK.js, React Flow) in jsdom test environment
if (typeof (globalThis as any).DOMMatrixReadOnly === "undefined") {
  (globalThis as any).DOMMatrixReadOnly = class DOMMatrixReadOnly {
    m22 = 1;
    constructor(_transform?: string) {}
  };
}

// Ensure elements in jsdom have non-zero dimensions based on inline styles or default hints
if (typeof window !== "undefined" && window.HTMLElement) {
  Object.defineProperties(window.HTMLElement.prototype, {
    offsetWidth: {
      get() {
        return parseFloat(this.style.width) || 120;
      },
    },
    offsetHeight: {
      get() {
        return parseFloat(this.style.height) || 40;
      },
    },
  });

  window.Element.prototype.getBoundingClientRect = function () {
    const width = parseFloat((this as HTMLElement).style?.width) || 120;
    const height = parseFloat((this as HTMLElement).style?.height) || 40;
    return {
      x: 0,
      y: 0,
      width,
      height,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
      toJSON() {
        return this;
      },
    };
  };
}

if (typeof globalThis.ResizeObserver === "undefined") {
  class MockResizeObserver {
    callback: ResizeObserverCallback;
    constructor(cb: ResizeObserverCallback) {
      this.callback = cb;
    }
    observe(target: Element) {
      this.callback([{ target } as any], this as any);
    }
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = MockResizeObserver as any;
}


