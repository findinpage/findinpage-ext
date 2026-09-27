import { vi } from 'vitest';

Object.defineProperty(Element.prototype, 'getClientRects', {
  configurable: true,
  value: () => [{ width: 100, height: 20 }],
});
Object.defineProperty(Range.prototype, 'getClientRects', {
  configurable: true,
  value: () => [{ width: 40, height: 16 }],
});
Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
  configurable: true,
  value: () => ({ left: 0, top: 0, right: 40, bottom: 16, width: 40, height: 16 }),
});
Object.defineProperty(Element.prototype, 'getBoundingClientRect', {
  configurable: true,
  value: () => ({ left: 0, top: 0, right: 200, bottom: 40, width: 200, height: 40 }),
});
Element.prototype.scrollIntoView = vi.fn();
Element.prototype.scrollBy = vi.fn();
window.scrollBy = vi.fn();
window.requestAnimationFrame = (callback) => window.setTimeout(() => callback(performance.now()), 0);
window.cancelAnimationFrame = (id) => window.clearTimeout(id);
