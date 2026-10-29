import {normalize} from './crm-model.mjs';

export const electoralPlaceKey=r=>r.location?`${r.location.place} • ${r.location.city}`:'';
const numberKey=value=>/^\d+$/.test(String(value??'').trim())?String(Number(value)):String(value??'');
// Conjunction on a single record: never combine a zone from one elector with
// the section or school of another elector linked to the same leadership.
export function matchesElectoralFilter(record,{zone='',section='',place='',neighborhood='',city='',coordinator=''}={}){
  return (!zone||numberKey(record.zone)===numberKey(zone))
    &&(!section||numberKey(record.section)===numberKey(section))
    &&(!place||electoralPlaceKey(record)===place)
    &&(!neighborhood||normalize(record.location?.neighborhood)===normalize(neighborhood))
    &&(!city||String(record.location?.cityCode??'')===String(city))
    &&(!coordinator||normalize(record.coordinator)===normalize(coordinator));
}

export function electoralChoices(records,zone=''){
  const active=records.filter(r=>!r.deleted),unique=values=>[...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true}));
  return {
    zones:unique(active.map(r=>numberKey(r.zone)).filter(v=>/^[1-9]\d{0,2}$/.test(v))),
    sections:unique(active.filter(r=>!zone||numberKey(r.zone)===numberKey(zone)).map(r=>numberKey(r.section)).filter(v=>/^[1-9]\d{0,3}$/.test(v))),
    places:unique(active.map(electoralPlaceKey)),
    neighborhoods:unique(active.map(r=>r.location?.neighborhood)),
    coordinators:unique(active.map(r=>r.coordinator))
  };
}
