/**
 * Gives the DOM runner the pointer-capture methods Radix Select calls when it
 * opens, which it lacks.
 */
export function stubRadixPointer(): void {
  Object.assign(HTMLElement.prototype, {
    hasPointerCapture: () => false,
    releasePointerCapture: () => {},
  });
}
