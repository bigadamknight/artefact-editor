/**
 * Script injected into the preview iframe to bridge with the editor.
 *
 * Two responsibilities:
 *
 * 1. Click-to-select. Walks up from the click target to the nearest
 *    [data-edit-id] ancestor; posts `{ type: "ae:select", blockId }`.
 *
 * 2. Transport (when the page exposes `window.__timelines.<key>` — used by
 *    hyperframes-style artefacts). Inbound messages: `{ type: "ae:transport",
 *    action: "play" | "pause" | "seek", time? }`. Outbound:
 *      `{ type: "ae:ready", duration }` once the timeline is detected.
 *      `{ type: "ae:tick", time, duration, playing }` while ticking.
 *
 * If `window.__timelines` is absent (static HTML pages with no timeline),
 * transport is a no-op and only click-to-select is active.
 */
export const previewBridgeScript = `
(function () {
  // Inject editor-only styles for hover + selected affordances.
  var aeStyle = document.createElement('style');
  aeStyle.textContent =
    '[data-edit-id]{outline:1px dashed transparent;outline-offset:2px;transition:outline-color .12s;}' +
    '[data-edit-id]:hover{outline-color:rgba(56,189,248,.7);}' +
    '[data-edit-id].ae-selected{outline:2px solid #38bdf8;outline-offset:2px;}';
  document.head.appendChild(aeStyle);

  var selectedEl = null;
  var STYLE_KEYS = [
    'color', 'font-size', 'font-weight', 'font-family', 'text-align', 'letter-spacing', 'line-height',
    'top', 'left', 'right', 'bottom',
    'width', 'height',
    'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'transform', 'opacity', 'z-index'
  ];
  function postSelectedStyles() {
    if (!selectedEl) return;
    var cs = window.getComputedStyle(selectedEl);
    var styles = {};
    for (var i = 0; i < STYLE_KEYS.length; i++) {
      var k = STYLE_KEYS[i];
      styles[k] = cs.getPropertyValue(k);
    }
    window.parent.postMessage({
      type: 'ae:styles',
      blockId: selectedEl.getAttribute('data-edit-id'),
      styles: styles
    }, '*');
  }
  function setSelected(id) {
    if (selectedEl) selectedEl.classList.remove('ae-selected');
    selectedEl = id ? document.querySelector('[data-edit-id="' + id + '"]') : null;
    if (selectedEl) selectedEl.classList.add('ae-selected');
    postSelectedStyles();
  }

  function findEditId(el) {
    while (el && el !== document.documentElement) {
      if (el.getAttribute && el.getAttribute('data-edit-id')) {
        return el.getAttribute('data-edit-id');
      }
      el = el.parentElement;
    }
    return null;
  }
  document.addEventListener('click', function (e) {
    var id = findEditId(e.target);
    if (id) {
      e.preventDefault();
      e.stopPropagation();
      setSelected(id);
      window.parent.postMessage({ type: 'ae:select', blockId: id }, '*');
    }
  }, true);
  document.addEventListener('mouseover', function (e) {
    var id = findEditId(e.target);
    document.body.style.cursor = id ? 'pointer' : '';
  }, true);

  function getTimeline() {
    var tls = window.__timelines;
    if (!tls) return null;
    var keys = Object.keys(tls);
    return keys.length ? tls[keys[0]] : null;
  }

  function getNaturalSize() {
    var root = document.querySelector('[data-composition-id], #root');
    var w = root && root.getAttribute('data-width');
    var h = root && root.getAttribute('data-height');
    var width = w ? parseFloat(w) : (root ? root.scrollWidth : document.documentElement.scrollWidth);
    var height = h ? parseFloat(h) : (root ? root.scrollHeight : document.documentElement.scrollHeight);
    return { width: width || null, height: height || null };
  }

  function postReady() {
    var tl = getTimeline();
    var size = getNaturalSize();
    window.parent.postMessage({
      type: 'ae:ready',
      duration: tl && typeof tl.duration === 'function' ? tl.duration() : null,
      width: size.width,
      height: size.height
    }, '*');
  }

  var audioStates = {};
  function syncAudio(t, playing) {
    var audios = document.querySelectorAll('audio[data-start]');
    for (var i = 0; i < audios.length; i++) {
      var a = audios[i];
      var key = a.id || ('idx_' + i);
      var start = parseFloat(a.getAttribute('data-start') || '0');
      var duration = parseFloat(a.getAttribute('data-duration') || '99999');
      var baseVolume = parseFloat(a.getAttribute('data-volume') || '1');
      var inRange = t >= start && t < start + duration;
      var prev = audioStates[key] || { wasActive: false };

      if (playing && inRange) {
        if (!prev.wasActive) {
          a.currentTime = Math.max(0, t - start);
          a.volume = baseVolume;
          a.play().catch(function () {});
          audioStates[key] = { wasActive: true };
        } else {
          var expected = t - start;
          if (Math.abs(a.currentTime - expected) > 0.2) {
            a.currentTime = Math.max(0, expected);
          }
        }
      } else {
        if (prev.wasActive || !a.paused) {
          a.pause();
        }
        audioStates[key] = { wasActive: false };
      }
    }
  }

  function startTickLoop() {
    var lastTime = -1;
    var lastPlaying = null;
    function tick() {
      var tl = getTimeline();
      if (tl && typeof tl.time === 'function') {
        var t = tl.time();
        var playing = typeof tl.paused === 'function' ? !tl.paused() : false;
        syncAudio(t, playing);
        if (Math.abs(t - lastTime) > 0.01 || playing !== lastPlaying) {
          window.parent.postMessage({
            type: 'ae:tick',
            time: t,
            duration: tl.duration(),
            playing: playing
          }, '*');
          lastTime = t;
          lastPlaying = playing;
        }
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // Some compositions start at a literal blank frame (eg. a fly-through where
  // the camera is far back at t=0). Seeking to a representative frame on
  // initial load avoids the "looks broken" first impression. Authors can pin
  // an exact frame with a data-poster-time attribute on the root; otherwise
  // we use duration / 2 as a reasonable default.
  function pickPosterTime(tl) {
    var root = document.querySelector('[data-composition-id], #root');
    var attr = root && root.getAttribute('data-poster-time');
    if (attr != null && attr !== '') {
      var v = parseFloat(attr);
      if (!isNaN(v)) return v;
    }
    var d = typeof tl.duration === 'function' ? tl.duration() : 0;
    return d > 0 ? d / 2 : 0;
  }

  // Wait briefly for the page's own script to create the timeline.
  var waited = 0;
  var waitInterval = setInterval(function () {
    if (getTimeline() || waited > 2000) {
      clearInterval(waitInterval);
      var tl = getTimeline();
      if (tl && typeof tl.seek === 'function') {
        try { tl.seek(pickPosterTime(tl)); tl.pause && tl.pause(); } catch (_) {}
      }
      postReady();
      if (tl) startTickLoop();
    }
    waited += 50;
  }, 50);

  window.addEventListener('message', function (e) {
    var data = e.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'ae:set-selected') {
      setSelected(typeof data.blockId === 'string' ? data.blockId : null);
      return;
    }
    if (data.type !== 'ae:transport') return;
    var tl = getTimeline();
    if (!tl) return;
    if (data.action === 'play' && typeof tl.play === 'function') tl.play();
    else if (data.action === 'pause' && typeof tl.pause === 'function') tl.pause();
    else if (data.action === 'seek' && typeof tl.seek === 'function' && typeof data.time === 'number') {
      tl.seek(data.time);
    }
  });
})();
`;
