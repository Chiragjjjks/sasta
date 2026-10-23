package app.sasta.android;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Bundle;
import android.view.Gravity;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

/**
 * Full-screen in-app browser for signing in on a platform's own page.
 * The user types their number and OTP on the platform's site; Sasta never sees them.
 * Cookies land in the app-wide CookieManager, which CapacitorHttp also uses.
 * If interceptPrefix is set (OAuth), navigation to it is captured and returned instead of loaded.
 */
public class SignInActivity extends AppCompatActivity {

    public static final String EXTRA_URL = "url";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_INTERCEPT = "interceptPrefix";
    public static final String RESULT_KIND = "kind"; // "done" | "redirect"
    public static final String RESULT_URL = "redirectUrl";

    private WebView webView;
    private String interceptPrefix;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        String url = getIntent().getStringExtra(EXTRA_URL);
        String title = getIntent().getStringExtra(EXTRA_TITLE);
        interceptPrefix = getIntent().getStringExtra(EXTRA_INTERCEPT);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.parseColor("#f0f1f6"));

        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        int pad = dp(12);
        bar.setPadding(pad, pad, pad, pad);

        Button close = new Button(this);
        close.setText("Cancel");
        close.setAllCaps(false);
        close.setOnClickListener(v -> finishWith(Activity.RESULT_CANCELED, null, null));

        TextView label = new TextView(this);
        label.setText(title != null ? title : "Sign in");
        label.setTextColor(Color.parseColor("#14152a"));
        label.setTypeface(Typeface.DEFAULT_BOLD);
        label.setTextSize(16);
        label.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams labelLp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);

        Button done = new Button(this);
        done.setText("Done");
        done.setAllCaps(false);
        done.setOnClickListener(v -> finishWith(Activity.RESULT_OK, "done", null));
        // OAuth flows finish on their own redirect, so "Done" only makes sense for cookie sign-in.
        if (interceptPrefix != null) done.setVisibility(android.view.View.INVISIBLE);

        bar.addView(close);
        bar.addView(label, labelLp);
        bar.addView(done);

        webView = new WebView(this);
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        // Some sites refuse embedded WebViews; present as regular mobile Chrome.
        s.setUserAgentString(s.getUserAgentString().replace("; wv", ""));
        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(webView, true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return intercept(request.getUrl().toString());
            }

            @Override
            public void onPageStarted(WebView view, String u, android.graphics.Bitmap favicon) {
                if (intercept(u)) view.stopLoading();
                else super.onPageStarted(view, u, favicon);
            }
        });

        root.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(webView, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        setContentView(root);

        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            Insets i = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.ime());
            v.setPadding(i.left, i.top, i.right, i.bottom);
            return WindowInsetsCompat.CONSUMED;
        });

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack();
                else finishWith(Activity.RESULT_CANCELED, null, null);
            }
        });

        if (url != null) webView.loadUrl(url);
    }

    private boolean intercept(String u) {
        if (interceptPrefix != null && u != null && u.startsWith(interceptPrefix)) {
            finishWith(Activity.RESULT_OK, "redirect", u);
            return true;
        }
        // Payment and app links (upi:, intent:, tel:, …) open the matching app instead of failing in the WebView.
        if (u != null && !u.startsWith("http://") && !u.startsWith("https://") && !u.startsWith("about:") && !u.startsWith("data:") && !u.startsWith("blob:")) {
            try {
                Intent i = u.startsWith("intent:") ? Intent.parseUri(u, Intent.URI_INTENT_SCHEME) : new Intent(Intent.ACTION_VIEW, android.net.Uri.parse(u));
                i.addCategory(Intent.CATEGORY_BROWSABLE);
                i.setComponent(null);
                startActivity(i);
            } catch (Exception e) {
                android.widget.Toast.makeText(this, "No app found to open this", android.widget.Toast.LENGTH_SHORT).show();
            }
            return true;
        }
        return false;
    }

    private boolean finished = false;

    private void finishWith(int code, String kind, String redirect) {
        if (finished) return;
        finished = true;
        CookieManager.getInstance().flush();
        Intent data = new Intent();
        if (kind != null) data.putExtra(RESULT_KIND, kind);
        if (redirect != null) data.putExtra(RESULT_URL, redirect);
        setResult(code, data);
        finish();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
        }
        super.onDestroy();
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
