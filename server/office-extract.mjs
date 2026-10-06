import {parentPort,workerData} from 'node:worker_threads';
import {unzipSync,strFromU8} from 'fflate';
try {
 let total=0,count=0;
 const files=unzipSync(new Uint8Array(workerData),{filter:f=>{count++;if(count>500||f.originalSize>2_000_000||(total+=f.originalSize)>12_000_000)throw new Error('Archive limit');return f.name==='[Content_Types].xml'||f.name==='word/document.xml'||/^ppt\/slides\/slide\d+\.xml$/.test(f.name);}});
 const types=files['[Content_Types].xml']&&strFromU8(files['[Content_Types].xml']);
 if(!types||/macroEnabled|vbaProject/i.test(types))throw new Error('Unsupported archive');
 const docx=!!files['word/document.xml']&&types.includes('wordprocessingml.document.main+xml');
 const names=docx?['word/document.xml']:Object.keys(files).filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a,b)=>Number(a.match(/slide(\d+)/)[1])-Number(b.match(/slide(\d+)/)[1]));
 if(!docx&&(!names.length||!types.includes('presentationml.presentation.main+xml')))throw new Error('Not an Office document');
 let text='';
 for(const [i,name] of names.entries()){
  const xml=strFromU8(files[name]);if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('Unsupported XML');
  const parts=Array.from(xml.matchAll(/<(?:w|a):t(?:\s[^>]*)?>([\s\S]*?)<\/(?:w|a):t>/g),m=>m[1].replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&'));
  text+=(docx?'':`[Slide ${i+1}]\n`)+parts.join(' ')+'\n';if(text.length>100000)throw new Error('Document too large');
 }
 parentPort.postMessage({mime:docx?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'application/vnd.openxmlformats-officedocument.presentationml.presentation',text});
}catch{parentPort.postMessage({error:'This Office file is invalid or exceeds safe extraction limits.'});}
