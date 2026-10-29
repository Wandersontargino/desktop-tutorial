package br.com.analiseeleitoralpara;

import android.app.*;
import android.content.*;
import android.graphics.Color;
import android.net.*;
import android.os.*;
import android.print.PrintManager;
import android.view.*;
import android.webkit.*;
import android.webkit.CookieManager;
import android.widget.*;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

/** Installed UI. Only fixed central API calls and a separate account screen use the network. */
public final class MainActivity extends Activity {
    public static final String LOCAL = "https://appassets.androidplatform.net/";
    private static final String CENTRAL = "https://analise-eleitoral-pa.wanderson-targino.chatgpt.site";
    private static final String CENTRAL_HOST = "analise-eleitoral-pa.wanderson-targino.chatgpt.site";
    private final ExecutorService io = Executors.newFixedThreadPool(3);
    private WebView platform, account;
    private FrameLayout root;
    private LinearLayout accountPane;
    private ValueCallback<Uri[]> fileCallback;
    private byte[] exportBytes;
    private String exportName;
    private boolean fileFlow, destroyed, checkingAccount;
    private android.net.ConnectivityManager networks;
    private android.net.ConnectivityManager.NetworkCallback networkCallback;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE,WindowManager.LayoutParams.FLAG_SECURE);
        root = new FrameLayout(this); root.setBackgroundColor(Color.WHITE); setContentView(root);
        root.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;});
        WebView.setWebContentsDebuggingEnabled(false);
        platform = new WebView(this); settings(platform);
        CookieManager.getInstance().setAcceptThirdPartyCookies(platform,false);
        platform.addJavascriptInterface(new Bridge(),"PADevice");
        platform.setWebViewClient(new WebViewClient(){
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest req){return asset(req);}
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest req){
                if(!req.isForMainFrame()) return !local(req.getUrl());
                if(local(req.getUrl())) return false;
                if(req.hasGesture()) external(req.getUrl()); return true;
            }
        });
        ServiceWorkerController.getInstance().setServiceWorkerClient(new ServiceWorkerClient(){
            @Override public WebResourceResponse shouldInterceptRequest(WebResourceRequest req){return asset(req);}
        });
        platform.setWebChromeClient(new WebChromeClient(){
            @Override public boolean onJsAlert(WebView view,String url,String message,JsResult result){
                new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("OK",(d,w)->result.confirm()).setOnCancelListener(d->result.cancel()).show();return true;
            }
            @Override public boolean onJsConfirm(WebView view,String url,String message,JsResult result){
                new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("Confirmar",(d,w)->result.confirm()).setNegativeButton("Cancelar",(d,w)->result.cancel()).setOnCancelListener(d->result.cancel()).show();return true;
            }
            @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params){
                if(fileCallback!=null) fileCallback.onReceiveValue(null); fileCallback=callback;
                Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT);intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType("*/*");
                intent.putExtra(Intent.EXTRA_MIME_TYPES,new String[]{"application/pdf","image/*","application/json","text/csv","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,params.getMode()==FileChooserParams.MODE_OPEN_MULTIPLE);
                try{fileFlow=true;startActivityForResult(intent,41);}catch(ActivityNotFoundException e){fileFlow=false;fileCallback.onReceiveValue(null);fileCallback=null;}return true;
            }
        });
        root.addView(platform,new FrameLayout.LayoutParams(-1,-1));
        platform.loadUrl(LOCAL);
        networks=(android.net.ConnectivityManager)getSystemService(CONNECTIVITY_SERVICE);
        networkCallback=new android.net.ConnectivityManager.NetworkCallback(){
            @Override public void onCapabilitiesChanged(Network n,NetworkCapabilities c){networkChanged();}
            @Override public void onLost(Network n){networkChanged();}
        };
        networks.registerDefaultNetworkCallback(networkCallback);
        if(Build.VERSION.SDK_INT>=33)getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,()->goBack());
    }
    private void settings(WebView view){
        WebSettings s=view.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);s.setAllowContentAccess(false);s.setAllowFileAccessFromFileURLs(false);s.setAllowUniversalAccessFromFileURLs(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);s.setJavaScriptCanOpenWindowsAutomatically(false);s.setSupportMultipleWindows(false);
        s.setSafeBrowsingEnabled(true);s.setMediaPlaybackRequiresUserGesture(true);
    }
    private static boolean local(Uri uri){return "https".equals(uri.getScheme())&&"appassets.androidplatform.net".equals(uri.getHost())&&(uri.getPort()==-1||uri.getPort()==443);}
    private static WebResourceResponse response(String type,int status,byte[] bytes){
        Map<String,String> headers=new HashMap<>();headers.put("Cache-Control","no-store");headers.put("X-Content-Type-Options","nosniff");
        headers.put("Content-Security-Policy","default-src 'self' data: blob:; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' blob: data:; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'");
        return new WebResourceResponse(type,"UTF-8",status,status==200?"OK":"Blocked",headers,new ByteArrayInputStream(bytes));
    }
    private WebResourceResponse asset(WebResourceRequest req){
        if(!local(req.getUrl())) return response("text/plain",403,new byte[0]);
        String path=req.getUrl().getPath();if(path==null||path.equals("/"))path="/index.html";
        if(!req.getMethod().equals("GET")||path.contains("..")||path.contains("\\")||path.indexOf('\0')>=0)return response("text/plain",403,new byte[0]);
        try{
            InputStream stream=getAssets().open("platform"+path);
            String type=URLConnection.guessContentTypeFromName(path);
            if(path.endsWith(".js")||path.endsWith(".mjs"))type="text/javascript";
            else if(path.endsWith(".json")||path.endsWith(".webmanifest"))type="application/json";
            else if(path.endsWith(".wasm"))type="application/wasm";
            else if(path.endsWith(".svg"))type="image/svg+xml";
            else if(path.endsWith(".css"))type="text/css";
            WebResourceResponse reply=response(type==null?"application/octet-stream":type,200,new byte[0]);reply.setData(stream);return reply;
        }catch(IOException missing){return response("text/plain",404,new byte[0]);}
    }
    private boolean online(){
        android.net.ConnectivityManager cm=(android.net.ConnectivityManager)getSystemService(CONNECTIVITY_SERVICE);
        NetworkCapabilities c=cm.getNetworkCapabilities(cm.getActiveNetwork());return c!=null&&c.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
    }
    private void networkChanged(){runOnUiThread(()->evaluate("window.PANative?.network("+online()+")"));}
    private void evaluate(String js){if(!destroyed&&platform!=null)platform.evaluateJavascript(js,null);}
    private void external(Uri uri){
        if(!Arrays.asList("https","mailto","tel","geo").contains(uri.getScheme()))return;
        try{startActivity(new Intent(Intent.ACTION_VIEW,uri));}catch(ActivityNotFoundException e){Toast.makeText(this,"Nenhum aplicativo disponível para abrir este conteúdo.",Toast.LENGTH_LONG).show();}
    }
    private JSONObject api(String path,String method,String body,String knownRevision) throws Exception {
        if(!(path.startsWith("/api/crm/")||path.startsWith("/api/election/")||path.startsWith("/api/results2026/")||path.startsWith("/api/tse2026/"))||path.length()>1200||!path.matches("/api/[A-Za-z0-9_/?&=.%:+,~-]+")||Uri.decode(path).contains("..")||Uri.decode(path).contains("\\")||!Arrays.asList("GET","POST","DELETE").contains(method)||body.length()>6*1024*1024)throw new IOException("Solicitação inválida.");
        URL url=new URL(CENTRAL+path);if(!CENTRAL_HOST.equals(url.getHost()))throw new IOException("Destino inválido.");
        HttpURLConnection connection=(HttpURLConnection)url.openConnection();
        try{
            connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(12000);connection.setReadTimeout(20000);connection.setRequestMethod(method);
            connection.setRequestProperty("Accept","application/json");connection.setRequestProperty("Origin",CENTRAL);
            connection.setRequestProperty("User-Agent",WebSettings.getDefaultUserAgent(this));
            String cookie=CookieManager.getInstance().getCookie(CENTRAL+"/");if(cookie!=null)connection.setRequestProperty("Cookie",cookie);
            if(knownRevision.matches("[0-9]{1,12}"))connection.setRequestProperty("X-PA-Known-Revision",knownRevision);
            if(!method.equals("GET")){connection.setRequestProperty("Content-Type","application/json");connection.setDoOutput(true);try(OutputStream out=connection.getOutputStream()){out.write(body.getBytes(StandardCharsets.UTF_8));}}
            int status=connection.getResponseCode();
            for(Map.Entry<String,List<String>> header:connection.getHeaderFields().entrySet())if("set-cookie".equalsIgnoreCase(header.getKey()))for(String value:header.getValue())CookieManager.getInstance().setCookie(CENTRAL+"/",value);
            CookieManager.getInstance().flush();
            JSONObject result=new JSONObject();String type=connection.getContentType();
            if(status>=300&&status<400||type==null||!type.toLowerCase(Locale.ROOT).contains("application/json"))return result.put("status",status==403?403:401).put("body",new JSONObject().put("error","Autorize este aparelho em Conectar base e entre com a senha da plataforma.").put("requiresDeviceAuthorization",true));
            InputStream input=status>=400?connection.getErrorStream():connection.getInputStream();
            ByteArrayOutputStream data=new ByteArrayOutputStream();byte[] buffer=new byte[16384];int read;
            if(input!=null)try(InputStream in=input){while((read=in.read(buffer))!=-1){data.write(buffer,0,read);if(data.size()>24*1024*1024)throw new IOException("Resposta excedeu o limite do aparelho.");}}
            return result.put("status",status).put("body",new JSONObject(data.toString("UTF-8")));
        }finally{connection.disconnect();}
    }
    public final class Bridge {
        @JavascriptInterface public boolean isOnline(){return online();}
        @JavascriptInterface public void request(String id,String raw){
            if(!id.matches("[0-9]{1,12}")||raw.length()>6*1024*1024)return;
            io.execute(()->{JSONObject result;try{JSONObject r=new JSONObject(raw);result=api(r.getString("path"),r.optString("method","GET"),r.optString("body",""),r.optString("revision",""));}
                catch(Exception e){try{result=new JSONObject().put("status",503).put("body",new JSONObject().put("error","Não foi possível sincronizar. As alterações protegidas foram preservadas."));}catch(JSONException impossible){return;}}
                final String answer=result.toString();runOnUiThread(()->evaluate("window.PANative?.reply("+JSONObject.quote(id)+","+answer+")"));});
        }
        @JavascriptInterface public void authorize(){runOnUiThread(()->showAccount());}
        @JavascriptInterface public void signOut(){runOnUiThread(()->CookieManager.getInstance().removeAllCookies(done->{CookieManager.getInstance().flush();platform.reload();}));}
        @JavascriptInterface public void print(){runOnUiThread(()->((PrintManager)getSystemService(PRINT_SERVICE)).print("Análise Eleitoral Pará",platform.createPrintDocumentAdapter("Relatório"),null));}
        @JavascriptInterface public void saveFile(String name,String mime,String base64){
            if(base64.length()>40*1024*1024)return;
            try{final byte[] bytes=android.util.Base64.decode(base64,android.util.Base64.DEFAULT);
                runOnUiThread(()->{if(exportBytes!=null){Toast.makeText(MainActivity.this,"Conclua o arquivo anterior.",Toast.LENGTH_LONG).show();return;}
                    exportBytes=bytes;exportName=name.replaceAll("[^\\p{L}0-9._ -]","_");if(exportName.length()>180)exportName=exportName.substring(0,180);
                    Intent save=new Intent(Intent.ACTION_CREATE_DOCUMENT);save.addCategory(Intent.CATEGORY_OPENABLE);save.setType(mime.matches("[a-zA-Z0-9.+-]+/[a-zA-Z0-9.+-]+")?mime:"application/octet-stream");save.putExtra(Intent.EXTRA_TITLE,exportName);
                    try{fileFlow=true;startActivityForResult(save,42);}catch(ActivityNotFoundException e){exportBytes=null;fileFlow=false;}
                });
            }catch(IllegalArgumentException ignored){}
        }
    }
    private void showAccount(){
        if(account!=null)return;
        accountPane=new LinearLayout(this);accountPane.setOrientation(LinearLayout.VERTICAL);accountPane.setBackgroundColor(Color.WHITE);
        TextView note=new TextView(this);note.setPadding(16,12,16,12);note.setText("Autorize sua conta privada. Depois, use a senha da base para preparar a cópia protegida.");accountPane.addView(note);
        Button close=new Button(this);close.setText("Voltar ao aplicativo");close.setOnClickListener(v->closeAccount(false));accountPane.addView(close);
        account=new WebView(this);settings(account);CookieManager.getInstance().setAcceptThirdPartyCookies(account,false);
        // No native bridge or local asset interception in the account window.
        account.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest req){return !"https".equals(req.getUrl().getScheme());}
            @Override public void onPageFinished(WebView v,String url){
                Uri uri=Uri.parse(url);note.setText("Autorização da conta — "+uri.getHost());
                if(CENTRAL_HOST.equals(uri.getHost())&&!checkingAccount){checkingAccount=true;
                    io.execute(()->{boolean ok=false;try{JSONObject r=api("/api/crm/session","GET","","");ok=r.getInt("status")==200&&r.getJSONObject("body").optJSONObject("user")!=null;}catch(Exception ignored){}
                        final boolean success=ok;runOnUiThread(()->{checkingAccount=false;if(success&&account!=null)closeAccount(true);});});
                }
            }
        });accountPane.addView(account,new LinearLayout.LayoutParams(-1,0,1));root.addView(accountPane,new FrameLayout.LayoutParams(-1,-1));account.loadUrl(CENTRAL+"/");
    }
    private void closeAccount(boolean authorized){
        if(account==null)return;root.removeView(accountPane);account.destroy();account=null;accountPane=null;
        if(authorized){Toast.makeText(this,"Aparelho autorizado. Entre com a senha da base.",Toast.LENGTH_LONG).show();platform.reload();}
        else evaluate("window.PANative?.authorizationClosed()");
    }
    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data){
        super.onActivityResult(requestCode,resultCode,data);fileFlow=false;
        if(requestCode==41&&fileCallback!=null){Uri[] uris=null;if(resultCode==RESULT_OK&&data!=null){if(data.getClipData()!=null){int n=data.getClipData().getItemCount();uris=new Uri[n];for(int i=0;i<n;i++)uris[i]=data.getClipData().getItemAt(i).getUri();}else if(data.getData()!=null)uris=new Uri[]{data.getData()};}fileCallback.onReceiveValue(uris);fileCallback=null;}
        if(requestCode==42&&exportBytes!=null){byte[] bytes=exportBytes;exportBytes=null;
            if(resultCode==RESULT_OK&&data!=null&&data.getData()!=null){Uri uri=data.getData();io.execute(()->{boolean ok=false;try(OutputStream out=getContentResolver().openOutputStream(uri,"w")){if(out==null)throw new IOException();out.write(bytes);ok=true;}catch(IOException ignored){}final boolean saved=ok;Arrays.fill(bytes,(byte)0);runOnUiThread(()->Toast.makeText(this,saved?"Arquivo salvo.":"Não foi possível salvar o arquivo.",Toast.LENGTH_LONG).show());});}else Arrays.fill(bytes,(byte)0);
        }
    }
    private void goBack(){if(account!=null){closeAccount(false);return;}evaluate("window.PANative?.lock()");moveTaskToBack(true);}
    @Override public void onBackPressed(){goBack();}
    @Override protected void onStop(){super.onStop();if(!fileFlow&&account==null)evaluate("window.PANative?.lock()");CookieManager.getInstance().flush();}
    @Override protected void onResume(){super.onResume();networkChanged();}
    @Override protected void onDestroy(){destroyed=true;if(networks!=null&&networkCallback!=null)networks.unregisterNetworkCallback(networkCallback);if(account!=null)account.destroy();if(platform!=null){platform.removeJavascriptInterface("PADevice");platform.destroy();}if(fileCallback!=null)fileCallback.onReceiveValue(null);io.shutdownNow();super.onDestroy();}
}
