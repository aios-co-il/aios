/** a / b, or 0 when b is not positive. */
export function ratio(a: number, b: number): number {
  return b > 0 ? a / b : 0;
}
