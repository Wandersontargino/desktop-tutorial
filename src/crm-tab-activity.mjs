export function createTabActivity({getIdentity,onActivity,onLock,Channel=globalThis.BroadcastChannel,now=Date.now}={}){
  let channel,lastSent=0;
  try{if(typeof Channel==='function')channel=new Channel('pa-crm-device-activity');}catch{}
  if(channel)channel.onmessage=event=>{
    const value=event.data,id=getIdentity();
    if(!id||!value||value.user!==id||!Number.isFinite(value.at)||Math.abs(now()-value.at)>30000)return;
    if(value.type==='activity')onActivity();else if(value.type==='lock')onLock();
  };
  return {
    activity(){const user=getIdentity(),at=now();if(!user||at-lastSent<5000)return;lastSent=at;try{channel?.postMessage({type:'activity',user,at});}catch{}},
    lock(user){if(!user)return;try{channel?.postMessage({type:'lock',user,at:now()});}catch{}},
    close(){try{channel?.close();}catch{}channel=null;}
  };
}
