import {parseIntakeText,digits,setDocumentaryReview} from './crm-model.mjs';
export function recognizedWords(result){
  const output=[];for(const block of result?.data?.blocks||[])for(const paragraph of block.paragraphs||[])for(const line of paragraph.lines||[])for(const word of line.words||[])if(typeof word.text==='string'&&Number.isFinite(word.confidence))output.push({text:word.text,confidence:Math.max(0,Math.min(100,word.confidence))});return output;
}
export function documentFields(text){
  const raw=parseIntakeText(text),fields={...raw};
  if(raw.title!==undefined)fields.title=digits(raw.title);
  if(raw.birth&&/^\d{2}\/\d{2}\/\d{4}$/.test(raw.birth.trim())){const [day,month,year]=raw.birth.trim().split('/');const normalized=year+'-'+month+'-'+day,parsed=new Date(normalized+'T12:00:00Z');if(Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===normalized)fields.birth=normalized;}
  return {raw,fields};
}
export function documentRecord(text,{fileName='',page=1,digest=''}={}){
  const {raw,fields}=documentFields(text);let notes=fields.notes||'';
  const birthDate=new Date(fields.birth+'T12:00:00Z'),validBirth=/^\d{4}-\d{2}-\d{2}$/.test(fields.birth||'')&&Number.isFinite(birthDate.getTime())&&birthDate.toISOString().slice(0,10)===fields.birth;
  if(raw.birth&&!validBirth)notes=[notes,'Nascimento transcrito na fonte: '+raw.birth+' (conferir).'].filter(Boolean).join(' ');
  const source=fileName?'Arquivo: '+fileName.slice(0,80)+' | página '+page+(digest?' | SHA-256: '+digest:''):'Texto transcrito pelo responsável';
  return {...fields,notes:fileName?setDocumentaryReview(notes,true):notes,literalTitle:true,source:source.slice(0,200)};
}
