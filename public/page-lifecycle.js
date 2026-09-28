// Each screen owns its subscriptions and asynchronous work. The router disposes
// them before mounting another screen into the persistent document.
export function createPageScope(host = window) {
  let disposed = false;
  let beforeLeave = () => true;
  const cleanups = [];
  const timeoutIds = new Set();
  const intervalIds = new Set();
  const frameIds = new Set();
  const controllers = new Set();
  const alive = callback => (...args) => { if (!disposed) return callback(...args); };
  const setTimeout = (callback, delay, ...args) => {
    const id = host.setTimeout(() => { timeoutIds.delete(id); if (!disposed) callback(...args); }, delay);
    timeoutIds.add(id); return id;
  };
  const clearTimeout = id => { timeoutIds.delete(id); host.clearTimeout(id); };
  const setInterval = (callback, delay, ...args) => {
    const id = host.setInterval(alive(() => callback(...args)), delay); intervalIds.add(id); return id;
  };
  const clearInterval = id => { intervalIds.delete(id); host.clearInterval(id); };
  const requestAnimationFrame = callback => {
    const id = host.requestAnimationFrame(time => { frameIds.delete(id); if (!disposed) callback(time); });
    frameIds.add(id); return id;
  };
  const cancelAnimationFrame = id => { frameIds.delete(id); host.cancelAnimationFrame(id); };
  const observer = Native => Native && class extends Native {
    constructor(callback) { super(alive(callback)); cleanups.push(() => this.disconnect()); }
  };
  const resources = { setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame, cancelAnimationFrame,
    ResizeObserver: observer(host.ResizeObserver), MutationObserver: observer(host.MutationObserver) };
  function scopedTarget(target) {
    return new Proxy(target, { get(object, key) {
      if (key in resources) return resources[key];
      if (key === "addEventListener") return (type, callback, options) => {
        object.addEventListener(type, callback, options);
        cleanups.push(() => object.removeEventListener(type, callback, options));
      };
      const value = Reflect.get(object, key, object);
      return typeof value === "function" ? value.bind(object) : value;
    } });
  }
  // Responses belonging to a departed screen must not reach its continuation,
  // including a body read that completes after navigation.
  const never = () => new Promise(() => {});
  const fetch = async (input, options = {}) => {
    if (disposed) return never();
    const controller = new AbortController();
    controllers.add(controller);
    const abort = () => controller.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    try {
      const response = await host.fetch(input, { ...options, signal: controller.signal });
      if (disposed) return never();
      return new Proxy(response, { get(object, key) {
        const value = Reflect.get(object, key, object);
        if (["json", "text", "blob", "arrayBuffer", "formData"].includes(key)) return async () => {
          try { const body = await value.call(object); return disposed ? never() : body; }
          catch (error) { if (disposed) return never(); throw error; }
          finally { controllers.delete(controller); options.signal?.removeEventListener("abort", abort); }
        };
        return typeof value === "function" ? value.bind(object) : value;
      } });
    } catch (error) {
      controllers.delete(controller); options.signal?.removeEventListener("abort", abort);
      if (disposed) return never();
      throw error;
    }
  };
  return {
    ...resources, window: scopedTarget(host), document: scopedTarget(host.document), fetch,
    onBeforeLeave(callback) { beforeLeave = callback; },
    onDispose(callback) { if (disposed) callback(); else cleanups.push(callback); },
    isActive: () => !disposed,
    canLeave: context => beforeLeave(context),
    dispose() {
      disposed = true;
      cleanups.forEach(cleanup => cleanup());
      timeoutIds.forEach(id => host.clearTimeout(id));
      intervalIds.forEach(id => host.clearInterval(id));
      frameIds.forEach(id => host.cancelAnimationFrame(id));
      controllers.forEach(controller => controller.abort());
      cleanups.length = 0; timeoutIds.clear(); intervalIds.clear(); frameIds.clear(); controllers.clear();
    },
  };
}
