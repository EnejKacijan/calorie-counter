// A route announcement is not an interactive selection. Keep a semantic,
// programmatically focused heading for assistive navigation, but never turn
// a date button, editor, or arbitrary first control into the route target.
export const routeHeadingSelector = 'h1:not([role]):not([contenteditable])';

export function focusRouteHeading(document) {
  const heading = [...document.querySelectorAll(routeHeadingSelector)].find(element =>
    element.getClientRects().length && !element.closest('[hidden], [inert], [aria-hidden="true"]')
  );
  if (!heading) return false;
  heading.tabIndex = -1;
  // Apply before focus(), in the same route-commit task and before motion.
  // Only this non-interactive heading is quiet; keyboard controls keep their
  // ordinary :focus-visible styling regardless of input modality.
  heading.setAttribute('data-intake-route-focus', 'heading');
  heading.focus({ preventScroll: true });
  if (document.activeElement === heading) return true;
  heading.removeAttribute('data-intake-route-focus');
  return false;
}
