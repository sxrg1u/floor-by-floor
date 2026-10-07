// Pixel toasts (top right).
export function toast(g, text, kind = 'neutral') {
  g.toasts.push({ text, kind, born: performance.now() });
  if (g.toasts.length > 4) g.toasts.shift();
}
