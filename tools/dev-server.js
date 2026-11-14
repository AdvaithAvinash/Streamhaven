/* Zero-dependency static server for previewing Streamhaven in a desktop browser:
 *   node tools/dev-server.js [port]     then open http://localhost:8080
 * Arrow keys / Enter / Esc emulate the remote. PageUp/PageDown = CH+/CH-. */
var http = require('http'), fs = require('fs'), path = require('path');
var root = path.resolve(__dirname, '..'), port = +process.argv[2] || 8080;
var types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.m3u': 'audio/x-mpegurl', '.xml': 'application/xml' };
http.createServer(function (req, res) {
  var p = path.normalize(path.join(root, decodeURIComponent(req.url.split('?')[0])));
  if (p.indexOf(root) !== 0) { res.writeHead(403); return res.end(); }
  fs.stat(p, function (err, st) {
    if (!err && st.isDirectory()) p = path.join(p, 'index.html');
    fs.readFile(p, function (e, buf) {
      if (e) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(buf);
    });
  });
}).listen(port, function () { console.log('Streamhaven preview: http://localhost:' + port); });
