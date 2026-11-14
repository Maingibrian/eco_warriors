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
      clearTimeout(settle);
      settle = setTimeout(function () { egg.classList.remove("playing"); }, 2500);
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

    els.photo.addEventListener("change", function () {
      var file = els.photo.files && els.photo.files[0];
      photoData = null;
      if (!file) {
        els.photoPreview.hidden = true;
        els.photoPreview.removeAttribute("src");
        els.photoCta.innerHTML = camSvg + "<b>Tap to take a picture of your bin!</b><small>It's your proof!</small>";
        if (photoDrop) photoDrop.classList.remove("got-it");
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

      if (!name) { setStatus("Please tell us your Eco Ranger name.", "error"); els.name.focus(); return; }
      if (!email || email.indexOf("@") < 1 || email.indexOf(".") < 0) {
        setStatus("Please enter a valid email address so we can send your badge.", "error");
        els.email.focus(); return;
      }
      if (!photoData) { setStatus("Please add a photo of your bin — it is your proof!", "error"); return; }

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

  // ------------------------------------------------------------- go

})();
