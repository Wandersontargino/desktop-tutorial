'use client';
import {useState} from 'react';
import type {SolarInput} from '@/lib/solar';
import {clientBillSummary} from '@/lib/client-bill-summary';

export function useClientBillView(p:SolarInput){
 const summary=clientBillSummary(p);
 const [selection,setSelection]=useState<{sourceKey:string;view:'documents'|'projection'}|null>(null);
 const view=selection?.sourceKey===summary.sourceKey?selection.view:summary.hasDocuments?'documents':'projection';
 return {summary,view,setView:(next:'documents'|'projection')=>setSelection({sourceKey:summary.sourceKey,view:next})};
}
