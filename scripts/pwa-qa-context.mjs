export const pwaAudit = process.env.INTAKE_PWA_AUDIT === "1";
export const pwaPhones = [{ width: 375, height: 667 }, { width: 390, height: 844 }, { width: 393, height: 852 }, { width: 430, height: 932 }];
export const qaWidths = () => pwaAudit ? pwaPhones.map(phone => phone.width) : [320, 390, 430];
export const qaHeight = width => pwaAudit ? pwaPhones.find(phone => phone.width === width)?.height || 844 : 844;
export const pwaOptions = width => pwaAudit && pwaPhones.some(phone => phone.width === width) ? { viewport: { width, height: qaHeight(width) }, isMobile: true, hasTouch: true } : {};
export const qaOutput = name => pwaAudit ? `artifacts/progress/pwa-audit/${name}` : `artifacts/${name}`;
export async function preparePwa(context, width) {
  if (!pwaAudit || !pwaPhones.some(phone => phone.width === width)) return;
  await context.addInitScript(() => Object.defineProperty(navigator, "standalone", { configurable: true, value: true }));
}
export async function preparePwaPage(page) {
  const width = page.viewportSize()?.width;
  if (!pwaAudit || !pwaPhones.some(phone => phone.width === width)) return;
  const cdp = await page.context().newCDPSession(page);
  const top = width === 375 ? 20 : width === 390 ? 47 : 59;
  const bottom = width === 375 ? 0 : 34;
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top, topMax: top, bottom, bottomMax: bottom, left: 0, leftMax: 0, right: 0, rightMax: 0 } });
}
