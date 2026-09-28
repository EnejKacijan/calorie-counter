// Run existing assertions without regenerating unrelated screenshot galleries.
// Failure evidence and pathless screenshots used as test inputs remain real.
const pw=require(process.env.PLAYWRIGHT_MODULE||'playwright');
for(const engine of ['chromium','webkit']){
 const launch=pw[engine].launch.bind(pw[engine]);
 pw[engine].launch=async function(...args){const browser=await launch(...args),create=browser.newContext.bind(browser);
  browser.newContext=async function(...args){const context=await create(...args);context.on('page',page=>{const shot=page.screenshot.bind(page);page.screenshot=options=>!options?.path||/fail|error/i.test(String(options.path))?shot(options):Promise.resolve(Buffer.alloc(0));});return context;};return browser;};
}
