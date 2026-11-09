/** True when this page is inside another page's frame. */
export function isFramed(): boolean {
  try {
    return window.top !== window.self;
  } catch {
    // A cross-origin parent throws on access: that is a frame too.
    return true;
  }
}
