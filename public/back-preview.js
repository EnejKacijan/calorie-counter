// A lightweight, inert navigation preview, prepared BEFORE the shared Add
// editor replaces its browse state. The live child is always the moving node.
// Shadow scoping keeps the existing ID-based visual rules without introducing
// duplicate document IDs, event handlers, focus targets or another form owner.
export function captureBackPreview(source, win = window) {
  if (!source?.isConnected) return null;
  const doc = win.document;
  let css;
  try { css = [...doc.styleSheets].map(sheet => [...sheet.cssRules].map(rule => rule.cssText).join('\n')).join('\n'); }
  catch { return null; } // No accurately styled parent: don't intercept Back.
  const host = doc.createElement('div');
  host.className = 'add-back-preview'; host.inert = true; host.hidden = true;
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:absolute;inset:0;overflow:clip;pointer-events:none;z-index:0;';
  const shadow = host.attachShadow({mode:'closed'}), style = doc.createElement('style');
  style.textContent = css + '\n*{animation:none!important;transition:none!important;caret-color:transparent!important;} .add-flow-surface{--add-height:100dvh!important;--add-top:0px!important;}';
  const body = doc.createElement('body');
  body.className = doc.body.className;
  for (const {name,value} of doc.body.attributes) if (name.startsWith('data-')) body.setAttribute(name,value);
  const copy = source.cloneNode(true);
  const originals = [source,...source.querySelectorAll('*')], copies = [copy,...copy.querySelectorAll('*')];
  const scrolls = originals.map((node,i) => ({node:copies[i],top:node.scrollTop,left:node.scrollLeft})).filter(position => position.top || position.left);
  // No scripts occur in the Add stage. Preserve native input rendering and
  // local scrollers, not listeners or app/controller references.
  originals.forEach((node,i) => {
    const clone = copies[i]; if (!clone) return;
    if (node.matches('input,textarea,select')) clone.value = node.value;
    if (node.matches('input')) clone.checked = node.checked;
  });
  copy.querySelectorAll('script,[autofocus]').forEach(node => node.matches('script') ? node.remove() : node.removeAttribute('autofocus'));
  copy.querySelectorAll('[data-keyboard]').forEach(node => node.dataset.keyboard='false');
  const frame = doc.createElement('div'); frame.className='add-flow-host';
  frame.append(copy); body.append(frame); shadow.append(style,body); source.before(host);
  return {
    show() {
      const theme = doc.body.getAttribute('data-theme');
      if (theme === null) body.removeAttribute('data-theme'); else body.setAttribute('data-theme',theme);
      host.hidden = false;
      scrolls.forEach(({node,top,left}) => { node.scrollTop = top; node.scrollLeft = left; });
    },
    hide() { host.hidden = true; },
    dispose() { host.remove(); },
  };
}
