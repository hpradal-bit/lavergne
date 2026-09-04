(function () {
  "use strict";

  var html = document.documentElement;
  html.classList.remove("no-js");
  html.classList.add("js");

  var hasGSAP = typeof window.gsap !== "undefined" && typeof window.ScrollTrigger !== "undefined";
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (hasGSAP) {
    gsap.registerPlugin(ScrollTrigger);
  }

  /* ---------------------------------------------------------
     Nav: scrolled state + mobile toggle
  --------------------------------------------------------- */
  (function nav() {
    var siteNav = document.getElementById("siteNav");
    var toggle = document.getElementById("navToggle");
    var links = document.getElementById("navLinks");
    if (!siteNav) return;

    var onScroll = function () {
      siteNav.classList.toggle("is-scrolled", window.scrollY > 40);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    if (toggle && links) {
      toggle.addEventListener("click", function () {
        var open = links.classList.toggle("is-open");
        toggle.classList.toggle("is-open", open);
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
      });
      links.querySelectorAll("a").forEach(function (a) {
        a.addEventListener("click", function () {
          links.classList.remove("is-open");
          toggle.classList.remove("is-open");
          toggle.setAttribute("aria-expanded", "false");
        });
      });
    }
  })();

  /* ---------------------------------------------------------
     Generic scroll reveals (CSS-driven, JS only arms them so
     content stays visible if this script never runs)
  --------------------------------------------------------- */
  (function reveals() {
    var els = document.querySelectorAll(".reveal, .reveal-left, .reveal-right, .reveal-scale, .stagger");
    if (!els.length) return;

    els.forEach(function (el) { el.classList.add("js-armed"); });

    if (reduceMotion || !("IntersectionObserver" in window)) {
      els.forEach(function (el) { el.classList.add("is-visible"); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var delay = parseFloat(entry.target.getAttribute("data-delay") || "0");
          setTimeout(function () { entry.target.classList.add("is-visible"); }, delay * 1000);
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.18, rootMargin: "0px 0px -8% 0px" });

    els.forEach(function (el) { io.observe(el); });
  })();

  /* ---------------------------------------------------------
     Hero title: word-by-word entrance
  --------------------------------------------------------- */
  (function heroTitle() {
    var el = document.getElementById("heroTitle");
    if (!el) return;
    var words = el.textContent.trim().split(/\s+/);
    el.innerHTML = words.map(function (w) {
      return '<span class="word"><span>' + w + "</span></span>";
    }).join(" ");

    var spans = el.querySelectorAll(".word > span");
    if (reduceMotion) return;

    if (hasGSAP) {
      gsap.set(spans, { yPercent: 120 });
      gsap.to(spans, {
        yPercent: 0,
        duration: 0.9,
        ease: "power4.out",
        stagger: 0.07,
        delay: 0.15
      });
    }
  })();

  /* ---------------------------------------------------------
     Hero parallax
  --------------------------------------------------------- */
  (function parallax() {
    if (!hasGSAP || reduceMotion) return;
    document.querySelectorAll("[data-parallax]").forEach(function (layer) {
      var speed = parseFloat(layer.getAttribute("data-speed") || "0.3");
      gsap.to(layer, {
        yPercent: speed * 28,
        ease: "none",
        scrollTrigger: {
          trigger: layer.closest("section") || layer,
          start: "top top",
          end: "bottom top",
          scrub: 0.6
        }
      });
    });
  })();

  /* ---------------------------------------------------------
     Immersive horizontal gallery
  --------------------------------------------------------- */
  (function gallery() {
    var section = document.querySelector("[data-gallery-pin]");
    var track = document.querySelector("[data-gallery-track]");
    var progressBar = document.querySelector("[data-gallery-progress]");
    if (!section || !track) return;

    if (!hasGSAP) {
      // Fallback: native swipeable horizontal scroll, no pin.
      section.classList.add("no-gsap");
      return;
    }

    function build() {
      var distance = track.scrollWidth - window.innerWidth + 64;
      if (distance <= 0) return null;

      return ScrollTrigger.create({
        trigger: section,
        start: "top top",
        end: "+=" + (distance + window.innerHeight * 0.6),
        scrub: 0.7,
        pin: true,
        anticipatePin: 1,
        onUpdate: function (self) {
          var x = -distance * self.progress;
          gsap.set(track, { x: x });
          if (progressBar) progressBar.style.width = (self.progress * 100) + "%";
        }
      });
    }

    var trigger = build();
    window.addEventListener("load", function () {
      if (trigger) trigger.refresh();
      ScrollTrigger.refresh();
    });
  })();

  /* ---------------------------------------------------------
     Section fade transitions (subtle depth on entry)
  --------------------------------------------------------- */
  (function sectionDepth() {
    if (!hasGSAP || reduceMotion) return;
    document.querySelectorAll(".exp-media").forEach(function (media) {
      gsap.fromTo(media, { scale: 1.12 }, {
        scale: 1,
        ease: "none",
        scrollTrigger: { trigger: media, start: "top bottom", end: "top 30%", scrub: 0.8 }
      });
    });
  })();

  /* ---------------------------------------------------------
     Footer year
  --------------------------------------------------------- */
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
})();
