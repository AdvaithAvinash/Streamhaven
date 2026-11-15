package app.streamhaven.tv;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.zip.GZIPInputStream;
import java.util.Map;

/** Plain-Java HTTP client used by the WebView bridge. No Android dependencies, so it can be tested on a JVM.
 *  Unlike XMLHttpRequest it ignores CORS, may send Cookie / User-Agent headers, and follows http<->https redirects. */
public final class HttpBridge {
    public static final class Result {
        public int status;          // HTTP status, or 0 when the request failed before a response arrived
        public byte[] body = new byte[0];
        public String error = "";
    }

    private static final int MAX_BODY = 160 * 1024 * 1024;

    public static Result execute(String method, String url, Map<String, String> headers, byte[] body, int timeoutMs) {
        Result r = new Result();
        String current = url;
        try {
            for (int hop = 0; hop < 6; hop++) {
                HttpURLConnection c = (HttpURLConnection) new URL(current).openConnection();
                c.setInstanceFollowRedirects(false);
                c.setConnectTimeout(Math.min(timeoutMs, 15000));
                c.setReadTimeout(timeoutMs);
                c.setRequestMethod(method);
                boolean hasUa = false;
                if (headers != null) for (Map.Entry<String, String> h : headers.entrySet()) {
                    if ("user-agent".equalsIgnoreCase(h.getKey())) hasUa = true;
                    c.setRequestProperty(h.getKey(), h.getValue());
                }
                if (!hasUa) c.setRequestProperty("User-Agent", "Streamhaven/0.2 (Android)");
                boolean send = body != null && body.length > 0 && hop == 0 && !"GET".equals(method);
                if (send) {
                    c.setDoOutput(true);
                    c.setFixedLengthStreamingMode(body.length);
                    OutputStream os = c.getOutputStream();
                    os.write(body);
                    os.close();
                }
                int code = c.getResponseCode();
                if (code >= 300 && code < 400 && code != 304) {
                    String loc = c.getHeaderField("Location");
                    c.disconnect();
                    if (loc == null) { r.status = code; return r; }
                    current = new URL(new URL(current), loc).toString();
                    if (code == 303) method = "GET";
                    continue;
                }
                r.status = code;
                InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
                String enc = c.getContentEncoding();     // absent when the platform already decoded it
                if (in != null && enc != null && enc.toLowerCase().contains("gzip")) in = new GZIPInputStream(in);
                if (in != null) {
                    ByteArrayOutputStream bo = new ByteArrayOutputStream(64 * 1024);
                    byte[] buf = new byte[32 * 1024];
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        bo.write(buf, 0, n);
                        if (bo.size() > MAX_BODY) throw new IOException("The response is too large");
                    }
                    in.close();
                    r.body = bo.toByteArray();
                }
                c.disconnect();
                return r;
            }
            r.status = 0; r.error = "Too many redirects";
        } catch (java.net.SocketTimeoutException e) {
            r.status = 0; r.error = "The server took too long to respond";
        } catch (IOException e) {
            r.status = 0; r.error = "Could not reach the server";
        } catch (RuntimeException e) {
            r.status = 0; r.error = "The address is not valid";
        }
        return r;
    }
}
