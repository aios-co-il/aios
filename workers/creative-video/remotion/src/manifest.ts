import type {CarmenVideoProps, SceneKind} from './video';
export type InputScene={id:string;order:number;startFrame:number;frameCount:number;title?:string;imageUrl?:string;overlayText?:string;voiceover?:string;visualPrompt?:string};
export type InputManifest={schemaVersion:1;fps:30;width:number;height:number;totalFrames:number;scenes:InputScene[]};
const kinds:SceneKind[]=['sink','chaos','arrival','lift','surface','cta'];
export function validateManifest(manifest:InputManifest):void{
 if(manifest.schemaVersion!==1||manifest.fps!==30||!Number.isInteger(manifest.width)||!Number.isInteger(manifest.height)||manifest.width<240||manifest.width>3840||manifest.height<240||manifest.height>3840)throw Error('Invalid manifest header');
 if(!Array.isArray(manifest.scenes)||manifest.scenes.length<1||manifest.scenes.length>100)throw Error('Invalid scene count');
 let cursor=0;const ids=new Set<string>();
 for(const s of [...manifest.scenes].sort((a,b)=>a.order-b.order)){
  if(!s.id||ids.has(s.id)||!Number.isInteger(s.frameCount)||s.frameCount<1||s.startFrame!==cursor)throw Error('Invalid scene order or timing');
  ids.add(s.id);cursor+=s.frameCount;
 }
 if(cursor!==manifest.totalFrames||cursor>18000)throw Error('Total frame count mismatch');
}
export function manifestToProps(manifest:InputManifest):CarmenVideoProps{
 validateManifest(manifest);
 return {title:'CARMEN MARKETING OS',scenes:[...manifest.scenes].sort((a,b)=>a.order-b.order).map((s,i)=>({id:s.id,durationFrames:s.frameCount,kind:kinds[Math.min(i,kinds.length-1)],caption:s.overlayText||s.title||'',background:undefined}))};
}
