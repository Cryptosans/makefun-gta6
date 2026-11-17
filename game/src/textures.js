// textures.js — every texture in Solara Bay is drawn at runtime on a canvas:
// building facades, road markings, sand and the pier. No image files are loaded.
(function () {
  'use strict';
  var U = window.SB.util;

  function canvasTexture(w, h, draw) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    var tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    return tex;
  }

  function shade(hex, amt) {
    var r = ((hex >> 16) & 255) + amt, g = ((hex >> 8) & 255) + amt, b = (hex & 255) + amt;
    r = U.clamp(r, 0, 255); g = U.clamp(g, 0, 255); b = U.clamp(b, 0, 255);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  // A building facade: base colour, lit and dark window grids, a ground-floor shop band.
  function buildingTexture(rng, baseHex, floors, cols) {
    return canvasTexture(256, 256, function (ctx, w, h) {
      ctx.fillStyle = shade(baseHex, 0);
      ctx.fillRect(0, 0, w, h);
      // subtle vertical grime
      for (var i = 0; i < 26; i++) {
        ctx.fillStyle = 'rgba(0,0,0,' + (rng() * 0.08).toFixed(3) + ')';
        ctx.fillRect(rng() * w, 0, 2 + rng() * 6, h);
      }
      var cw = w / cols, ch = h / (floors + 1);
      for (var f = 0; f < floors; f++) {
        for (var c = 0; c < cols; c++) {
          var lit = rng() < 0.28;
          ctx.fillStyle = lit ? '#ffe9a8' : (rng() < 0.5 ? '#5d7d8c' : '#3d5563');
          ctx.fillRect(c * cw + cw * 0.18, f * ch + ch * 0.22, cw * 0.64, ch * 0.56);
          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          ctx.fillRect(c * cw + cw * 0.18, f * ch + ch * 0.22, cw * 0.64, 3);
        }
      }
      // ground floor: shopfront band
      ctx.fillStyle = shade(baseHex, -34);
      ctx.fillRect(0, h - ch * 0.9, w, ch * 0.9);
      ctx.fillStyle = 'rgba(140,220,255,0.55)';
      for (var s = 0; s < cols; s++) ctx.fillRect(s * cw + cw * 0.12, h - ch * 0.72, cw * 0.76, ch * 0.5);
    });
  }

  // Road surface with a dashed centre line (drawn per road segment).
  function roadTexture(len) {
    return canvasTexture(128, 512, function (ctx, w, h) {
      ctx.fillStyle = '#3a3d42';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      for (var i = 0; i < 40; i++) ctx.fillRect(Math.random() * w, Math.random() * h, 3, 3);
      ctx.fillStyle = '#f5d76e';
      ctx.fillRect(w / 2 - 3, 0, 6, h);
      ctx.fillStyle = '#3a3d42';
      for (var y = 0; y < h; y += 64) ctx.fillRect(w / 2 - 4, y, 8, 34);
      ctx.fillStyle = '#e8e8e8';
      ctx.fillRect(4, 0, 3, h);
      ctx.fillRect(w - 7, 0, 3, h);
    });
  }

  function sandTexture(rng) {
    return canvasTexture(256, 256, function (ctx, w, h) {
      ctx.fillStyle = '#e8d29a';
      ctx.fillRect(0, 0, w, h);
      for (var i = 0; i < 900; i++) {
        ctx.fillStyle = rng() < 0.5 ? 'rgba(180,150,90,0.35)' : 'rgba(255,240,200,0.35)';
        ctx.fillRect(rng() * w, rng() * h, 2, 2);
      }
    });
  }

  function grassTexture(rng) {
    return canvasTexture(256, 256, function (ctx, w, h) {
      ctx.fillStyle = '#8fa06b';
      ctx.fillRect(0, 0, w, h);
      for (var i = 0; i < 1400; i++) {
        ctx.fillStyle = rng() < 0.5 ? 'rgba(90,120,60,0.4)' : 'rgba(170,190,120,0.35)';
        ctx.fillRect(rng() * w, rng() * h, 2, 3);
      }
    });
  }

  function roofTexture(rng, baseHex) {
    return canvasTexture(128, 128, function (ctx, w, h) {
      ctx.fillStyle = shade(baseHex, -26);
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 2;
      for (var i = 0; i <= 4; i++) {
        ctx.beginPath(); ctx.moveTo(i * 32, 0); ctx.lineTo(i * 32, h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * 32); ctx.lineTo(w, i * 32); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(8, 8, 40, 26);
      ctx.fillRect(70, 60, 30, 30);
    });
  }

  window.SB.textures = { canvasTexture, buildingTexture, roadTexture, sandTexture, grassTexture, roofTexture, shade };
})();
