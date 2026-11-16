/* Eco Rangers — a tiny synthesized theme tune and success fanfare.
 * Pure Web Audio: no audio files, no network, nothing extra to download.
 * The tune is on by default and starts with the visitor's first tap
 * (browsers rightly block surprise sound); the fanfare rings when a
 * report is logged.
 */
(function () {
  "use strict";

  // ------------------------------------------------------------ audio graph
  // One shared AudioContext, created on the first user gesture (the tune
  // button or a report being sent). Everything routes through a gentle
  // compressor so nothing can ever get loud.
  var ctx = null, master = null, musicBus = null, sfxBus = null;
  var playing = false;
  var timer = null;      // lookahead scheduler
  var nextTime = 0;      // ctx time of the next note
  var slot = 0;          // index into the patterns
  var scheduled = 0;     // notes scheduled this session (sanity counter)
  var fanfares = 0;      // success celebrations played

  var BPM = 112;                    // a bouncy skip, not a march
  var EIGHTH = 60 / BPM / 2;
  var LEAD_LEN = 32;                // 4 bars × 8 eighth notes
  var BASS_LEN = 16;                // 4 bars × 4 quarter notes

  function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function ensureCtx() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createDynamicsCompressor();
    master.threshold.value = -18;
    master.ratio.value = 6;
    master.connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.16;     // background level: heard, never in the way
    musicBus.connect(master);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.5;
    sfxBus.connect(master);
    return ctx;
  }

  // A mallet note: a triangle at the pitch plus a soft sine an octave up
  // for the "wooden marimba" sparkle, fading away quickly (staccato).
  function pluck(bus, midi, t, dur, gain) {
    var o1 = ctx.createOscillator();
    o1.type = "triangle";
    o1.frequency.value = hz(midi);
    var o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = hz(midi + 12);
    var g2 = ctx.createGain();
    g2.gain.value = 0.35;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o1.connect(g);
    o2.connect(g2);
    g2.connect(g);
    g.connect(bus);
    o1.start(t);
    o2.start(t);
    o1.stop(t + dur + 0.05);
    o2.stop(t + dur + 0.05);
  }

  // A soft woodblock tick for the off-beats.
  function tick(t) {
    var o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = 1750;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(g);
    g.connect(musicBus);
    o.start(t);
    o.stop(t + 0.08);
  }

  // ------------------------------------------------------------ the tune
  // A four-bar loop in C major, question-and-answer shape: C lifts, Am
  // answers lower, F runs happily down, G walks home to C and breathes.
  var LEAD = [
    72, 76, 79, 76,  72, 76, 79, 76,   // C:  bouncy arpeggio
    69, 72, 76, 72,  69, 72, 76, 72,   // Am: the answer, a step lower
    65, 69, 72, 69,  77, 76, 74, 72,   // F:  then a happy little run down
    71, 74, 79, 77,  76, 74, 72, 0     // G → C: the landing note rings, then rest
  ];
  var BASS = [
    48, 48, 48, 48,  45, 45, 45, 45,   // C3, A2
    41, 41, 41, 41,  43, 43, 48, 48    // F2, G2 → C3 home
  ];

  function schedule() {
    while (nextTime < ctx.currentTime + 0.25) {
      var t = nextTime;
      var i = slot % LEAD_LEN;
      var m = LEAD[i];
      if (m) pluck(musicBus, m, t, 0.28, 0.16);
      if (i % 2 === 0) {
        var b = BASS[(i / 2) % BASS_LEN];
        if (b) pluck(musicBus, b, t, 0.34, 0.11);
      }
      if (i % 8 === 2 || i % 8 === 6) tick(t);   // beats 2 and 4
      nextTime += EIGHTH;
      slot++;
      scheduled++;
    }
  }

  function start() {
    if (playing) return true;
    if (!ensureCtx()) return false;
    if (ctx.state === "suspended") ctx.resume();
    playing = true;
    slot = 0;
    nextTime = ctx.currentTime + 0.06;
    schedule();
    timer = setInterval(schedule, 90);
    return true;
  }

  function stop() {
    playing = false;
    if (timer) { clearInterval(timer); timer = null; }
  }

  // ------------------------------------------------------------ the fanfare
  var noiseBuf = null;
  function noise(t, dur, freq, gain) {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.12, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    var f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = freq;
    f.Q.value = 1.2;
    var g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(sfxBus);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  function chime(midi, t, dur, gain) {
    var o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = hz(midi);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // The celebration when a report is logged: a rising C-major arpeggio,
  // the bottle "pop" of the bin eating it, and a bright chime on top.
  function success() {
    if (!ensureCtx()) return false;
    if (ctx.state === "suspended") ctx.resume();
    var t = ctx.currentTime + 0.02;
    fanfares++;
    // the tune politely steps back while the fanfare plays
    if (playing) {
      musicBus.gain.cancelScheduledValues(t);
      musicBus.gain.setTargetAtTime(0.05, t, 0.08);
      musicBus.gain.setTargetAtTime(0.16, t + 1.1, 0.3);
    }
    var notes = [72, 76, 79, 84];            // C5 E5 G5 C6
    for (var i = 0; i < notes.length; i++) {
      pluck(sfxBus, notes[i], t + i * 0.1, i === 3 ? 0.8 : 0.3, 0.34);
    }
    noise(t + 0.3, 0.09, 700, 0.3);          // the bin's "got it!" pop
    chime(84, t + 0.3, 1.2, 0.16);           // a bell under the last note
    var run = [86, 88, 91];                  // D6 E6 G6 sparkle
    for (var j = 0; j < run.length; j++) {
      pluck(sfxBus, run[j], t + 0.34 + j * 0.055, 0.35, 0.09);
    }
    return true;
  }

  // The easter egg's landing sound: a little "boop-beep… plop!" as the
  // bottle drops into the bin. Hover isn't a user gesture, so this stays
  // silent until the visitor has unlocked audio by tapping something.
  function egg() {
    if (!ctx || ctx.state !== "running") return false;
    var t = ctx.currentTime + 0.02;
    pluck(sfxBus, 69, t, 0.12, 0.10);         // A4 boop
    pluck(sfxBus, 81, t + 0.09, 0.22, 0.12);  // A5 beep
    noise(t + 0.16, 0.06, 900, 0.12);         // the soft plop
    return true;
  }

  // Called from the submit handler (a user gesture): opens the audio
  // context right away so the fanfare can ring the moment the badge lands.
  function arm() {
    if (!ensureCtx()) return;
    if (ctx.state === "suspended") ctx.resume();
  }

  // ------------------------------------------------------------ the button
  // The tune is on by default: browsers rightly refuse to play before a
  // gesture, so it starts with the visitor's first tap anywhere. Anyone
  // who turns it off stays off on their next visit.
  var wantPlaying = true;
  try { wantPlaying = localStorage.getItem("er-tune-off") !== "1"; } catch (e) {}

  function persistWish() {
    try { localStorage.setItem("er-tune-off", wantPlaying ? "0" : "1"); } catch (e) {}
  }

  var btn = document.getElementById("tune-btn");
  function paintBtn() {
    if (!btn) return;
    var on = playing || wantPlaying;
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.title = on ? "Stop the tune" : "Play the Eco Rangers tune";
    btn.setAttribute("aria-label", btn.title);
  }

  function firstGesture(e) {
    // the button speaks for itself — don't let a tap on it auto-start
    if (e && e.target && e.target.closest && e.target.closest("#tune-btn")) return;
    armAuto();
  }
  function armAuto() {
    document.removeEventListener("pointerdown", firstGesture);
    document.removeEventListener("keydown", firstGesture);
    if (wantPlaying && !playing) start();
    paintBtn();
  }
  if (wantPlaying) {
    document.addEventListener("pointerdown", firstGesture);
    document.addEventListener("keydown", firstGesture);
  }

  if (btn) {
    btn.addEventListener("click", function () {
      if (wantPlaying && !playing) wantPlaying = false; // stopped before it ever started
      else if (playing) { stop(); wantPlaying = false; }
      else { start(); wantPlaying = true; }
      document.removeEventListener("pointerdown", firstGesture);
      document.removeEventListener("keydown", firstGesture);
      persistWish();
      paintBtn();
    });
  }
  paintBtn(); // reflect the default right away

  // Be polite with hidden tabs: the tune pauses when the page is hidden.
  document.addEventListener("visibilitychange", function () {
    if (!ctx) return;
    if (document.hidden && playing) ctx.suspend();
    else if (!document.hidden && playing) ctx.resume();
  });

  window.EcoTune = {
    start: start,
    stop: stop,
    success: success,
    egg: egg,
    arm: arm,
    playing: function () { return playing; },
    scheduled: function () { return scheduled; },
    fanfares: function () { return fanfares; },
  };
})();
