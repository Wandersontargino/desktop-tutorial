import {solarHistoryByPosition} from './pdf-bill-layout';
export async function readBillFile(file:File,progress:(s:string)=>void,options:{includeImagePages?:boolean}={}):Promise<string>{
 if(file.size>12*1024*1024)throw new Error('Envie uma fatura de até 12 MB.');
 const pdf=file.type==='application/pdf'||file.name.toLowerCase().endsWith('.pdf');
 if(!pdf&&!/^image\/(png|jpeg|webp)$/.test(file.type))throw new Error('Use PDF, JPG, PNG ou WEBP.');
 let worker:Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>>|undefined;
 const recognize=async(image:File|HTMLCanvasElement)=>{
  if(!worker){progress('Preparando leitura de imagem neste aparelho…');const {createWorker}=await import('tesseract.js');worker=await createWorker('por',1,{workerPath:'/ocr/worker.min.js',corePath:'/ocr/core',langPath:'/ocr/lang',logger:m=>{if(m.status==='recognizing text')progress(`Lendo a fatura… ${Math.round((m.progress||0)*100)}%`);}});}
  return (await worker.recognize(image)).data.text;
 };
 try{
  if(!pdf){const text=await recognize(file);if(text.trim().length<25)throw new Error('A imagem não tem texto legível suficiente. Envie uma foto mais nítida.');return text.slice(0,45000);}
  progress('Abrindo PDF…');const pdfjs=await import('pdfjs-dist');pdfjs.GlobalWorkerOptions.workerSrc='/pdf.worker.min.mjs';
  const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),useSystemFonts:true,standardFontDataUrl:'/pdf-fonts/'}),doc=await task.promise;
  if(doc.numPages>5){await task.destroy();throw new Error('A fatura deve ter no máximo 5 páginas. Envie apenas as páginas da conta.');}
  let result='';
  try{for(let i=1;i<=doc.numPages;i++){
   progress(`Lendo página ${i} de ${doc.numPages}…`);const page=await doc.getPage(i),content=await page.getTextContent();
   const positioned:{y:number;items:{x:number;width:number;text:string}[]}[]=[];
   for(const item of content.items){if(!('str' in item)||!item.str.trim())continue;const x=item.transform[4],y=item.transform[5];let line=positioned.find(l=>Math.abs(l.y-y)<2);if(!line){line={y,items:[]};positioned.push(line);}line.items.push({x,width:item.width,text:item.str});}
   let text=positioned.sort((a,b)=>b.y-a.y).map(line=>{let last=0;return line.items.sort((a,b)=>a.x-b.x).map((item,n)=>{const value=(n?(item.x-last>12?'   ':' '):'')+item.text;last=item.x+item.width;return value;}).join('');}).join('\n');
   if(!text.trim()&&(await page.getOperatorList()).fnArray.length===0)continue;
   if(text.replace(/\s/g,'').length<40&&i>1&&options.includeImagePages===false&&result.replace(/\s/g,'').length>200){result+=`\n--- Página ${i}: imagem complementar sem texto. OCR não solicitado para esta página; consulte o documento original. ---\n`;continue;}
   if(text.replace(/\s/g,'').length<40){const viewport=page.getViewport({scale:1.6}),canvas=document.createElement('canvas');canvas.width=Math.min(3000,viewport.width);canvas.height=Math.min(4000,viewport.height);const context=canvas.getContext('2d');if(!context)throw new Error('Não foi possível abrir a imagem desta página.');await page.render({canvas,canvasContext:context,viewport}).promise;text=await recognize(canvas);canvas.width=0;canvas.height=0;}
   result+=`\n--- Página ${i} ---\n`+text+solarHistoryByPosition(content.items.filter((item):item is typeof item & {str:string;transform:number[]}=>'str' in item));
  }}finally{await task.destroy();}
  if(result.replace(/\s/g,'').length<25)throw new Error('Não foi possível ler a fatura. Tente uma foto mais nítida ou cole o texto.');
  return result.slice(0,45000);
 }finally{if(worker)await worker.terminate();}
}
