import { cp, mkdir } from 'node:fs/promises';
// Assets come from the checksum-verified installed pdfjs package, matching its worker version.
await mkdir('public/pdf-assets', {recursive:true});
for(const folder of ['cmaps','standard_fonts','wasm'])await cp(`node_modules/pdfjs-dist/${folder}`,`public/pdf-assets/${folder}`,{recursive:true});
