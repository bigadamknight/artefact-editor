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

  function postReady() {
    var tl = getTimeline();
    window.parent.postMessage({
      type: 'ae:ready',
      duration: tl && typeof tl.duration === 'function' ? tl.duration() : null
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

  // Wait briefly for the page's own script to create the timeline.
  var waited = 0;
  var waitInterval = setInterval(function () {
    if (getTimeline() || waited > 2000) {
      clearInterval(waitInterval);
      postReady();
      if (getTimeline()) startTickLoop();
    }
    waited += 50;
  }, 50);

  window.addEventListener('message', function (e) {
    var data = e.data;
    if (!data || data.type !== 'ae:transport') return;
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
