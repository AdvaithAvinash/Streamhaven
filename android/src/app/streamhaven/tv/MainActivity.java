package app.streamhaven.tv;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.util.Base64;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Hosts the Streamhaven web app (assets/www) in a full-screen WebView and provides the native
 *  pieces the page cannot do itself: header-controlled HTTP, remote-control keys, lifecycle. */
public class MainActivity extends Activity {
    private WebView web;
    private final ExecutorService pool = Executors.newFixedThreadPool(4);
    private final Map<Integer, byte[]> bodies = new ConcurrentHashMap<Integer, byte[]>();
    private final Map<Integer, Boolean> binary = new ConcurrentHashMap<Integer, Boolean>();

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_FULLSCREEN);
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#080D17"));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(true);
        s.setAllowFileAccessFromFileURLs(true);          // hls.js loads segments from other hosts
        s.setAllowUniversalAccessFromFileURLs(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);   // many IPTV servers are plain http
        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient());
        web.addJavascriptInterface(new Bridge(), "SHNative");
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);
        setContentView(web);
        web.requestFocus();
        hideSystemBars();
        web.loadUrl("file:///android_asset/www/index.html");
    }

    private void hideSystemBars() {
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
    }

    private void js(final String code) {
        runOnUiThread(new Runnable() { public void run() { if (web != null) web.evaluateJavascript(code, null); } });
    }

    /** Keys the WebView does not turn into DOM key events are forwarded as logical key names. */
    private String logicalKey(int code) {
        switch (code) {
            case KeyEvent.KEYCODE_BACK: return "back";
            case KeyEvent.KEYCODE_CHANNEL_UP: return "chup";
            case KeyEvent.KEYCODE_CHANNEL_DOWN: return "chdown";
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE: return "playpause";
            case KeyEvent.KEYCODE_MEDIA_PLAY: return "play";
            case KeyEvent.KEYCODE_MEDIA_PAUSE: return "pause";
            case KeyEvent.KEYCODE_MEDIA_STOP: return "stop";
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD: return "ff";
            case KeyEvent.KEYCODE_MEDIA_REWIND: return "rw";
            case KeyEvent.KEYCODE_GUIDE: return "guide";
            case KeyEvent.KEYCODE_INFO: return "info";
            case KeyEvent.KEYCODE_PROG_RED: return "red";
            case KeyEvent.KEYCODE_PROG_GREEN: return "green";
            case KeyEvent.KEYCODE_PROG_YELLOW: return "yellow";
            case KeyEvent.KEYCODE_PROG_BLUE: return "blue";
            default: return null;
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        String k = logicalKey(keyCode);
        if (k != null) {
            if (event.getRepeatCount() == 0 || !"back".equals(k)) js("window.SH&&SH.App&&SH.App.onKey('" + k + "')");
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    public boolean onKeyUp(int keyCode, KeyEvent event) {
        if (logicalKey(keyCode) != null) return true;
        return super.onKeyUp(keyCode, event);
    }

    @Override protected void onPause() { super.onPause(); js("window.SH&&SH.Store&&SH.Store.flush();window.SH&&SH.Engine&&SH.Engine.suspend()"); }
    @Override protected void onResume() { super.onResume(); hideSystemBars(); js("window.SH&&SH.Engine&&SH.Engine.wake()"); }
    @Override public void onWindowFocusChanged(boolean hasFocus) { super.onWindowFocusChanged(hasFocus); if (hasFocus) hideSystemBars(); }

    @Override
    protected void onDestroy() {
        pool.shutdownNow();
        if (web != null) { web.removeJavascriptInterface("SHNative"); web.destroy(); web = null; }
        super.onDestroy();
    }

    /** Exposed to the page as window.SHNative. */
    private final class Bridge {
        @JavascriptInterface
        public void request(final int id, final String method, final String url, final String headersJson, final String body, final int timeout, final boolean wantBinary) {
            pool.execute(new Runnable() {
                public void run() {
                    Map<String, String> headers = new HashMap<String, String>();
                    try {
                        JSONObject o = new JSONObject(headersJson == null || headersJson.length() == 0 ? "{}" : headersJson);
                        Iterator<String> it = o.keys();
                        while (it.hasNext()) { String key = it.next(); headers.put(key, o.getString(key)); }
                    } catch (Exception ignored) { }
                    HttpBridge.Result r = HttpBridge.execute(method, url, headers, body == null || body.length() == 0 ? null : body.getBytes(java.nio.charset.Charset.forName("UTF-8")), timeout);
                    byte[] payload = r.status > 0 ? r.body : r.error.getBytes(java.nio.charset.Charset.forName("UTF-8"));
                    bodies.put(id, payload);
                    binary.put(id, wantBinary && r.status > 0);
                    js("window.__shNative(" + id + "," + r.status + ",null,false)");
                }
            });
        }

        /** Returns the body once; binary bodies are base64 so they can cross the JS bridge as a string. */
        @JavascriptInterface
        public String take(int id) {
            byte[] b = bodies.remove(id);
            if (b == null) return "";
            Boolean bin = binary.get(id);
            if (bin != null && bin.booleanValue()) return Base64.encodeToString(b, Base64.NO_WRAP);
            try { return new String(b, "UTF-8"); } catch (Exception e) { return ""; }
        }

        @JavascriptInterface
        public boolean wasBinary(int id) { Boolean b = binary.remove(id); return b != null && b.booleanValue(); }

        @JavascriptInterface
        public void exit() { runOnUiThread(new Runnable() { public void run() { finish(); } }); }
    }
}
