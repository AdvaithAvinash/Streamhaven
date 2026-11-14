/* Minimal gzip / DEFLATE decoder (RFC 1951/1952), ES5, for .xml.gz guide files. */
(function () {
  'use strict';
  var SH = window.SH;
  var LB = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
  var LE = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
  var DB = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
  var DE = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
  var CL = [16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];

  function build(lengths, n) {
    var count = [], offs = [], symbol = [], i;
    for (i = 0; i < 16; i++) count[i] = 0;
    for (i = 0; i < n; i++) count[lengths[i]]++;
    count[0] = 0; offs[1] = 0;
    for (i = 1; i < 15; i++) offs[i + 1] = offs[i] + count[i];
    for (i = 0; i < n; i++) if (lengths[i]) symbol[offs[lengths[i]]++] = i;
    return { count: count, symbol: symbol };
  }
  var fixedL = null, fixedD = null;

  function inflate(src, pos) {
    var bitBuf = 0, bitCnt = 0, out = new Uint8Array(Math.max(65536, src.length * 4)), op = 0;
    function need(n) { if (op + n > out.length) { var o2 = new Uint8Array(Math.max(out.length * 2, op + n)); o2.set(out); out = o2; } }
    function bits(n) {
      while (bitCnt < n) { if (pos >= src.length) throw new Error('Unexpected end of compressed data'); bitBuf |= src[pos++] << bitCnt; bitCnt += 8; }
      var v = bitBuf & ((1 << n) - 1); bitBuf >>>= n; bitCnt -= n; return v;
    }
    function decode(h) {
      var code = 0, first = 0, index = 0;
      for (var len = 1; len <= 15; len++) {
        code |= bits(1);
        var count = h.count[len];
        if (code - count < first) return h.symbol[index + (code - first)];
        index += count; first += count; first <<= 1; code <<= 1;
      }
      throw new Error('Corrupt compressed data');
    }
    function codes(lh, dh) {
      for (;;) {
        var sym = decode(lh);
        if (sym < 256) { need(1); out[op++] = sym; }
        else if (sym === 256) return;
        else {
          sym -= 257; if (sym >= 29) throw new Error('Corrupt compressed data');
          var len = LB[sym] + bits(LE[sym]), ds = decode(dh), dist = DB[ds] + bits(DE[ds]);
          if (dist > op) throw new Error('Corrupt compressed data');
          need(len);
          for (var i = 0; i < len; i++) { out[op] = out[op - dist]; op++; }
        }
      }
    }
    var last;
    do {
      last = bits(1);
      var type = bits(2);
      if (type === 0) {
        bitBuf = 0; bitCnt = 0;
        var len = src[pos] | (src[pos + 1] << 8); pos += 4;
        need(len); for (var i = 0; i < len; i++) out[op++] = src[pos++];
      } else if (type === 1) {
        if (!fixedL) {
          var l = [], k;
          for (k = 0; k < 144; k++) l[k] = 8; for (; k < 256; k++) l[k] = 9; for (; k < 280; k++) l[k] = 7; for (; k < 288; k++) l[k] = 8;
          fixedL = build(l, 288);
          var d = []; for (k = 0; k < 30; k++) d[k] = 5; fixedD = build(d, 30);
        }
        codes(fixedL, fixedD);
      } else if (type === 2) {
        var nlen = bits(5) + 257, ndist = bits(5) + 1, ncode = bits(4) + 4, lengths = [], idx;
        for (idx = 0; idx < 19; idx++) lengths[idx] = 0;
        for (idx = 0; idx < ncode; idx++) lengths[CL[idx]] = bits(3);
        var lencode = build(lengths, 19); idx = 0; lengths = [];
        while (idx < nlen + ndist) {
          var s = decode(lencode);
          if (s < 16) lengths[idx++] = s;
          else {
            var prev = 0, rep;
            if (s === 16) { if (!idx) throw new Error('Corrupt compressed data'); prev = lengths[idx - 1]; rep = 3 + bits(2); }
            else if (s === 17) rep = 3 + bits(3); else rep = 11 + bits(7);
            while (rep--) lengths[idx++] = prev;
          }
        }
        codes(build(lengths.slice(0, nlen), nlen), build(lengths.slice(nlen), ndist));
      } else throw new Error('Corrupt compressed data');
    } while (!last);
    return out.subarray(0, op);
  }

  SH.isGzip = function (u8) { return u8.length > 18 && u8[0] === 0x1f && u8[1] === 0x8b; };
  SH.gunzip = function (u8) {
    if (!SH.isGzip(u8)) throw new Error('Not a gzip file');
    var flg = u8[3], pos = 10;
    if (flg & 4) pos += 2 + (u8[pos] | (u8[pos + 1] << 8));
    if (flg & 8) { while (u8[pos++]) {} }
    if (flg & 16) { while (u8[pos++]) {} }
    if (flg & 2) pos += 2;
    return inflate(u8, pos);
  };
})();
