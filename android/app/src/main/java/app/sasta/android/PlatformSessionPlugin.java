package app.sasta.android;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.webkit.CookieManager;
import android.webkit.WebStorage;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.ArrayList;
import java.util.List;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONException;

/**
 * Sign-in sessions for each shopping platform, kept only on this phone.
 * - signIn: opens SignInActivity on the platform's own login page (or an OAuth authorize URL).
 * - cookieNames / clearSession: inspect or wipe a platform's cookies. Values never leave native code.
 * - secureSet / secureGet / secureRemove: small secrets (OAuth tokens) encrypted with an Android Keystore key.
 */
@CapacitorPlugin(name = "PlatformSession")
public class PlatformSessionPlugin extends Plugin {

    private static final String KEY_ALIAS = "sasta_session_key";
    private PageRunner runner;

    @Override
    public void load() {
        runner = new PageRunner(getContext());
    }

    /**
     * Runs a script inside the platform's own page (hidden WebView) and returns its JSON result.
     * Used by live adapters so requests look like real Chrome and carry the signed-in session.
     */
    @PluginMethod
    public void pageRun(PluginCall call) {
        String origin = call.getString("origin");
        String script = call.getString("script");
        if (origin == null || script == null) {
            call.reject("origin and script are required");
            return;
        }
        long timeout = call.getLong("timeoutMs", 15000L);
        runner.run(origin, script, timeout, json -> {
            try {
                call.resolve(new JSObject(json));
            } catch (JSONException e) {
                call.reject("Bad result from page");
            }
        });
    }

    @PluginMethod
    public void pageReset(PluginCall call) {
        String origin = call.getString("origin");
        if (origin != null) runner.reset(origin);
        call.resolve();
    }
    private static final String PREFS = "sasta_secure";

    @PluginMethod
    public void signIn(PluginCall call) {
        String url = call.getString("url");
        if (url == null) {
            call.reject("url is required");
            return;
        }
        Intent intent = new Intent(getContext(), SignInActivity.class);
        intent.putExtra(SignInActivity.EXTRA_URL, url);
        intent.putExtra(SignInActivity.EXTRA_TITLE, call.getString("title", "Sign in"));
        String intercept = call.getString("interceptPrefix");
        if (intercept != null) intent.putExtra(SignInActivity.EXTRA_INTERCEPT, intercept);
        startActivityForResult(call, intent, "signInResult");
    }

    @ActivityCallback
    private void signInResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject ret = new JSObject();
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null) {
            ret.put("kind", "cancelled");
        } else {
            ret.put("kind", data.getStringExtra(SignInActivity.RESULT_KIND));
            String redirect = data.getStringExtra(SignInActivity.RESULT_URL);
            if (redirect != null) ret.put("redirectUrl", redirect);
        }
        call.resolve(ret);
    }

    /** Names (never values) of cookies the WebView holds for each URL. */
    @PluginMethod
    public void cookieNames(PluginCall call) {
        JSArray urls = call.getArray("urls", new JSArray());
        JSArray names = new JSArray();
        try {
            for (String u : urls.<String>toList()) {
                for (String n : namesFor(u)) if (!contains(names, n)) names.put(n);
            }
        } catch (JSONException e) {
            call.reject("urls must be an array of strings");
            return;
        }
        JSObject ret = new JSObject();
        ret.put("names", names);
        call.resolve(ret);
    }

    /** Expires every cookie and wipes web storage for the given URLs. */
    @PluginMethod
    public void clearSession(PluginCall call) {
        JSArray urls = call.getArray("urls", new JSArray());
        CookieManager cm = CookieManager.getInstance();
        try {
            for (String u : urls.<String>toList()) {
                Uri uri = Uri.parse(u);
                String host = uri.getHost();
                for (String name : namesFor(u)) {
                    String expired = name + "=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/";
                    cm.setCookie(u, expired);
                    if (host != null) {
                        cm.setCookie(u, expired + "; Domain=" + host);
                        String parent = host.startsWith("www.") ? host.substring(4) : host;
                        cm.setCookie(u, expired + "; Domain=." + parent);
                    }
                }
                WebStorage.getInstance().deleteOrigin(uri.getScheme() + "://" + host);
                runner.reset(uri.getScheme() + "://" + host);
            }
        } catch (JSONException e) {
            call.reject("urls must be an array of strings");
            return;
        }
        cm.flush();
        call.resolve();
    }

    @PluginMethod
    public void secureSet(PluginCall call) {
        String key = call.getString("key");
        String value = call.getString("value");
        if (key == null || value == null) {
            call.reject("key and value are required");
            return;
        }
        try {
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, secretKey());
            byte[] iv = c.getIV();
            byte[] ct = c.doFinal(value.getBytes(StandardCharsets.UTF_8));
            byte[] out = new byte[iv.length + ct.length];
            System.arraycopy(iv, 0, out, 0, iv.length);
            System.arraycopy(ct, 0, out, iv.length, ct.length);
            prefs().edit().putString(key, Base64.encodeToString(out, Base64.NO_WRAP)).apply();
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not store secret", e);
        }
    }

    @PluginMethod
    public void secureGet(PluginCall call) {
        String key = call.getString("key");
        String stored = prefs().getString(key, null);
        JSObject ret = new JSObject();
        if (stored == null) {
            ret.put("value", null);
            call.resolve(ret);
            return;
        }
        try {
            byte[] all = Base64.decode(stored, Base64.NO_WRAP);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, secretKey(), new GCMParameterSpec(128, all, 0, 12));
            byte[] pt = c.doFinal(all, 12, all.length - 12);
            ret.put("value", new String(pt, StandardCharsets.UTF_8));
            call.resolve(ret);
        } catch (Exception e) {
            // Key lost (e.g. backup restored to a new phone): drop the secret, caller reconnects.
            prefs().edit().remove(key).apply();
            ret.put("value", null);
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void secureRemove(PluginCall call) {
        prefs().edit().remove(call.getString("key")).apply();
        call.resolve();
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private SecretKey secretKey() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias(KEY_ALIAS)) return (SecretKey) ks.getKey(KEY_ALIAS, null);
        KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        kg.init(
            new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        );
        return kg.generateKey();
    }

    private static List<String> namesFor(String url) {
        List<String> out = new ArrayList<>();
        String raw = CookieManager.getInstance().getCookie(url);
        if (raw == null) return out;
        for (String part : raw.split(";")) {
            String p = part.trim();
            int eq = p.indexOf('=');
            if (eq > 0) out.add(p.substring(0, eq));
        }
        return out;
    }

    private static boolean contains(JSArray arr, String v) {
        for (int i = 0; i < arr.length(); i++) if (v.equals(arr.optString(i))) return true;
        return false;
    }
}
