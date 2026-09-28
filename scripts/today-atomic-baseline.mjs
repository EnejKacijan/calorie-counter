import {readFile,writeFile,access} from 'node:fs/promises';
// The seven primary files were copied before any production edit. Supplement
// unchanged route templates with their original cache tokens: otherwise route
// prewarming adds styles.css?v=71 after bottom-navigation.css, a mixed-build
// fixture (not the actual baseline) that hides the footer via stylesheet order.
export async function prepareBaseline(root){
 if(!root)return;
 for(const page of ['assistant','progress','profile']){
  const file=`${root}/${page}.html`;
  try{await access(file);}catch{
   const source=await readFile(`public/${page}.html`,'utf8');
   await writeFile(file,source.replace('styles.css?v=71','styles.css?v=70').replace('app-start.js?v=9','app-start.js?v=8'));
  }
 }
 const add=`${root}/add-surface.js`;
 try{await access(add);}catch{await writeFile(add,(await readFile('public/add-surface.js','utf8')).replace('motion.js?v=7','motion.js?v=6'));}
}
