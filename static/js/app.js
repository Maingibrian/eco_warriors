/* Eco Rangers — the 5-Day Recycling Challenge
 * Vanilla JS: no frameworks, no build step. Shared by both pages
 * (cover, challenge): every element lookup is optional, so the same
 * file works on any page.
 *
 * 1. Loads community stats from the Rust server (where the chips are).
 * 2. In the log-in band: sends the report (name, email, bin photo,
 *    plastic count) to /api/report.
 * 3. Fetches the personalised badge SVG and offers SVG/PNG downloads.
 * 4. Demo mode: with no /api (static hosts like Netlify), reports are
 *    personalised in the browser and counted on the device only.
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

  // ------------------------------------------------- server or demo mode?
  // On a static host (e.g. Netlify) there is no /api — reports and badges
  // are then generated in the visitor's browser and counted on their
  // device only. The Rust server remains the live system of record.
  var apiOnline = null; // null = not probed yet, false = static host
  var probeApi = fetch("/api/stats", { method: "HEAD" })
    .then(function (r) { apiOnline = r.ok; })
    .catch(function () { apiOnline = false; });
  var demo = {
    get: function (k) { try { return parseInt(localStorage.getItem("er-demo-" + k) || "0", 10) || 0; } catch (e) { return 0; } },
    set: function (k, v) { try { localStorage.setItem("er-demo-" + k, String(v)); } catch (e) {} },
  };

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

  function loadStats() {
    if (!statItems.length || !statRangers.length) return;
    fetch("/api/stats")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok) {
          countUpAll(statItems, data.items);
          countUpAll(statRangers, data.rangers);
        }
      })
      .catch(function () {
        // Static host: show this device's demo-mode tally instead.
        apiOnline = false;
        countUpAll(statItems, demo.get("items"));
        countUpAll(statRangers, demo.get("rangers"));
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

  // ----------------------------------------------------- report (log-in band)

  if (els.form) {
    var photoData = null; // { base64, mime }

    // The camera icon lives inside #photo-cta, whose innerHTML the photo
    // handler rewrites — so keep one copy of it here and re-use it.
    var camSvg = '<svg class="photo-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 3 7.2 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.2L15 3H9zm3 4.8a4.2 4.2 0 1 1 0 8.4 4.2 4.2 0 0 1 0-8.4zm0 2a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4z"/></svg>';
    var photoDrop = document.querySelector(".photo-drop");
    var submitLabel = els.submit.querySelector("span") || els.submit;

    function setStatus(msg, kind) {
      els.status.textContent = msg;
      els.status.className = "form-status" + (kind ? " " + kind : "");
    }

    els.photo.addEventListener("change", function () {
      var file = els.photo.files && els.photo.files[0];
      photoData = null;
      if (!file) {
        els.photoPreview.hidden = true;
        els.photoPreview.removeAttribute("src");
        els.photoCta.innerHTML = camSvg + "<b>Take or choose a photo</b><small>JPG, PNG or WebP \u00b7 up to 4 MB — it's your proof!</small>";
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
        els.photoCta.innerHTML = camSvg + "<b>Photo ready!</b><small>Tap to change it</small>";
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

      var body = new URLSearchParams();
      body.set("name", name);
      body.set("email", email);
      body.set("plastics", String(plastics));
      body.set("photo", photoData.base64);
      body.set("photo_mime", photoData.mime);

      els.submit.disabled = true;
      submitLabel.textContent = "Sending…";
      setStatus("Sending your report to the Eco Rangers camp…", "");

      // Demo mode (static host, no /api): personalise the sample badge in the
      // browser and count the report on this device only.
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
          var n = demo.get("count") + 1;
          demo.set("count", n);
          var items = demo.get("items") + plastics;
          var rangers = demo.get("rangers") + 1;
          demo.set("items", items);
          demo.set("rangers", rangers);
          code = "ER-" + new Date().getUTCFullYear() + "-" + ("000" + n).slice(-4);
          var data = {
            ok: true,
            code: code,
            demo: true,
            badge_svg: personalizeBadge(svg),
            totals: { items: items, rangers: rangers },
          };
          showBadge(data, name, plastics);
          setStatus("Badge " + code + " issued — saved on this device (demo mode, no campaign server). \uD83C\uDF3F", "ok");
          countUpAll(statItems, items);
          countUpAll(statRangers, rangers);
          if (!reduceMotion) { // happy little wiggle on the submit button
            els.submit.classList.add("yay");
            setTimeout(function () { els.submit.classList.remove("yay"); }, 700);
          }
        }).catch(function () {
          setStatus("Could not prepare your badge — please try again.", "error");
        }).then(function () {
          els.submit.disabled = false;
          submitLabel.textContent = "Send My Report";
        });
      }

      probeApi.then(function () {
        if (apiOnline === false) { finishLocal(); return; }
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
            if (!data.ok) throw new Error(data.error || "Something went wrong.");
            showBadge(data, name, plastics);
            setStatus("Report saved — badge " + data.code + " issued! 🌿", "ok");
            countUpAll(statItems, data.totals.items);
            countUpAll(statRangers, data.totals.rangers);
            if (!reduceMotion) { // happy little wiggle on the submit button
              els.submit.classList.add("yay");
              setTimeout(function () { els.submit.classList.remove("yay"); }, 700);
            }
          })
          .catch(function (err) {
            if (err instanceof TypeError) finishLocal(); // no API → demo mode
            else setStatus(err.message || "Could not reach the server. Please try again.", "error");
          })
          .then(function () {
            els.submit.disabled = false;
            submitLabel.textContent = "Send My Report";
          });
      });
    });

    // ------------------------------------------------------------- badge

    function showBadge(data, name, plastics) {
      currentBadge.name = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "eco-ranger";
      els.badgeText.textContent =
        "Way to go, " + name + "! You kept " + plastics +
        " plastic item" + (plastics === 1 ? "" : "s") + " out of nature. Here is your badge:";
      var svgPromise = data.badge_svg
        ? Promise.resolve(data.badge_svg) // demo mode: personalised locally
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
          if (entry.target.classList.contains("live-row")) loadStatsOnce();
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
