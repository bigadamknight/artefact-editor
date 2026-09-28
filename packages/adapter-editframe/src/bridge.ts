/**
 * Preview-iframe bridge for editframe compositions.
 *
 * Mirrors the html adapter's bridge but drives transport through the root
 * `<ef-timegroup>` element instead of `window.__timelines`.
 *
 * Outbound messages (to the editor):
 *   - `{ type: "ae:select", blockId }` — element click-to-select
 *   - `{ type: "ae:styles", blockId, styles }` — computed style snapshot
 *   - `{ type: "ae:ready", duration, width, height }` — emitted once the
 *     root timegroup is upgraded and reports a non-zero duration. `duration`
 *     is in **seconds** for parity with the html bridge (the editor's
 *     transport model is in seconds; we convert from `currentTimeMs`).
 *   - `{ type: "ae:tick", time, duration, playing }` — playhead in seconds
 *
 * Inbound messages (from the editor):
 *   - `{ type: "ae:set-selected", blockId }`
 *   - `{ type: "ae:transport", action: "play" | "pause" | "seek", time? }`
 *
 * Clock strategy (preferred → fallback):
 *
 *   1. **Frame-task mode** — if `tg.addFrameTask` exists, register there.
 *      Editframe drives the callback each rendered frame during playback,
 *      so we observe `info.currentTimeMs` directly. Pause detection is a
 *      watchdog: if no frame task fires for 120ms after the last one, the
 *      engine has stopped advancing → emit a `playing: false` tick.
 *      Time advancement is the engine's job; we never write currentTimeMs
 *      ourselves except via `seek()`.
 *
 *   2. **Engine-driven rAF mode** — if `addFrameTask` is missing but
 *      `play`/`pause` exist, run a rAF loop that just observes the engine's
 *      `currentTimeMs` + `paused`. We don't advance time, the engine does.
 *
 *   3. **Manual rAF mode** — if neither addFrameTask nor play/pause exist,
 *      we call `seek(ms)` ourselves on each rAF to advance time. This is
 *      a defensive fallback for unfamiliar API shapes; keeps scrubbing
 *      working even on a stripped-down build.
 *
 * Seek-while-paused: addFrameTask doesn't fire when paused, so after every
 * inbound `seek` we post a one-shot synthetic tick so the editor's
 * playhead UI stays in sync without waiting for play.
 */
