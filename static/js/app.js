/* Eco Rangers — the 5-Day Recycling Challenge
 * Vanilla JS: no frameworks, no build step. Shared by all three pages
 * (cover, challenge, log-in): every element lookup is optional, so the
 * same file works on any page.
 *
 * 1. Loads community stats from the Rust server (where the chips are).
 * 2. On the log-in page: sends the report (name, email, bin photo,
 *    plastic count) to /api/report.
 * 3. Fetches the personalised badge SVG and offers SVG/PNG downloads.
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
      .catch(function () { /* server offline stats stay at 0 */ });
  }

  // ------------------------------------------------------------- confetti

  function confetti() {
    if (reduceMotion) return;
    var colors = ["#66bb6a", "#ffc107", "#29b6f6", "#f06292", "#9ccc65"];
    var frag = document.createDocumentFragment();
    for (var i = 0; i < 26; i++) {
      var piece = document.createElement("i");
      piece.className = "confetti-piece";
      piece.style.left = (Math.random() * 100) + "vw";
      piece.style.background = colors[i % colors.length];
      piece.style.animationDelay = (Math.random() * 0.6) + "s";
      piece.style.animationDuration = (1.6 + Math.random() * 1.2) + "s";
      frag.appendChild(piece);
    }
    document.body.appendChild(frag);
    setTimeout(function () {
      var pieces = document.querySelectorAll(".confetti-piece");
      for (var j = 0; j < pieces.length; j++) pieces[j].remove();
    }, 3200);
  }

  // ----------------------------------------------------- report (log-in page)

  if (els.form) {
    var photoData = null; // { base64, mime }

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
        els.photoCta.innerHTML = "<b>Take or choose a photo</b><small>JPG, PNG or WebP \u00b7 up to 4 MB — it's your proof!</small>";
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
        els.photoCta.innerHTML = "<b>Photo ready!</b><small>Tap to change it</small>";
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
    els.stepUp.addEventListener("click", function () {
      els.plastics.value = String(clampPlastics() + 1); clampPlastics();
    });
    els.stepDown.addEventListener("click", function () {
      els.plastics.value = String(clampPlastics() - 1); clampPlastics();
    });
    els.plastics.addEventListener("change", clampPlastics);

    // ------------------------------------------------------------- submit

    var currentBadge = { svg: "", name: "eco-ranger" };

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
      els.submit.textContent = "Sending…";
      setStatus("Sending your report to the Eco Rangers camp…", "");

      fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (!data.ok) throw new Error(data.error || "Something went wrong.");
          showBadge(data, name, plastics);
          setStatus("Report saved — badge " + data.code + " issued! 🌿", "ok");
          countUpAll(statItems, data.totals.items);
          countUpAll(statRangers, data.totals.rangers);
        })
        .catch(function (err) {
          setStatus(err.message || "Could not reach the server. Please try again.", "error");
        })
        .then(function () {
          els.submit.disabled = false;
          els.submit.textContent = "Send My Report";
        });
    });

    // ------------------------------------------------------------- badge

    function showBadge(data, name, plastics) {
      currentBadge.name = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "eco-ranger";
      els.badgeText.textContent =
        "Way to go, " + name + "! You kept " + plastics +
        " plastic item" + (plastics === 1 ? "" : "s") + " out of nature. Here is your badge:";
      fetch(data.badge_url)
        .then(function (r) { return r.text(); })
        .then(function (svg) {
          currentBadge.svg = svg;
          els.badgeHolder.innerHTML = svg;
          els.dlSvg.disabled = false;
          els.dlPng.disabled = false;
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
