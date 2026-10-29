package br.com.analiseeleitoralpara.tests;
import android.app.*;
import android.content.*;
import android.os.*;
import android.webkit.*;
import android.view.WindowManager;
import org.json.*;
import java.lang.reflect.Field;
import java.util.concurrent.*;

/** Synthetic accounts/records only. Not compiled into the distributed application. */
public final class InstalledAppChecks extends Instrumentation {
    private Activity activity;private WebView web;private int checks;
    @Override public void onCreate(Bundle args){super.onCreate(args);start();}
    private String evaluate(String script) throws Exception {
        CountDownLatch done=new CountDownLatch(1);final String[] result={null};
        runOnMainSync(()->web.evaluateJavascript(script,value->{result[0]=value;done.countDown();}));
        if(!done.await(45,TimeUnit.SECONDS))throw new Exception("WebView did not answer; activityDestroyed="+activity.isDestroyed());return result[0];
    }
    private void waitLoaded() throws Exception {
        long deadline=System.currentTimeMillis()+90000;final int[] progress={0};
        while(System.currentTimeMillis()<deadline){runOnMainSync(()->progress[0]=web.getProgress());if(progress[0]>=100){Thread.sleep(300);return;}Thread.sleep(100);}
        throw new Exception("Initial document did not finish; progress="+progress[0]);
    }
    private void waitFor(String expression,String label) throws Exception {
        long deadline=System.currentTimeMillis()+60000;String last="";
        while(System.currentTimeMillis()<deadline){last=evaluate("Boolean("+expression+")");if("true".equals(last)){checks++;Bundle report=new Bundle();report.putString("stream","CHECK "+checks+": "+label+"\n");sendStatus(0,report);return;}Thread.sleep(150);}
        throw new Exception(label+" failed; status="+evaluate("document.getElementById('crm-status')?.textContent")+"; result="+last+"; seed="+evaluate("window.seedDone||''"));
    }
    private void run(String js) throws Exception{evaluate("(()=>{"+js+"})()");}
    private void unlock() throws Exception {
        run("PANative.offline(true);document.getElementById('crm-email').value='owner@example.test';document.getElementById('crm-password').value='synthetic device password 2026';document.getElementById('crm-auth').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));");
        waitFor("window.CrmWorkspace?.isUnlocked()","protected offline unlock");
    }
    @Override public void onStart(){
        Bundle result=new Bundle();
        try{
            Intent intent=new Intent();intent.setClassName("br.com.analiseeleitoralpara","br.com.analiseeleitoralpara.MainActivity");intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);activity=startActivitySync(intent);runOnMainSync(()->activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON|WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON|WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED));
            Field field=activity.getClass().getDeclaredField("platform");field.setAccessible(true);web=(WebView)field.get(activity);
            runOnMainSync(()->web.setWebChromeClient(new WebChromeClient(){
                @Override public boolean onConsoleMessage(ConsoleMessage message){if(message.messageLevel()==ConsoleMessage.MessageLevel.ERROR){Bundle b=new Bundle();b.putString("stream","JS ERROR: "+message.message()+" at "+message.sourceId()+":"+message.lineNumber()+"\n");sendStatus(0,b);}return true;}
                @Override public boolean onJsAlert(WebView v,String u,String m,JsResult r){r.confirm();return true;}
                @Override public boolean onJsConfirm(WebView v,String u,String m,JsResult r){r.confirm();return true;}
            }));
            runOnMainSync(()->{web.stopLoading();web.loadDataWithBaseURL("https://appassets.androidplatform.net/","<!doctype html><html><body>Installed runtime check</body></html>","text/html","UTF-8",null);});
            waitLoaded();waitFor("1+1===2","Android JavaScript callback");
            waitFor("typeof PADevice.isOnline()==='boolean'","native network bridge");
            runOnMainSync(()->web.loadUrl("https://appassets.androidplatform.net/"));waitLoaded();
            waitFor("window.CrmWorkspace&&document.getElementById('crm-auth')&&window.PlatformTools?.manifests.size>=1","installed UI start with no internet");
            waitFor("location.origin==='https://appassets.androidplatform.net'&&!navigator.onLine&&isSecureContext&&crypto.subtle","secure installed origin");
            run("window.testCoverage='';Promise.all(['/data/index.json','/data/federal/index.json','/data/4154.json'].map(p=>fetch(p).then(r=>r.json()))).then(values=>testCoverage=values[0].municipalities.length+':'+values[1].municipalities.length+':'+values[2].m[0]);");
            waitFor("window.testCoverage==='144:144:4154'","installed public election assets");
            run("window.seedDone='';(async()=>{const v=await import('https://appassets.androidplatform.net/secure-vault.mjs');const salt=v.newSalt(),key=await v.deriveVaultKey('synthetic device password 2026',salt);const base={id:'synthetic-native-001',name:'PESSOA FICTICIA INSTALADA',leadership:'LIDER FICTICIO',coordinator:'COORDENACAO FICTICIA',version:1,title:'',zone:'',section:'',notes:'',deleted:false};window.syntheticBase=base;const cloud={revision:7,records:[base],partnerships:[],leadershipLocations:[],duplicateReviews:[],qualityReviews:[]};const state={user:{id:'synthetic-owner',email:'owner@example.test',name:'RESPONSAVEL FICTICIO',role:'owner'},cloud,pending:[[base.id,{...base,notes:'NOTA FICTICIA OFFLINE'}]],locationDrafts:[],duplicateDrafts:[],qualityDrafts:[],conflicts:[],inflight:null,approved:false,lastOnline:new Date().toISOString(),reviewReason:'Revisao de teste',submissionApprovals:{}};const protectedCopy={salt,...await v.seal(state,key)};if(JSON.stringify(protectedCopy).includes(base.name))throw Error('Plaintext cache');await v.vaultStore('put','owner@example.test',protectedCopy);try{await v.unseal(protectedCopy,await v.deriveVaultKey('wrong synthetic password',salt));throw Error('Wrong password accepted');}catch(e){if(e.message==='Wrong password accepted')throw e;}seedDone='ok';})().catch(e=>seedDone=e.message);");
            waitFor("window.seedDone==='ok'","AES-GCM persistence and wrong-password rejection");unlock();
            waitFor("CrmWorkspace.getRecords().length===1&&CrmWorkspace.getRecords()[0].notes==='NOTA FICTICIA OFFLINE'&&CrmWorkspace.getOperationalState().pending===1","pending edits restored");
            run("window.confirm=()=>true;document.getElementById('crm-new').click();document.getElementById('edit-name').value='SEGUNDA PESSOA FICTICIA INSTALADA';document.getElementById('edit-leadership').value='LIDER FICTICIO';document.getElementById('edit-coordinator').value='COORDENACAO FICTICIA';document.getElementById('crm-edit-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));");
            waitFor("CrmWorkspace.getOperationalState().pending===2&&document.getElementById('crm-review').open","new registration saved offline through UI");
            run("document.getElementById('crm-accept-review').click();window.lockDone=false;setTimeout(()=>PANative.lock().then(()=>lockDone=true),1000);");
            waitFor("window.lockDone&&!CrmWorkspace.isUnlocked()&&!document.getElementById('crm-table-body').textContent.includes('PESSOA FICTICIA')","lock hides private records and saves approved queue");
            runOnMainSync(()->web.reload());waitLoaded();
            waitFor("window.CrmWorkspace&&document.getElementById('crm-auth')","restart from installed resources");unlock();
            waitFor("CrmWorkspace.getOperationalState().pending===2&&CrmWorkspace.getRecords().length===2","pending edits persist across restart");
            run("window.syncCalls=[];const original=window.fetch;window.fetch=async(input,options={})=>{const path=String(input);if(path==='/api/crm/sync'){const sent=JSON.parse(options.body);syncCalls.push(sent);return new Response(JSON.stringify({snapshot:{revision:8,records:sent.changes.map(r=>({...r,version:r.version+1})),partnerships:[],leadershipLocations:[],duplicateReviews:[],qualityReviews:[]}}),{status:200,headers:{'Content-Type':'application/json'}});}if(path.startsWith('/api/crm/'))return new Response(JSON.stringify({}),{headers:{'Content-Type':'application/json'}});return original(input,options);};PANative.network(true);PANative.offline(false);");
            waitFor("syncCalls.length===1&&syncCalls[0].revision===7&&syncCalls[0].changes.length===2&&CrmWorkspace.getOperationalState().revision===8&&CrmWorkspace.getOperationalState().pending===0","online event resumes the approved queue (synthetic server)");
            run("PANative.offline(true);window.endDone=false;PANative.lock().then(()=>endDone=true);");waitFor("window.endDone&&!CrmWorkspace.isUnlocked()","final lock");
            result.putString("stream","PASS: "+checks+" installed Android checks. Offline UI, 144 municipalities per office, AES-GCM, incorrect password, registration editing, restart, lock and approved sync with a synthetic server. Production login is not simulated or claimed.\n");finish(Activity.RESULT_OK,result);
        }catch(Throwable error){result.putString("stream","FAIL after "+checks+" checks: "+error.toString()+"\n");finish(Activity.RESULT_CANCELED,result);}
    }
}
