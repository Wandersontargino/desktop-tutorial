import {normalize} from '../lib/crm-model.mjs';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const text=(value,max)=>String(value??'').trim().replace(/\s+/g,' ').slice(0,max);
export async function lookupCep(input,features){
  const raw=String(input??'').trim();
  if(!/^\d{5}-?\d{3}$/.test(raw))throw fail('Informe um CEP com 8 dígitos.');
  const postalCode=raw.replace('-',''),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{
    const response=await fetch('https://brasilapi.com.br/api/cep/v2/'+postalCode,{signal:controller.signal,headers:{Accept:'application/json'}});
    if(response.status===404)throw fail('CEP não encontrado. Confira o número ou preencha o endereço manualmente.',404);
    if(!response.ok)throw fail('A consulta de CEP está indisponível. Tente novamente ou preencha o endereço manualmente.',503);
    const data=await response.json();
    if(String(data.cep).replace('-','')!==postalCode||!data.city||!data.state)throw fail('A consulta retornou um endereço incompleto. Confira o CEP ou preencha manualmente.',502);
    if(data.state!=='PA')throw fail('Este CEP pertence a '+text(data.state,2)+'. Escolha um endereço do Pará para este mapa.');
    const city=features.find(f=>normalize(f.properties.name)===normalize(data.city));
    if(!city)throw fail('O município deste CEP não foi localizado no mapa. Preencha o endereço e confira o município manualmente.',422);
    // A CEP result has no verified street/house precision. Its coordinates can
    // be a municipal centroid, so use this service only to fill postal fields.
    return {postalCode,cityCode:String(city.properties.code),city:text(data.city,100),state:'PA',address:text(data.street,240),neighborhood:text(data.neighborhood,100),latitude:null,longitude:null,source:'cep',provider:'BrasilAPI',precision:'address-only'};
  }catch(e){if(e.status)throw e;throw fail('Não foi possível consultar o CEP agora. Tente novamente ou preencha o endereço manualmente.',503);}
  finally{clearTimeout(timer);}
}
