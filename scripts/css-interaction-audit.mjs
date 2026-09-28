import {readdir,readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Source-preserving structural audit: quotes/comments and selector lists are
// parsed, so mixed :hover/:focus-visible rules can be split without gating focus.
export function cssRules(source) {
 const rules=[],stack=[];let start=0,quote='',comment=false;
 for(let i=0;i<source.length;i++){
  const c=source[i],next=source[i+1];
  if(comment){if(c==='*'&&next==='/'){comment=false;i++;}continue;}
  if(quote){if(c==='\\')i++;else if(c===quote)quote='';continue;}
  if(c==='/'&&next==='*'){comment=true;i++;continue;}
  if(c==='"'||c==="'"){quote=c;continue;}
  if(c==='{'){
   const prefix=source.slice(start,i),clean=prefix.replace(/\/\*[\s\S]*?\*\//g,'').trim();
   const offset=source.lastIndexOf(clean,i);
   stack.push({start:offset,bodyStart:i+1,selector:clean,parents:stack.map(r=>r.selector)});start=i+1;
  }else if(c==='}'){
   const rule=stack.pop();if(!rule)throw Error('Unbalanced CSS');
   rule.end=i+1;rule.body=source.slice(rule.bodyStart,i);rule.line=source.slice(0,rule.start).split('\n').length;
   if(!rule.selector.startsWith('@'))rules.push(rule);start=i+1;
  }else if(c===';'&&!stack.length)start=i+1;
 }
 if(stack.length||comment||quote)throw Error('Incomplete CSS');return rules.sort((a,b)=>a.start-b.start);
}
export function selectorList(text){let depth=0,start=0;const rows=[];for(let i=0;i<text.length;i++){if('(['.includes(text[i]))depth++;if(')]'.includes(text[i]))depth--;if(text[i]===','&&!depth){rows.push(text.slice(start,i).trim());start=i+1;}}rows.push(text.slice(start).trim());return rows;}
export const fineGate=parents=>parents.some(p=>/^@media/.test(p)&&/\(hover\s*:\s*hover\)/.test(p)&&/\(pointer\s*:\s*fine\)/.test(p));
export function partitionHover(selector){
 const expanded=selectorList(selector).flatMap(s=>/:(?:is|where)\(\s*:hover\s*,\s*:focus-visible\s*\)/.test(s)
  ?[s.replace(/:(?:is|where)\(\s*:hover\s*,\s*:focus-visible\s*\)/,':hover'),s.replace(/:(?:is|where)\(\s*:hover\s*,\s*:focus-visible\s*\)/,':focus-visible')]:[s]);
 return {hover:expanded.filter(s=>s.includes(':hover')),other:expanded.filter(s=>!s.includes(':hover'))};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
 const root=process.argv[2]||'public',out=process.argv[3]||'artifacts/touch-hover';await mkdir(out,{recursive:true});const entries=[];
 for(const file of await readdir(root)){if(!file.endsWith('.css'))continue;const source=await readFile(path.join(root,file),'utf8');for(const r of cssRules(source).filter(r=>r.selector.includes(':hover')))entries.push({file,line:r.line,selector:r.selector,parents:r.parents,gated:fineGate(r.parents),declarations:r.body.trim(),...partitionHover(r.selector)});}
 await writeFile(path.join(out,'hover-inventory.json'),JSON.stringify(entries,null,2));
 console.log(JSON.stringify({rules:entries.length,hoverBranches:entries.reduce((n,r)=>n+r.hover.length,0),gated:entries.filter(r=>r.gated).length,unguarded:entries.filter(r=>!r.gated).length,files:[...new Set(entries.map(r=>r.file))]}));
}
