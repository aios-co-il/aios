import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {bundle} from '@remotion/bundler';
import {getCompositions,renderMedia} from '@remotion/renderer';
const [manifestPath,outputPath]=process.argv.slice(2);
if(!manifestPath||!outputPath){console.error('Usage: node render-job.mjs manifest.json output.mp4');process.exit(2)}
const manifest=JSON.parse(await readFile(resolve(manifestPath),'utf8'));
const assert=(ok,msg)=>{if(!ok)throw Error(msg)};
assert(manifest.schemaVersion===1&&manifest.fps===30,'Invalid manifest');
assert(Number.isInteger(manifest.width)&&manifest.width>=240&&manifest.width<=3840&&Number.isInteger(manifest.height)&&manifest.height>=240&&manifest.height<=3840,'Invalid dimensions');
assert(Array.isArray(manifest.scenes)&&manifest.scenes.length>0&&manifest.scenes.length<=100,'Invalid scene count');
const sorted=[...manifest.scenes].sort((a,b)=>a.order-b.order);let cursor=0;const ids=new Set();
for(const s of sorted){assert(typeof s.id==='string'&&s.id&&!ids.has(s.id),'Invalid scene id');ids.add(s.id);assert(Number.isInteger(s.frameCount)&&s.frameCount>0&&s.startFrame===cursor,'Invalid frame timing');cursor+=s.frameCount;}
assert(cursor===manifest.totalFrames&&cursor<=18000,'Invalid totalFrames');
// Never pass arbitrary remote URLs from a client into Chromium.
const props={title:'CARMEN MARKETING OS',scenes:sorted.map((s,i)=>({id:s.id,durationFrames:s.frameCount,kind:['sink','chaos','arrival','lift','surface','cta'][Math.min(i,5)],caption:String(s.overlayText||s.title||'').slice(0,500)}))};
const entry=resolve('src/index.ts');
const serveUrl=await bundle({entryPoint:entry});
const compositions=await getCompositions(serveUrl,{inputProps:props});
const composition=compositions.find(c=>c.id==='CarmenVideo');assert(composition,'Missing composition');
const output=resolve(outputPath);await mkdir(dirname(output),{recursive:true});
await renderMedia({composition:{...composition,width:manifest.width,height:manifest.height,durationInFrames:cursor},serveUrl,codec:'h264',outputLocation:output,inputProps:props,concurrency:2});
await writeFile(output+'.json',JSON.stringify({status:'completed',frames:cursor,fps:30,width:manifest.width,height:manifest.height},null,2));
console.log(output);
