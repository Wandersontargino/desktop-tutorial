package br.com.analiseeleitoralpara;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.TextView;
import android.widget.EditText;
import android.text.InputType;
import android.content.DialogInterface;
import java.util.List;

/** Browser-backed Android entry point. No voter data, passwords or service
 * credentials are bundled or handled here. Authentication stays at the Site. */
public final class MainActivity extends Activity {
    private static final String PLATFORM_URL = "https://analise-eleitoral-pa.wanderson-targino.chatgpt.site/";
    private static final String CUSTOM_TABS_SERVICE = "android.support.customtabs.action.CustomTabsService";
    private TextView status;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        status = findViewById(R.id.status);
        findViewById(R.id.open_platform).setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View view) { openPlatform(true); }
        });
        findViewById(R.id.open_browser).setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View view) { openPlatform(false); }
        });
        findViewById(R.id.offline_help).setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View view) {
                new AlertDialog.Builder(MainActivity.this).setTitle(R.string.offline_title)
                    .setMessage(R.string.offline_steps).setPositiveButton(R.string.understood, null).show();
            }
        });
        findViewById(R.id.configure_address).setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View view) { configureAddress(); }
        });
        showAddress();
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // External caller data cannot replace the fixed trusted destination.
        setIntent(intent);
        showAddress();
    }

    private String platformURL() {
        return getPreferences(MODE_PRIVATE).getString("platform_url", PLATFORM_URL);
    }

    private void showAddress() { status.setText(getString(R.string.ready) + "\n\n" + platformURL()); }

    private void configureAddress() {
        final EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        input.setSingleLine(true); input.setText(platformURL());
        final AlertDialog dialog = new AlertDialog.Builder(this).setTitle("Endereço da plataforma")
            .setMessage("Cole o endereço HTTPS da sua versão independente ou do link de teste. Confira o domínio antes de entrar com sua senha.")
            .setView(input).setPositiveButton("Salvar", null).setNegativeButton("Cancelar", null)
            .setNeutralButton("Usar site atual", new DialogInterface.OnClickListener() {
                @Override public void onClick(DialogInterface dialog, int which) { getPreferences(MODE_PRIVATE).edit().remove("platform_url").apply(); showAddress(); }
            }).create();
        dialog.setOnShowListener(new DialogInterface.OnShowListener() {
            @Override public void onShow(DialogInterface ignored) {
                dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(new View.OnClickListener() {
                    @Override public void onClick(View view) {
                        String text = input.getText().toString().trim(); Uri uri = Uri.parse(text);
                        if (!"https".equals(uri.getScheme()) || uri.getHost() == null || !uri.getHost().matches("[a-zA-Z0-9][a-zA-Z0-9.-]*\\.[a-zA-Z]{2,}") || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null || (uri.getPort() != -1 && uri.getPort() != 443)) {
                            input.setError("Use um endereço HTTPS completo, sem usuário, senha ou parâmetros."); return;
                        }
                        getPreferences(MODE_PRIVATE).edit().putString("platform_url", text).apply(); showAddress(); dialog.dismiss();
                    }
                });
            }
        }); dialog.show();
    }

    private String preferredProvider() {
        PackageManager pm = getPackageManager();
        Intent browser = new Intent(Intent.ACTION_VIEW, Uri.parse(platformURL()));
        browser.addCategory(Intent.CATEGORY_BROWSABLE);
        ResolveInfo preferred = pm.resolveActivity(browser, PackageManager.MATCH_DEFAULT_ONLY);
        if (preferred != null && supportsTabs(pm, preferred.activityInfo.packageName)) {
            return preferred.activityInfo.packageName;
        }
        if (supportsTabs(pm, "com.android.chrome")) return "com.android.chrome";
        List<ResolveInfo> providers = pm.queryIntentServices(new Intent(CUSTOM_TABS_SERVICE), 0);
        for (ResolveInfo provider : providers) {
            if (provider.serviceInfo != null && provider.serviceInfo.exported) return provider.serviceInfo.packageName;
        }
        return null;
    }

    private boolean supportsTabs(PackageManager pm, String name) {
        Intent service = new Intent(CUSTOM_TABS_SERVICE);
        service.setPackage(name);
        return pm.resolveService(service, 0) != null;
    }

    private Intent browserIntent() {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(platformURL()));
        intent.addCategory(Intent.CATEGORY_BROWSABLE);
        intent.putExtra(Intent.EXTRA_REFERRER, Uri.parse("android-app://" + getPackageName()));
        return intent;
    }

    private void openPlatform(boolean customTab) {
        Intent intent = browserIntent();
        String provider = preferredProvider();
        if (provider != null) intent.setPackage(provider);
        if (customTab && provider != null) {
            Bundle extras = new Bundle();
            // A null session binder is a valid Custom Tabs protocol session.
            extras.putBinder("android.support.customtabs.extra.SESSION", null);
            intent.putExtras(extras);
            intent.putExtra("android.support.customtabs.extra.TOOLBAR_COLOR", Color.rgb(59,79,245));
            intent.putExtra("android.support.customtabs.extra.TITLE_VISIBILITY", 1);
            intent.putExtra("androidx.browser.customtabs.extra.COLOR_SCHEME", 1);
        }
        try {
            startActivity(intent);
            status.setText(R.string.ready);
        } catch (ActivityNotFoundException | SecurityException unavailable) {
            try {
                startActivity(browserIntent());
                status.setText(R.string.ready);
            } catch (ActivityNotFoundException | SecurityException absent) {
                status.setText(R.string.no_browser);
            }
        }
    }
}