export const editframePreviewBridgeScript = `
(function () {
  var aeStyle = document.createElement('style');
  aeStyle.textContent =
    '[data-edit-id]{outline:1px dashed transparent;outline-offset:2px;transition:outline-color .12s;}' +
    '[data-edit-id]:hover{outline-color:rgba(56,189,248,.7);}' +
    '[data-edit-id].ae-selected{outline:2px solid #38bdf8;outline-offset:2px;}';
  document.head.appendChild(aeStyle);

  var STYLE_KEYS = ['color','background-color','font-size','font-weight','font-family','line-height','letter-spacing','text-align','padding','margin','border-radius','opacity'];
  var selectedEl = null;
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

  function rootTimegroup() {
    return document.querySelector('ef-timegroup');
  }
  function tgDurationSec(tg) {
    if (!tg) return null;
    var ms = tg.durationMs;
    if (typeof ms !== 'number' || !isFinite(ms) || ms <= 0) {
      var d = tg.duration;
      if (typeof d === 'number' && isFinite(d) && d > 0) return d > 1000 ? d / 1000 : d;
      var attr = tg.getAttribute && tg.getAttribute('duration');
      if (attr) {
        var m = /^([0-9]*\\.?[0-9]+)(ms|s)?$/.exec(attr.trim());
        if (m) {
          var v = parseFloat(m[1]);
          return m[2] === 'ms' ? v / 1000 : v;
        }
      }
      return null;
    }
    return ms / 1000;
  }
  function tgTimeSec(tg) {
    if (!tg) return 0;
    var ms = tg.currentTimeMs;
    return typeof ms === 'number' && isFinite(ms) ? ms / 1000 : 0;
  }

  function callPlay(tg) {
    if (tg && typeof tg.play === 'function') {
      try { tg.play(); return true; } catch (_) {}
    }
    return false;
  }
  function callPause(tg) {
    if (tg && typeof tg.pause === 'function') {
      try { tg.pause(); return true; } catch (_) {}
    }
    return false;
  }
  function callSeek(tg, sec) {
    if (!tg) return;
    var ms = sec * 1000;
    if (typeof tg.seek === 'function') {
      try { tg.seek(ms); return; } catch (_) {}
    }
    if ('currentTimeMs' in tg) {
      try { tg.currentTimeMs = ms; } catch (_) {}
    }
  }

  function getNaturalSize() {
    var tg = rootTimegroup();
    var w = tg && (tg.getAttribute('width') || tg.getAttribute('data-width'));
    var h = tg && (tg.getAttribute('height') || tg.getAttribute('data-height'));
    var width = w ? parseFloat(w) : (tg ? tg.scrollWidth : document.documentElement.scrollWidth);
    var height = h ? parseFloat(h) : (tg ? tg.scrollHeight : document.documentElement.scrollHeight);
    return { width: width || null, height: height || null };
  }

  function postReady() {
    var tg = rootTimegroup();
    var size = getNaturalSize();
    window.parent.postMessage({
      type: 'ae:ready',
      duration: tgDurationSec(tg),
      width: size.width,
      height: size.height
    }, '*');
  }

  function postTick(tg, playing) {
    if (!tg) return;
    window.parent.postMessage({
      type: 'ae:tick',
      time: tgTimeSec(tg),
      duration: tgDurationSec(tg) || 0,
      playing: !!playing
    }, '*');
  }

  // ----------------------- Clock modes ---------------------------------

  // Mode 1: addFrameTask — preferred. The engine drives time; we observe.
  function startFrameTaskMode(tg) {
    var lastFrameAt = 0;
    var pauseWatchdog = null;
    function schedulePauseDetect() {
      if (pauseWatchdog) clearTimeout(pauseWatchdog);
      pauseWatchdog = setTimeout(function () {
        // No frame in PAUSE_GAP_MS → engine has stopped advancing.
        var t = rootTimegroup();
        if (t) postTick(t, false);
      }, 120);
    }
    tg.addFrameTask(function (info) {
      lastFrameAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      // Engine is rendering a frame → playing.
      window.parent.postMessage({
        type: 'ae:tick',
        time: (info && typeof info.currentTimeMs === 'number') ? info.currentTimeMs / 1000 : tgTimeSec(tg),
        duration: tgDurationSec(tg) || 0,
        playing: true
      }, '*');
      schedulePauseDetect();
    });
    return { kind: 'frameTask', tg: tg };
  }

  // Mode 2: rAF observe — engine has play/pause but no addFrameTask.
  function startObserveMode(tg) {
    var lastTime = -1;
    var lastPlaying = null;
    function tick() {
      var t = tgTimeSec(tg);
      var p = ('paused' in tg) ? !tg.paused : (Math.abs(t - lastTime) > 1e-4);
      if (Math.abs(t - lastTime) > 0.01 || p !== lastPlaying) {
        postTick(tg, p);
        lastTime = t;
        lastPlaying = p;
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    return { kind: 'observe', tg: tg };
  }

  // Mode 3: rAF advance — no engine controls; we move time ourselves.
  // 'playing' is ours to track; transport messages flip it.
  var manualPlaying = false;
  function setManualPlaying(v) { manualPlaying = !!v; }
  function startManualMode(tg) {
    var lastTime = -1;
    var lastPlaying = null;
    var lastWallMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    function tick(nowMs) {
      var dt = (nowMs - lastWallMs) / 1000;
      lastWallMs = nowMs;
      if (manualPlaying) {
        var sec = tgTimeSec(tg) + dt;
        var dur = tgDurationSec(tg);
        if (dur && sec >= dur) { sec = dur; manualPlaying = false; }
        callSeek(tg, sec);
      }
      var t = tgTimeSec(tg);
      if (Math.abs(t - lastTime) > 0.01 || manualPlaying !== lastPlaying) {
        postTick(tg, manualPlaying);
        lastTime = t;
        lastPlaying = manualPlaying;
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    return { kind: 'manual', tg: tg };
  }

  function pickClock(tg) {
    if (typeof tg.addFrameTask === 'function' && (typeof tg.play === 'function' || typeof tg.pause === 'function')) {
      return startFrameTaskMode(tg);
    }
    if (typeof tg.play === 'function' || ('paused' in tg)) {
      return startObserveMode(tg);
    }
    return startManualMode(tg);
  }

  function pickPosterTime(tg) {
    var attr = tg && (tg.getAttribute('data-poster-time') || tg.getAttribute('poster-time'));
    if (attr != null && attr !== '') {
      var v = parseFloat(attr);
      if (!isNaN(v)) return v;
    }
    var d = tgDurationSec(tg);
    return d && d > 0 ? d / 2 : 0;
  }

  // Wait for the root timegroup to upgrade and report a duration.
  var clock = null;
  var waited = 0;
  var waitInterval = setInterval(function () {
    var tg = rootTimegroup();
    var ready = tg && tgDurationSec(tg) != null;
    if (ready || waited > 4000) {
      clearInterval(waitInterval);
      var rtg = rootTimegroup();
      if (rtg) {
        try { callSeek(rtg, pickPosterTime(rtg)); callPause(rtg); } catch (_) {}
        clock = pickClock(rtg);
      }
      postReady();
      // Emit an initial paused tick so the editor reflects the poster time
      // even before the user hits play.
      if (rtg) postTick(rtg, false);
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
    var tg = rootTimegroup();
    if (!tg) return;
    if (data.action === 'play') {
      if (clock && clock.kind === 'manual') setManualPlaying(true);
      callPlay(tg);
    } else if (data.action === 'pause') {
      if (clock && clock.kind === 'manual') setManualPlaying(false);
      callPause(tg);
      // Emit a final paused tick — addFrameTask mode will already detect this
      // via watchdog, but observe/manual modes benefit from the immediate signal.
      postTick(tg, false);
    } else if (data.action === 'seek' && typeof data.time === 'number') {
      callSeek(tg, data.time);
      // addFrameTask doesn't fire while paused, so push a synthetic tick so
      // the editor's playhead UI updates immediately on scrub-while-paused.
      postTick(tg, !!(clock && clock.kind === 'manual' && manualPlaying));
    }
  });
})();
`;
