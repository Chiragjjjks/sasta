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
    /** Comma-separated cookie names that prove sign-in; when one appears, the screen closes by itself. */
    public static final String EXTRA_DONE_COOKIES = "doneCookies";
    public static final String EXTRA_DONE_ORIGINS = "doneOrigins";
    /** JS expression evaluated in the page; "true" means signed in (reads the site's own storage). */
    public static final String EXTRA_DONE_SCRIPT = "doneScript";
    public static final String RESULT_KIND = "kind"; // "done" | "redirect"
    public static final String RESULT_URL = "redirectUrl";

    private WebView webView;
    private String interceptPrefix;
    private String[] doneCookies;
    private String[] doneOrigins;
    private String doneScript;
    private final android.os.Handler poll = new android.os.Handler(android.os.Looper.getMainLooper());

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        String url = getIntent().getStringExtra(EXTRA_URL);
        String title = getIntent().getStringExtra(EXTRA_TITLE);
        interceptPrefix = getIntent().getStringExtra(EXTRA_INTERCEPT);
        String dc = getIntent().getStringExtra(EXTRA_DONE_COOKIES);
        String dor = getIntent().getStringExtra(EXTRA_DONE_ORIGINS);
        doneCookies = dc != null && !dc.isEmpty() ? dc.split(",") : null;
        doneOrigins = dor != null && !dor.isEmpty() ? dor.split(",") : null;
        doneScript = getIntent().getStringExtra(EXTRA_DONE_SCRIPT);

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
        done.setText("I'm signed in");
        done.setAllCaps(false);
        done.setOnClickListener(v -> finishWith(Activity.RESULT_OK, "done", null));
        // OAuth flows finish on their own redirect, so "Done" only makes sense for cookie sign-in.
        if (interceptPrefix != null) done.setVisibility(android.view.View.INVISIBLE);

        bar.addView(close);
        bar.addView(label, labelLp);
        bar.addView(done);

        TextView hint = new TextView(this);
        hint.setText(interceptPrefix != null
            ? "Sign in on Swiggy's page. Sasta never sees your number or OTP."
            : "Tap Login on this page, enter your number and OTP. Sasta never sees them.");
        hint.setTextColor(Color.parseColor("#6b6d80"));
        hint.setTextSize(12);
        hint.setGravity(Gravity.CENTER);
        hint.setPadding(pad, 0, pad, dp(8));

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

            // Belt and braces for the OAuth redirect: some navigations skip shouldOverrideUrlLoading,
            // and a blocked http://localhost load must still hand the code back.
            @Override
            public android.webkit.WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String u = request.getUrl().toString();
                if (interceptPrefix != null && u.startsWith(interceptPrefix)) {
                    poll.post(() -> finishWith(Activity.RESULT_OK, "redirect", u));
                    return new android.webkit.WebResourceResponse("text/plain", "utf-8", new java.io.ByteArrayInputStream(new byte[0]));
                }
                return null;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, android.webkit.WebResourceError error) {
                String u = request.getUrl().toString();
                if (interceptPrefix != null && u.startsWith(interceptPrefix)) finishWith(Activity.RESULT_OK, "redirect", u);
            }
        });

        root.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(hint, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
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
        if ((doneCookies != null && doneOrigins != null) || doneScript != null) poll.postDelayed(this::checkSignedIn, 1500);
    }

    /** Closes the screen as soon as a cookie that proves sign-in shows up. */
    private void checkSignedIn() {
        if (finished) return;
        if (doneScript != null) {
            webView.evaluateJavascript("(function(){try{return !!(" + doneScript + ")}catch(e){return false}})()", value -> {
                if ("true".equals(value)) signedIn();
            });
        }
        if (doneCookies == null || doneOrigins == null) {
            poll.postDelayed(this::checkSignedIn, 1000);
            return;
        }
        CookieManager cm = CookieManager.getInstance();
        for (String origin : doneOrigins) {
            String raw = cm.getCookie(origin);
            if (raw == null) continue;
            for (String part : raw.split(";")) {
                String p = part.trim();
                int eq = p.indexOf('=');
                if (eq <= 0 || eq == p.length() - 1) continue; // ignore empty values
                String name = p.substring(0, eq);
                for (String want : doneCookies) {
                    if (want.equals(name)) {
                        signedIn();
                        return;
                    }
                }
            }
        }
        poll.postDelayed(this::checkSignedIn, 1000);
    }

    private boolean signedInShown = false;

    private void signedIn() {
        if (finished || signedInShown) return;
        signedInShown = true;
        android.widget.Toast.makeText(this, "Signed in · returning to Sasta", android.widget.Toast.LENGTH_SHORT).show();
        // Give the site a moment to finish writing its own storage before closing.
        poll.postDelayed(() -> finishWith(Activity.RESULT_OK, "done", null), 1200);
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
        poll.removeCallbacksAndMessages(null);
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
