/* Eco Rangers — the 5-Day Recycling Challenge (one-page kid edition)
 * Vanilla JS: no frameworks, no build step. Every element lookup is
 * optional, so the file keeps working if a section is ever removed.
 *
 * 1. Loads community stats from the Rust server (where the chips are).
 * 2. In the log-in band: sends the report (name, email, bin photo,
 *    plastic count) to /api/report.
 * 3. Fetches the personalised badge SVG and offers SVG/PNG downloads.
 * 4. Every report wins instantly: the badge is personalised in the
 *    browser and lands with the toss, while the report keeps sending in
 *    the background — if the campaign server answers, it quietly takes
 *    over as the record of truth.
 */

(function () {
  "use strict";

  // Flags JS availability so CSS reveal animations only hide content when
  // there is a script guaranteed to un-hide it again.
  document.documentElement.classList.add("js");

  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  // Stats chips can appear more than once on a page (and do in the merged
  // static preview), so they are collected as lists, not single elements.
  var statItems = $$("#stat-items");
  var statRangers = $$("#stat-rangers");

  var els = {
    form: $("#report-form"),
    name: $("#f-name"),
    email: $("#f-email"),
    photo: $("#f-photo"),
    photoPreview: $("#photo-preview"),
    photoCta: $("#photo-cta"),
    plastics: $("#f-plastics"),
    stepUp: $("#step-up"),
    stepDown: $("#step-down"),
    status: $("#form-status"),
    submit: $("#submit-btn"),
    panel: $("#badge-panel"),
    badgeText: $("#badge-text"),
    badgeHolder: $("#badge-holder"),
    dlSvg: $("#dl-svg"),
    dlPng: $("#dl-png"),
  };

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ------------------------------------------------- server or local badges?
  // On a static host (e.g. Netlify) there is no /api yet — the badge is
  // then personalised in the visitor's browser so the flow still works.
  // The Rust server remains the live system of record once it is added.
  var apiOnline = null; // null = not probed yet, false = static host
  var probeApi = fetch("/api/stats", { method: "HEAD" })
    .then(function (r) { apiOnline = r.ok; })
    .catch(function () { apiOnline = false; });

  // ------------------------------------------------------------- stats

  function countUp(el, target) {
    if (reduceMotion) { el.textContent = String(target); return; }
    var start = parseInt(el.textContent, 10) || 0;
    var t0 = null;
    function tick(t) {
      if (!t0) t0 = t;
      var p = Math.min(1, (t - t0) / 800);
      el.textContent = String(Math.round(start + (target - start) * p));
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function countUpAll(list, target) {
    list.forEach(function (el) { countUp(el, target); });
  }

  // Community chips are social proof only when there IS a community: a
  // "1 ranger playing" counter would tell a kid they are alone. Show the
  // items chip from the first report, the rangers chip from the second
  // ranger on, and hide the row entirely while both stay hidden.
  var lastStats = { items: 0, rangers: 0 };
  function syncLiveRow() {
    var itemsChip = statItems.length ? statItems[0].closest(".live-chip") : null;
    var rangersChip = statRangers.length ? statRangers[0].closest(".live-chip") : null;
    var row = document.querySelector(".live-row");
    var showItems = lastStats.items >= 1;
    var showRangers = lastStats.rangers >= 2;
    if (itemsChip) itemsChip.hidden = !showItems;
    if (rangersChip) rangersChip.hidden = !showRangers;
    if (row) row.hidden = !(showItems || showRangers);
  }

  function loadStats() {
    if (!statItems.length || !statRangers.length) return;
    fetch("/api/stats")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok) {
          lastStats = { items: data.items, rangers: data.rangers };
          countUpAll(statItems, data.items);
          countUpAll(statRangers, data.rangers);
          syncLiveRow();
        }
      })
      .catch(function () {
        // Static host: no campaign data yet — the chips stay hidden
        // until the server arrives.
        apiOnline = false;
      });
  }

  // ------------------------------------------------------------- confetti

  function confetti() {
    if (reduceMotion) return;
    var colors = ["#66bb6a", "#ffc107", "#29b6f6", "#f06292", "#9ccc65"];
    var frag = document.createDocumentFragment();
    for (var i = 0; i < 46; i++) {
      var piece = document.createElement("i");
      piece.className = "confetti-piece";
      piece.style.left = (Math.random() * 100) + "vw";
      piece.style.background = colors[i % colors.length];
      piece.style.width = (6 + Math.random() * 7) + "px";
      piece.style.height = (8 + Math.random() * 9) + "px";
      piece.style.borderRadius = Math.random() < 0.4 ? "50%" : "2px";
      piece.style.animationDelay = (Math.random() * 0.7) + "s";
      piece.style.animationDuration = (1.5 + Math.random() * 1.4) + "s";
      frag.appendChild(piece);
    }
    document.body.appendChild(frag);
    setTimeout(function () {
      var pieces = document.querySelectorAll(".confetti-piece");
      for (var j = 0; j < pieces.length; j++) pieces[j].remove();
    }, 3600);
  }

  // ------------------------------------------------------------- easter egg
  // Hover (or tap) the hero logo: the rangers step aside, a bottle gets
  // sorted into their bin, and they pop right back.
  $$(".logo-egg").forEach(function (egg) {
    var settle = null;
    egg.addEventListener("mouseenter", play);
    egg.addEventListener("click", play);
    function play() {
      if (reduceMotion) return;                      // the gag is pure motion
      if (egg.classList.contains("playing")) return; // one gag at a time
      egg.classList.add("playing");
      // the landing "boop-beep… plop!" rings as the bottle meets the bin
      if (window.EcoTune) setTimeout(function () { EcoTune.egg(); }, 1350);
      clearTimeout(settle);
      settle = setTimeout(function () { egg.classList.remove("playing"); }, 3500);
    }
  });

  // ----------------------------------------------------- report (log-in band)

  if (els.form) {
    var photoData = null; // { base64, mime }

    // The camera icon lives inside #photo-cta, whose innerHTML the photo
    // handler rewrites — so keep one copy of it here and re-use it.
    var camSvg = '<svg class="photo-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 3 7.2 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.2L15 3H9zm3 4.8a4.2 4.2 0 1 1 0 8.4 4.2 4.2 0 0 1 0-8.4zm0 2a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4z"/></svg>';
    var photoDrop = document.querySelector(".photo-drop");
    var submitLabel = els.submit.querySelector(".submit-txt") || els.submit;

    function setStatus(msg, kind) {
      els.status.textContent = msg;
      els.status.className = "form-status" + (kind ? " " + kind : "");
    }

    // The submit button plays a little game: the report is a bottle that
    // gets tossed into the bin. "tossing" mid-send, "scored" on success,
    // "fizzle" when it bounces back out.
    function submitState(state) {
      els.submit.classList.remove("tossing", "scored", "fizzle");
      if (state) els.submit.classList.add(state);
    }
    function submitReset() {
      submitState("");
      els.submit.disabled = false;
      submitLabel.textContent = "Send It!";
    }

    // ------------------------------------------------------------- wizard
    // The report is a 3-step guided trail and the mascot kid walks it with
    // you: waves hello, watches you type, snaps a photo when you do, and
    // jumps up with a thumbs up when the report lands.
    var form = els.form;
    var bubble = $("#mascot-bubble");
    var mascotStage = form.querySelector(".mascot-stage");
    var poses = [].slice.call(form.querySelectorAll(".pose"));
    var trailItems = [].slice.call(form.querySelectorAll(".wiz-trail .wt"));
    var panels = [].slice.call(form.querySelectorAll(".step-panel"));
    var wizStep = 1;

    function say(text) {
      if (!bubble) return;
      bubble.textContent = text;
      bubble.classList.remove("pop");
      void bubble.offsetWidth;            // restart the pop
      bubble.classList.add("pop");
    }
    function setPose(name) {
      form.dataset.pose = name;
      poses.forEach(function (img) {
        img.classList.toggle("on", img.classList.contains("pose-" + name));
      });
    }
    function watch(on) { form.classList.toggle("bubble-down", !!on); }

    function goStep(n) {
      wizStep = n;
      panels.forEach(function (p) { p.hidden = Number(p.dataset.panel) !== n; });
      trailItems.forEach(function (li, i) {
        li.classList.toggle("current", i === n - 1);
        li.classList.toggle("done", i < n - 1);
        if (i === n - 1) li.setAttribute("aria-current", "step");
        else li.removeAttribute("aria-current");
      });
      watch(false);
      if (n === 1) { setPose("hi"); say("Hi, Ranger! I'm Deputy Eco! 👋"); }
      if (n === 2) {
        setPose("snap");
        say(photoData ? "KACHUNK! Got it! ⭐" : "Say cheese! I'll snap one too! 📸");
      }
      if (n === 3) { setPose("look"); say("How many did you rescue? 🔢"); }
      setStatus("", "");
    }

    // the kid leans in and the bubble drops beside the text bar you're on
    function watchField(input, text) {
      input.addEventListener("focus", function () {
        if (wizStep !== 1) return;
        setPose("look"); watch(true); say(text);
      });
      input.addEventListener("blur", function () {
        if (wizStep !== 1) return;
        watch(false);
      });
    }
    watchField(els.name, "Ooh, a cool Ranger name!");
    watchField(els.email, "Your badge flies to your email! ✉️");

    [].forEach.call(form.querySelectorAll(".wiz-next"), function (btn) {
      btn.addEventListener("click", function () {
        var n = Number(btn.dataset.next);
        if (n === 2) {
          var vname = els.name.value.trim();
          var vemail = els.email.value.trim();
          if (!vname) { setStatus("Please tell us your Eco Ranger name.", "error"); els.name.focus(); return; }
          if (!vemail || vemail.indexOf("@") < 1 || vemail.indexOf(".") < 0) {
            setStatus("Please enter a valid email address so we can send your badge.", "error");
            els.email.focus(); return;
          }
        }
        if (n === 3 && !photoData) {
          setStatus("Please add a photo of your bin — it is your proof!", "error");
          return;
        }
        goStep(n);
      });
    });
    [].forEach.call(form.querySelectorAll(".wiz-back"), function (btn) {
      btn.addEventListener("click", function () { goStep(Number(btn.dataset.back)); });
    });

    goStep(1);

    els.photo.addEventListener("change", function () {
      var file = els.photo.files && els.photo.files[0];
      photoData = null;
      if (!file) {
        els.photoPreview.hidden = true;
        els.photoPreview.removeAttribute("src");
        els.photoCta.innerHTML = camSvg + "<b>Tap to take a picture of your bin!</b><small>It's your proof!</small>";
        if (photoDrop) photoDrop.classList.remove("got-it");
        if (wizStep === 2) say("Let's try again! 📸");
        return;
      }
      if (file.size > 4 * 1024 * 1024) {
        setStatus("That photo is over 4 MB — please pick a smaller one.", "error");
        els.photo.value = "";
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        var dataUrl = String(reader.result || "");
        var match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(dataUrl);
        if (!match) {
          setStatus("That file type is not supported — please use JPG, PNG or WebP.", "error");
          return;
        }
        photoData = { mime: match[1], base64: match[2] };
        els.photoPreview.src = dataUrl;
        els.photoPreview.hidden = false;
        els.photoCta.innerHTML = camSvg + "<b>Tap to change it</b><small>Not happy? Pick another!</small>";
        if (photoDrop) photoDrop.classList.add("got-it");
        setStatus("", "");
        // the kid takes its photo at the very same moment: flash + caption
        if (mascotStage) {
          mascotStage.classList.remove("flash");
          void mascotStage.offsetWidth;
          mascotStage.classList.add("flash");
        }
        say("KACHUNK! Got it! ⭐");
        setTimeout(function () {
          if (wizStep === 2) say("Nice shot! Tap the gold button →");
        }, 1800);
      };
      reader.onerror = function () { setStatus("Could not read that photo. Try again.", "error"); };
      reader.readAsDataURL(file);
    });

    // ------------------------------------------------------------- stepper

    function clampPlastics() {
      var v = parseInt(els.plastics.value, 10);
      if (isNaN(v) || v < 1) v = 1;
      if (v > 100000) v = 100000;
      els.plastics.value = String(v);
      return v;
    }
    function bumpStepper() {
      if (reduceMotion) return;
      var s = els.stepUp.parentNode; // .stepper
      s.classList.remove("bump");
      void s.offsetWidth;            // restart the keyframe
      s.classList.add("bump");
    }
    els.stepUp.addEventListener("click", function () {
      els.plastics.value = String(clampPlastics() + 1); clampPlastics(); bumpStepper();
    });
    els.stepDown.addEventListener("click", function () {
      els.plastics.value = String(clampPlastics() - 1); clampPlastics(); bumpStepper();
    });
    els.plastics.addEventListener("change", clampPlastics);

    // ------------------------------------------------------------- submit

    var currentBadge = { svg: "", name: "eco-ranger" };
    var submitEpoch = 0; // a late server reply for an old report never wins
    var resetTimer = null;

    // The badge is downloadable straight away: the sample SVG is pulled from
    // the preview image (works with its data-URI form in the static preview
    // too), so the download buttons live before any report is sent. A
    // submitted report later swaps in the personalised one.
    var sampleSvg = "";
    var sampleImg = els.badgeHolder ? els.badgeHolder.querySelector("img") : null;
    if (sampleImg) {
      fetch(sampleImg.src)
        .then(function (r) { return r.text(); })
        .then(function (svg) {
          sampleSvg = svg;
          if (currentBadge.svg) return; // a personalised badge already arrived
          currentBadge.svg = svg;
          currentBadge.name = "sample";
          els.dlSvg.disabled = false;
          els.dlPng.disabled = false;
          els.panel.classList.add("ready"); // gentle pulse on the PNG button
        })
        .catch(function () { /* downloads stay report-gated */ });
    }
    function getSampleSvg() {
      if (sampleSvg) return Promise.resolve(sampleSvg);
      return fetch(sampleImg ? sampleImg.src : "/img/badge-sample.svg")
        .then(function (r) { return r.text(); });
    }

    els.form.addEventListener("submit", function (e) {
      e.preventDefault();

      var name = els.name.value.trim();
      var email = els.email.value.trim();
      var plastics = clampPlastics();

      // a late server reply for an old report never wins (and the wizard
      // jumps back to the step that needs fixing)
      if (!name) { setStatus("Please tell us your Eco Ranger name.", "error"); goStep(1); els.name.focus(); return; }
      if (!email || email.indexOf("@") < 1 || email.indexOf(".") < 0) {
        setStatus("Please enter a valid email address so we can send your badge.", "error");
        goStep(1); els.email.focus(); return;
      }
      if (!photoData) { setStatus("Please add a photo of your bin — it is your proof!", "error"); goStep(2); return; }

      form.classList.remove("cheered");   // so a second win can jump again

      // open the audio context inside this tap so the success fanfare can
      // ring the moment the badge lands
      if (window.EcoTune) EcoTune.arm();

      var body = new URLSearchParams();
      body.set("name", name);
      body.set("email", email);
      body.set("plastics", String(plastics));
      body.set("photo", photoData.base64);
      body.set("photo_mime", photoData.mime);

      els.submit.disabled = true;
      submitState("tossing");
      submitLabel.textContent = "Tossing it in…";
      setStatus("Sending your report to the Eco Rangers camp…", "");

      // The badge is personalised in the browser so the win can land with
      // the toss itself; its code is a friendly placeholder until the
      // campaign server issues a real one.
      function xmlEscape(s) {
        return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").
          replace(/"/g, "&quot;").replace(/'/g, "&#39;");
      }
      function truncateChars(s, max) {
        var chars = Array.from(s);
        return chars.length > max ? chars.slice(0, max - 1).join("") + "\u2026" : s;
      }
      function utcToday() {
        var M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        var d = new Date();
        return d.getUTCDate() + " " + M[d.getUTCMonth()] + " " + d.getUTCFullYear();
      }
      function personalizeBadge(svg) {
        return svg.
          replace("Your Name", xmlEscape(truncateChars(name, 15))).
          replace('fill="#FFF8E1">25</text>', 'fill="#FFF8E1">' + plastics + "</text>").
          replace("13 Nov 2026", utcToday()).
          replace("ER-2026-0001", code);
      }
      var code = "";
      function finishLocal() {
        getSampleSvg().then(function (svg) {
          code = "ER-" + new Date().getUTCFullYear() + "-" +
            String(1000 + Math.floor(Math.random() * 9000));
          var data = {
            ok: true,
            code: code,
            badge_svg: personalizeBadge(svg),
          };
          showBadge(data, name, plastics);
          setStatus("Report logged — badge " + code + " issued! \uD83C\uDF3F", "ok");
          submitState("scored"); // the bin ate it — check pops over the lid
          // the kid celebrates too: thumbs up, a jump and a proud bubble
          setPose("thumbs");
          say("You did it, Ranger! 🌟");
          watch(false);
          form.classList.add("cheered");
          trailItems.forEach(function (li) { li.classList.add("done"); li.classList.remove("current"); });
          if (window.EcoTune) EcoTune.success(); // the victory fanfare
          submitLabel.textContent = "Logged! 🌿";
          clearTimeout(resetTimer);
          resetTimer = setTimeout(submitReset, 2400);
        }).catch(function () {
          setStatus("Could not prepare your badge — please try again.", "error");
          submitState("fizzle"); // the bottle bounces back out
          clearTimeout(resetTimer);
          resetTimer = setTimeout(submitReset, 1100);
        });
      }

      // Success lands with the toss (~0.6s) — never after the network.
      // The report keeps sending in the background, and if the campaign
      // server answers, it quietly takes over as the record of truth:
      // real badge, real community totals, no second celebration.
      var myEpoch = ++submitEpoch;
      setTimeout(finishLocal, 580);

      probeApi.then(function () {
        if (apiOnline === false || myEpoch !== submitEpoch) return;
        fetch("/api/report", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString(),
        })
          .then(function (r) {
            if (!r.ok) throw new TypeError("API not available"); // static host
            return r.json();
          })
          .then(function (data) {
            if (!data.ok || myEpoch !== submitEpoch) return;
            setStatus("Report saved — badge " + data.code + " issued! 🌿", "ok");
            if (data.totals) {
              lastStats = { items: data.totals.items, rangers: data.totals.rangers };
              countUpAll(statItems, lastStats.items);
              countUpAll(statRangers, lastStats.rangers);
              syncLiveRow();
            }
            // quietly swap the server's badge over the local one
            var svgPromise = data.badge_svg
              ? Promise.resolve(data.badge_svg)
              : fetch(data.badge_url).then(function (r) { return r.text(); });
            svgPromise.then(function (svg) {
              if (myEpoch !== submitEpoch) return;
              currentBadge.svg = svg;
              els.badgeHolder.innerHTML = svg;
              els.badgeHolder.classList.remove("stamped");
              void els.badgeHolder.offsetWidth;
              els.badgeHolder.classList.add("stamped");
              els.dlSvg.disabled = false;
              els.dlPng.disabled = false;
              els.panel.classList.add("ready");
            }).catch(function () { /* the local badge stands */ });
          })
          .catch(function () { /* the report could not reach the server —
                                   the local success stands */ });
      });
    });

    // ------------------------------------------------------------- badge

    function showBadge(data, name, plastics) {
      currentBadge.name = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "eco-ranger";
      els.badgeText.textContent =
        "Way to go, " + name + "! You kept " + plastics +
        " plastic item" + (plastics === 1 ? "" : "s") + " out of nature. Here is your badge:";
      var svgPromise = data.badge_svg
        ? Promise.resolve(data.badge_svg) // static host: personalised locally
        : fetch(data.badge_url).then(function (r) { return r.text(); });
      svgPromise
        .then(function (svg) {
          currentBadge.svg = svg;
          els.badgeHolder.innerHTML = svg;
          // stamp the badge in, then let it swing (replays on re-submits)
          els.badgeHolder.classList.remove("stamped");
          void els.badgeHolder.offsetWidth;
          els.badgeHolder.classList.add("stamped");
          els.dlSvg.disabled = false;
          els.dlPng.disabled = false;
          els.panel.classList.add("ready");
          confetti();
          els.panel.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
        })
        .catch(function () {
          els.badgeText.textContent = "Your report is saved, but the badge could not be loaded — refresh to try again.";
        });
    }

    function download(blob, filename) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    }

    els.dlSvg.addEventListener("click", function () {
      if (!currentBadge.svg) return;
      download(new Blob([currentBadge.svg], { type: "image/svg+xml" }),
        "climate-champion-" + currentBadge.name + ".svg");
    });

    els.dlPng.addEventListener("click", function () {
      if (!currentBadge.svg) return;
      var img = new Image();
      img.onload = function () {
        var canvas = document.createElement("canvas");
        canvas.width = 840;
        canvas.height = 1080;
        var ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, 840, 1080);
        canvas.toBlob(function (blob) {
          if (blob) download(blob, "climate-champion-" + currentBadge.name + ".png");
        }, "image/png");
      };
      img.onerror = function () { setStatus("PNG export failed — try the SVG download.", "error"); };
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(currentBadge.svg);
    });
  }

  // ------------------------------------------------------------- polish

  var statsLoaded = false;
  function loadStatsOnce() {
    if (statsLoaded) return;
    statsLoaded = true;
    loadStats();
  }

  // Reveal-on-scroll: sections and cards glide in once, as they appear.
  // The live stat chips count up the moment they enter the screen.
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          io.unobserve(entry.target);
          // The stats row itself is hidden until real numbers exist, so any
          // reveal inside the log-in section (e.g. the step pills) starts it.
          if (entry.target.classList.contains("live-row") ||
              entry.target.closest("#log-in")) loadStatsOnce();
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
    document.querySelectorAll(".reveal").forEach(function (el) { io.observe(el); });
  } else {
    document.querySelectorAll(".reveal").forEach(function (el) { el.classList.add("in"); });
    loadStatsOnce();
  }

  // Compact header once scrolled.
  var header = $("#site-header");
  function onScroll() {
    if (header) header.classList.toggle("scrolled", window.scrollY > 8);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // ------------------------------------------------------------- mission deck
  // On phones the How to Play trail becomes a FULL-SCREEN card player, one
  // screen tall: three mascot "hello" cards open the story, then the five
  // mission cards continue it. Swiping (or tapping the arrows / dots) flips
  // the current card away in 3D while the next flips in; a sideways trackpad
  // scroll counts as a swipe too. "Start the Challenge!" in the hero rewinds
  // to the ranger girl's welcome card; the last card links to the log-in
  // form. Wider screens keep the numbered rows, so all of it is gated.
  function missionDeck() {
    var trail = $("#missions .trail");
    if (!trail) return;
    var stops = $$("#missions .trail > .stop");
    if (stops.length < 2) return;
    var stage = trail.closest(".deck-stage") || trail;
    var nav = $("#missions .deck-nav");
    var hint = $("#missions .deck-hint");
    var introCount = stops.filter(function (s) {
      return s.classList.contains("intro");
    }).length;
    var mq = window.matchMedia("(max-width: 760px)");
    // --- button voices: short generated clips give the big CTAs a voice ---
    // One delegated listener: any element with data-voice="yes|join|game|…"
    // speaks on click, whatever else its own handler does.
    var VOICE_URLS = {
      yes: "/audio/voice-yes.mp3",
      join: "/audio/voice-join.mp3",
      game: "/audio/voice-game.mp3",
      start: "/audio/voice-start.mp3",
      done: "/audio/voice-done.mp3"
    };
    var voiceCache = {};
    function say(name) {
      var url = VOICE_URLS[name];
      if (!url) return;
      try {
        if (!voiceCache[name]) {
          voiceCache[name] = new Audio(url);
          voiceCache[name].preload = "auto";
        }
        voiceCache[name].currentTime = 0;
        var p = voiceCache[name].play();
        if (p && p.catch) p.catch(function () { /* autoplay rules: stay quiet */ });
      } catch (err) { /* a voice is garnish — never block the button */ }
    }
    document.addEventListener("click", function (e) {
      var el = e.target.closest && e.target.closest("[data-voice]");
      if (el) say(el.getAttribute("data-voice"));
    }, true);

    // --- a soft synth pop for the deck controls (no audio file needed) ---
    var popCtx = null;
    function pop(up) {
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        popCtx = popCtx || new AC();
        if (popCtx.state === "suspended") popCtx.resume();
        var t = popCtx.currentTime;
        var o = popCtx.createOscillator(), g = popCtx.createGain();
        o.type = "sine";
        o.frequency.setValueAtTime(up ? 620 : 460, t);
        o.frequency.exponentialRampToValueAtTime(up ? 920 : 330, t + 0.09);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.07, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
        o.connect(g);
        g.connect(popCtx.destination);
        o.start(t);
        o.stop(t + 0.15);
      } catch (err) { /* silence is fine */ }
    }

    var calm = window.matchMedia("(prefers-reduced-motion: reduce)");
    var idx = 0, busy = false, cleanupTimer = null, bounceTimer = null;
    var prevBtn = null, nextBtn = null, dots = [];

    var CHEV_L = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4l-8 8 8 8" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var CHEV_R = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4l8 8-8 8" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    function buildNav() {
      if (!nav || nav.childNodes.length) return;
      prevBtn = document.createElement("button");
      prevBtn.type = "button";
      prevBtn.className = "deck-btn deck-prev";
      prevBtn.setAttribute("aria-label", "Previous card");
      prevBtn.innerHTML = CHEV_L;
      nextBtn = document.createElement("button");
      nextBtn.type = "button";
      nextBtn.className = "deck-btn deck-next";
      nextBtn.setAttribute("aria-label", "Next card");
      nextBtn.innerHTML = CHEV_R;
      var dotsBox = document.createElement("div");
      dotsBox.className = "deck-dots";
      stops.forEach(function (stop, i) {
        var isIntro = i < introCount;
        var dot = document.createElement("button");
        dot.type = "button";
        dot.className = "deck-dot";
        dot.setAttribute("aria-label",
          (isIntro ? "Hello card " + (i + 1) + " of " + introCount
                   : "Mission " + (i - introCount + 1) + " of " + (stops.length - introCount)));
        dot.addEventListener("click", function () { jump(i); });
        dotsBox.appendChild(dot);
        dots.push(dot);
      });
      prevBtn.addEventListener("click", function () { go(-1); });
      nextBtn.addEventListener("click", function () { go(1); });
      nav.appendChild(prevBtn);
      nav.appendChild(dotsBox);
      nav.appendChild(nextBtn);
    }

    function renderNav() {
      dots.forEach(function (dot, i) {
        if (i === idx) dot.setAttribute("aria-current", "true");
        else dot.removeAttribute("aria-current");
      });
      if (prevBtn) prevBtn.disabled = idx === 0;
      if (nextBtn) nextBtn.disabled = idx === stops.length - 1;
      if (hint) hint.hidden = idx !== 0;   // the swipe hint is a first-card thing
    }

    function bounce(dir) {
      if (busy || calm.matches) return;
      var card = stops[idx];
      card.style.transition = "";
      card.style.transform = "";      // let go of any drag pose first
      var cls = dir > 0 ? "bounce-next" : "bounce-prev";
      card.classList.remove("bounce-next", "bounce-prev");
      void card.offsetWidth;
      card.classList.add(cls);
      clearTimeout(bounceTimer);
      bounceTimer = setTimeout(function () { card.classList.remove(cls); }, 500);
    }

    function flipTo(to, dir) {
      busy = true;
      var out = stops[idx], inn = stops[to];
      var fast = calm.matches;
      var tOut = fast ? "none" : "transform .5s cubic-bezier(.3,1.25,.4,1), opacity .4s ease";
      var tIn = fast ? "none" : "transform .55s cubic-bezier(.25,1.35,.4,1), opacity .46s ease .06s";
      // the old card flips away — from wherever the finger left it
      out.style.transition = tOut;
      out.style.transform = dir > 0 ? "rotateY(-108deg) translateZ(-40px)" : "rotateY(108deg) translateZ(-40px)";
      out.style.opacity = "0";
      out.style.zIndex = "1";
      // the new card starts edge-on, then flips upright into place
      inn.classList.remove("is-hidden");
      inn.setAttribute("aria-hidden", "false");
      inn.style.transition = "none";
      inn.style.transform = dir > 0 ? "rotateY(104deg)" : "rotateY(-104deg)";
      inn.style.opacity = "0";
      inn.style.zIndex = "2";
      void inn.offsetWidth;            // commit the start pose…
      inn.style.transition = tIn;      // …then glide to the resting pose
      inn.style.transform = "";
      inn.style.opacity = "";
      idx = to;
      renderNav();
      clearTimeout(cleanupTimer);
      cleanupTimer = setTimeout(function () {
        out.style.cssText = "";
        inn.style.cssText = "";
        out.classList.add("is-hidden");
        out.setAttribute("aria-hidden", "true");
        busy = false;
      }, fast ? 60 : 650);
    }

    function go(dir) {
      if (busy) return;
      var to = idx + dir;
      if (to < 0 || to >= stops.length) { bounce(dir); return; }
      pop(dir > 0);
      flipTo(to, dir);
    }

    function jump(to) {
      if (busy || to === idx) return;
      if (to < 0 || to >= stops.length) return;
      pop(to > idx);
      flipTo(to, to > idx ? 1 : -1);
    }

    // --- swipe (pointer events cover touch and mouse drags alike) ---
    var drag = null;
    trail.addEventListener("pointerdown", function (e) {
      if (!mq.matches || busy) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      // never steal taps from links and buttons: capturing the pointer here
      // retargets the click to the trail, so on touch screens the link the
      // finger tapped never fires at all
      if (e.target.closest && e.target.closest("a, button")) return;
      drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, moved: false };
      try { trail.setPointerCapture(e.pointerId); } catch (err) { /* keep going */ }
    });
    trail.addEventListener("pointermove", function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
      if (!drag.moved) {
        if (Math.abs(dx) > 9 && Math.abs(dx) > Math.abs(dy) * 1.2) drag.moved = true;
        else if (Math.abs(dy) > 12) { drag = null; return; }  // a scroll, let it go
        else return;
      }
      drag.dx = Math.max(-140, Math.min(140, dx));
      var card = stops[idx];
      card.style.transition = "none";
      card.style.transform = "translateX(" + (drag.dx * 0.38).toFixed(1) + "px) rotateY(" + (drag.dx * 0.09).toFixed(1) + "deg)";
    });
    function endDrag(e, cancelled) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = drag.dx, moved = drag.moved;
      drag = null;
      if (!moved) return;
      var card = stops[idx];
      if (!cancelled && Math.abs(dx) > 46) {
        go(dx < 0 ? 1 : -1);            // hand the drag pose to the flip
      } else {
        card.style.transition = "transform .3s cubic-bezier(.3,1.4,.4,1)";
        card.style.transform = "";      // spring back home
      }
    }
    trail.addEventListener("pointerup", function (e) { endDrag(e, false); });
    trail.addEventListener("pointercancel", function (e) { endDrag(e, true); });

    // --- sideways trackpad scroll counts as a swipe; vertical stays page scroll ---
    var wheelAcc = 0, wheelTimer = null, wheelCool = 0;
    trail.addEventListener("wheel", function (e) {
      if (!mq.matches || busy) return;
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) + 4) return;
      e.preventDefault();
      var now = Date.now();
      if (now < wheelCool) return;
      wheelAcc += e.deltaX;
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(function () { wheelAcc = 0; }, 220);
      if (Math.abs(wheelAcc) > 60) {
        var dir = wheelAcc > 0 ? 1 : -1;
        wheelAcc = 0;
        wheelCool = now + 700;
        go(dir);
      }
    }, { passive: false });

    // --- the story's buttons ---
    // "YES! I'm in!" on the third hello card runs straight into mission 1
    $$("#missions .intro-cta").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        var m1 = stops[introCount];
        if (!m1) return;
        e.preventDefault();               // the anchor is the no-JS fallback
        if (mq.matches) {
          jump(introCount);
        } else {
          m1.scrollIntoView({ behavior: calm.matches ? "auto" : "smooth", block: "center" });
          m1.classList.remove("pop");
          void m1.offsetWidth;
          m1.classList.add("pop");
          setTimeout(function () { m1.classList.remove("pop"); }, 1000);
        }
      });
    });

    // "Start the Challenge!" rewinds to the ranger girl's welcome and puts
    // the full-screen player right at the top of the screen
    // The page grows while it scrolls (lazy pictures above the player wake
    // up and push it down), so keep easing the player to the top until it
    // truly lands — and give up the moment the user scrolls for themselves.
    var landTimer = null;
    function landStage() {
      clearInterval(landTimer);
      var t0 = Date.now();
      landTimer = setInterval(function () {
        if (!mq.matches || Date.now() - t0 > 2500) { clearInterval(landTimer); return; }
        if (Math.abs(stage.getBoundingClientRect().top) < 4) { clearInterval(landTimer); return; }
        stage.scrollIntoView({ behavior: calm.matches ? "auto" : "smooth" });
      }, 150);
    }
    ["pointerdown", "wheel", "touchstart", "keydown"].forEach(function (evt) {
      window.addEventListener(evt, function () { clearInterval(landTimer); },
        { passive: true, capture: true });
    });
    function rewind() {
      if (idx === 0) { renderNav(); return; }
      if (busy) {                        // mid-flip: snap straight home
        clearTimeout(cleanupTimer);
        busy = false;
        stops.forEach(function (stop, i) {
          stop.style.cssText = "";
          stop.classList.toggle("is-hidden", i !== 0);
          stop.setAttribute("aria-hidden", i === 0 ? "false" : "true");
        });
        idx = 0;
        renderNav();
      } else {
        flipTo(0, -1);
      }
    }
    var startBtn = $(".btn-play");
    if (startBtn) startBtn.addEventListener("click", function (e) {
      if (!mq.matches) return;           // desktop: the plain anchor jump is right
      e.preventDefault();
      rewind();
      stage.scrollIntoView({ behavior: calm.matches ? "auto" : "smooth" });
      landStage();
    });

    // the last card's "Join the Team!" / "or log your win" links land on the
    // form with a warm glow so young rangers see exactly where to type
    $$("#missions .join-cta, #missions .cta-alt").forEach(function (a) {
      a.addEventListener("click", function () {
        var card = $(".form-card");
        if (!card) return;
        card.classList.remove("form-pulse");
        void card.offsetWidth;
        card.classList.add("form-pulse");
        setTimeout(function () { card.classList.remove("form-pulse"); }, 2400);
      });
    });

    // --- switch the layout when the viewport crosses the phone breakpoint ---
    function enter() {
      buildNav();
      if (nav) nav.hidden = false;
      trail.setAttribute("role", "region");
      trail.setAttribute("aria-roledescription", "carousel");
      trail.setAttribute("aria-label", "How to play — the ranger hello and the five missions");
      stops.forEach(function (stop, i) {
        stop.classList.toggle("is-hidden", i !== idx);
        stop.setAttribute("aria-hidden", i === idx ? "false" : "true");
        stop.style.cssText = "";
      });
      renderNav();
    }
    function leave() {
      clearTimeout(cleanupTimer);
      busy = false;
      if (nav) nav.hidden = true;
      trail.removeAttribute("role");
      trail.removeAttribute("aria-roledescription");
      trail.removeAttribute("aria-label");
      stops.forEach(function (stop) {
        stop.classList.remove("is-hidden", "bounce-next", "bounce-prev");
        stop.removeAttribute("aria-hidden");
        stop.style.cssText = "";
      });
    }
    function apply() { if (mq.matches) enter(); else leave(); }
    if (mq.addEventListener) mq.addEventListener("change", apply);
    else if (mq.addListener) mq.addListener(apply);   // old Safari
    apply();
  }
  missionDeck();

  // ------------------------------------------------------------- go

})();
