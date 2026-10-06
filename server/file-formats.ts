import {Worker} from 'node:worker_threads';
export async function inspectFile(buffer:Buffer,name:string):Promise<{mime:string;text:string}|null>{
 if(buffer.subarray(0,5).toString()==='%PDF-')return{mime:'application/pdf',text:''};
 if(buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return{mime:'image/png',text:''};
 if(buffer[0]===255&&buffer[1]===216&&buffer[2]===255)return{mime:'image/jpeg',text:''};
 const ext=name.toLowerCase().split('.').at(-1);
 if((ext==='docx'||ext==='pptx')&&buffer.subarray(0,4).equals(Buffer.from([80,75,3,4])))return await new Promise((resolve,reject)=>{const worker=new Worker(new URL('./office-extract.mjs',import.meta.url),{workerData:buffer,resourceLimits:{maxOldGenerationSizeMb:64}});let done=false;const finish=(e:Error|null,v?:{mime:string;text:string})=>{if(done)return;done=true;clearTimeout(timer);void worker.terminate();if(e)reject(e);else resolve(v!);};const timer=setTimeout(()=>finish(new Error('Document extraction timed out.')),5000);worker.on('message',v=>finish(v.error?new Error(v.error):null,v));worker.on('error',e=>finish(e));worker.on('exit',()=>{if(!done)finish(new Error('Document extraction stopped.'));});});
 const ascii=(start:number,length:number)=>buffer.subarray(start,start+length).toString();
 if(ext==='mp3'&&(ascii(0,3)==='ID3'||buffer[0]===255&&(buffer[1]&224)===224))return{mime:'audio/mpeg',text:''};
 if(ext==='wav'&&ascii(0,4)==='RIFF'&&ascii(8,4)==='WAVE')return{mime:'audio/wav',text:''};
 if((ext==='ogg'||ext==='opus')&&ascii(0,4)==='OggS')return{mime:'audio/ogg',text:''};
 if((ext==='mp4'||ext==='m4a')&&ascii(4,4)==='ftyp')return{mime:ext==='m4a'?'audio/mp4':'video/mp4',text:''};
 if(ext==='webm'&&buffer.subarray(0,4).equals(Buffer.from([26,69,223,163])))return{mime:'video/webm',text:''};
 return null;
}
