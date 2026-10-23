package app.sasta.android;

import android.annotation.SuppressLint;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.json.JSONObject;

/**
 * Hidden WebViews, one per platform origin, that run small scripts inside the platform's own page.
 * Requests then come from real Chrome (passes TLS-fingerprint bot checks) and carry the page's own
 * cookies and storage, so a signed-in session is used automatically. Nothing is shown on screen.
 */
public class PageRunner {

    public interface Callback {
        void done(String json); // {"ok":true,"value":…} or {"ok":false,"error":"…"}
    }

    private static class Page {
        WebView view;
        boolean ready;
        final List<Runnable> queue = new ArrayList<>();
    }

    private final Context context;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Map<String, Page> pages = new HashMap<>();
    private final Map<String, Callback> pending = new HashMap<>();

    public PageRunner(Context context) {
        this.context = context.getApplicationContext();
    }

    /** Runs `script` (the body of an async JS function) on `origin` and calls back with its JSON result. */
    public void run(String origin, String script, long timeoutMs, Callback cb) {
        main.post(() -> {
            Page page = pages.get(origin);
            if (page == null) page = open(origin);
            final Page p = page;
            Runnable job = () -> execute(p, script, timeoutMs, cb);
            if (p.ready) job.run();
            else p.queue.add(job);
        });
    }

    /** Drops the hidden page for an origin, e.g. after sign-out, so the next run starts fresh. */
    public void reset(String origin) {
        main.post(() -> {
            Page p = pages.remove(origin);
            if (p != null) p.view.destroy();
        });
    }

    @SuppressLint({ "SetJavaScriptEnabled", "AddJavascriptInterface" })
    private Page open(String origin) {
        Page page = new Page();
        WebView v = new WebView(context);
        WebSettings s = v.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setUserAgentString(s.getUserAgentString().replace("; wv", ""));
        s.setBlockNetworkImage(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(v, true);
        v.addJavascriptInterface(new Bridge(), "SastaBridge");
        v.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                if (page.ready) return;
                page.ready = true;
                for (Runnable r : page.queue) r.run();
                page.queue.clear();
            }
        });
        page.view = v;
        pages.put(origin, page);
        v.loadUrl(origin);
        // If the page never finishes (offline, challenge loop), fail queued work instead of hanging.
        main.postDelayed(() -> {
            if (!page.ready) {
                page.ready = true;
                for (Runnable r : page.queue) r.run();
                page.queue.clear();
            }
        }, 15000);
        return page;
    }

    private void execute(Page page, String script, long timeoutMs, Callback cb) {
        String id = UUID.randomUUID().toString();
        pending.put(id, cb);
        String js =
            "(async()=>{try{const v=await (async()=>{" + script + "})();" +
            "SastaBridge.resolve('" + id + "',JSON.stringify({ok:true,value:v}))}" +
            "catch(e){SastaBridge.resolve('" + id + "',JSON.stringify({ok:false,error:String(e&&e.message||e)}))}})();";
        page.view.evaluateJavascript(js, null);
        main.postDelayed(() -> {
            Callback c = pending.remove(id);
            if (c != null) c.done("{\"ok\":false,\"error\":\"Timed out\"}");
        }, timeoutMs);
    }

    private class Bridge {
        @JavascriptInterface
        public void resolve(String id, String json) {
            main.post(() -> {
                Callback c = pending.remove(id);
                if (c != null) c.done(json);
            });
        }
    }

    static String error(String msg) {
        try {
            return new JSONObject().put("ok", false).put("error", msg).toString();
        } catch (Exception e) {
            return "{\"ok\":false}";
        }
    }
}
