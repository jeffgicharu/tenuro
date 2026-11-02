import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// relay-test-utils' mock environment calls jest.fn() internally; Vitest's vi is compatible.
vi.stubGlobal('jest', vi);

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

// jsdom has no layout engine; MUI and the grid need these browser APIs to exist.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

// Desktop layout by default; a test opts into the phone layout by setting window.__narrow first.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn((query: string) => {
    const narrow = (window as unknown as { __narrow?: boolean }).__narrow === true;
    const matches = /max-width/.test(query) ? narrow : /min-width/.test(query) ? !narrow : false;
    return {
      matches, media: query, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    };
  }),
});

window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
Element.prototype.scrollIntoView = () => undefined;
