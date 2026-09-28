// Acceptance runs execute prior assertions without regenerating their galleries.
// Keep requested Prompt 9 images and any failure evidence; screenshots are not
// used as test inputs by these runners.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const launch=chromium.launch.bind(chromium);
chromium.launch=async function(...args){
 const browser=await launch(...args),newContext=browser.newContext.bind(browser);
 browser.newContext=async function(...args){const context=await newContext(...args);context.on('page',page=>{
  const screenshot=page.screenshot.bind(page);page.screenshot=options=>{
   const path=String(options?.path||'');
   if(path.includes('interaction-hardening')||/fail|error/i.test(path)||!path)return screenshot(options);
   return Promise.resolve(Buffer.alloc(0));
  };
 });return context;};return browser;
};
