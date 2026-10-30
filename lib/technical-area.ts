import type {SolarInput} from './solar';

export function technicalAreaEstimate(p:SolarInput,modules:number){
 const t=p.technicalArea;
 const fromDimensions=!!(t?.lengthM&&t?.widthM);
 const unitArea=fromDimensions?t!.lengthM!*t!.widthM!:p.moduleArea;
 const moduleArea=modules*unitArea,allowancePct=t?.allowancePct??20;
 const requiredM2=moduleArea*(1+allowancePct/100),availableM2=t?.availableM2??null;
 const maxModules=availableM2===null?null:Math.max(0,Math.floor((availableM2+1e-9)/(unitArea*(1+allowancePct/100))));
 return {unitArea,moduleArea,allowancePct,extraM2:requiredM2-moduleArea,requiredM2,availableM2,maxModules,
  shortageM2:availableM2===null?null:Math.max(0,requiredM2-availableM2),
  fits:availableM2===null?null:requiredM2<=availableM2+1e-9,fromDimensions,
  source:t?.source||'Área unitária de referência; confirmar ficha técnica do módulo.'};
}
