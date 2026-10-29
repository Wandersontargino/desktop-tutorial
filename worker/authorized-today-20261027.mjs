// Historical private import omitted from this sanitized workspace.
export async function importPlan(){return {applied:0};}
export async function applyTodayImport(){return {applied:0};}
export async function todayMaintenance(){return new Response(JSON.stringify({error:'Private import is not distributed.'}),{status:403,headers:{'Content-Type':'application/json'}});}

