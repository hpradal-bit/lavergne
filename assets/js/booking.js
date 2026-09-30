/* ==========================================================================
   Booking widget — "La Maison de l'Oncle Jean"
   ==========================================================================
   Lead-capture calendar: a visitor picks dates, sees them checked against
   real availability, sees the price for their stay, and sends a
   reservation request by e-mail (24h manual confirmation, no payment here).

   Availability and pricing are read from Supabase (public, read-only):
     - `unavailable_ranges` is kept in sync every 3h from the owner's real
       Airbnb / Booking.com / Abritel iCal export links (see admin.html and
       the `sync-calendars` Edge Function) — never fake data.
     - `monthly_prices` holds one price per night per calendar month, set by
       the owner from admin.html.
   If Supabase can't be reached, the calendar still works with all dates
   open and no price shown — it never invents fake availability or prices.
   ========================================================================== */

(function () {
  "use strict";

  // TODO(owner): replace with the real reservation inbox before going live.
  var OWNER_EMAIL = "reservation@lamaisondeloncanjean.fr";

  var form = document.getElementById("bookingForm");
  if (!form) return;

  var calGrid = document.getElementById("calGrid");
  var calLabel = document.getElementById("calLabel");
  var calPrev = document.getElementById("calPrev");
  var calNext = document.getElementById("calNext");
  var checkinInput = document.getElementById("checkin");
  var checkoutInput = document.getElementById("checkout");
  var summary = document.getElementById("bookingSummary");
  var summaryDates = document.getElementById("summaryDates");
  var summaryNights = document.getElementById("summaryNights");
  var summaryPrice = document.getElementById("summaryPrice");
  var tarifFromPrice = document.getElementById("tarifFromPrice");

  var MONTHS_FR = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
  var DOW_FR = ["L","M","M","J","V","S","D"];

  var today = new Date(); today.setHours(0, 0, 0, 0);
  var viewYear = today.getFullYear();
  var viewMonth = today.getMonth();
  var selection = { start: null, end: null };

  var BOOKING_UNAVAILABLE = []; // [{ start: "YYYY-MM-DD", end: "YYYY-MM-DD" }]
  var MONTHLY_PRICES = {}; // { 1: 90, 2: 90, ... 12: 95 }

  function toISO(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function isUnavailable(date) {
    var iso = toISO(date);
    return BOOKING_UNAVAILABLE.some(function (r) { return iso >= r.start && iso < r.end; });
  }

  function isInSelection(date) {
    if (!selection.start || !selection.end) return false;
    return date > selection.start && date < selection.end;
  }

  function priceForNight(date) {
    var month = date.getMonth() + 1;
    return MONTHLY_PRICES[month];
  }

  function stayTotal(start, end) {
    var cursor = new Date(start);
    var total = 0;
    var hasAllPrices = true;
    while (cursor < end) {
      var p = priceForNight(cursor);
      if (typeof p === "number") { total += p; } else { hasAllPrices = false; }
      cursor.setDate(cursor.getDate() + 1);
    }
    return hasAllPrices ? total : null;
  }

  function render() {
    calLabel.textContent = MONTHS_FR[viewMonth] + " " + viewYear;
    calGrid.innerHTML = "";

    DOW_FR.forEach(function (d) {
      var el = document.createElement("div");
      el.className = "dow";
      el.textContent = d;
      calGrid.appendChild(el);
    });

    var firstOfMonth = new Date(viewYear, viewMonth, 1);
    var startOffset = (firstOfMonth.getDay() + 6) % 7; // Monday-first
    var daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    for (var i = 0; i < startOffset; i++) {
      var pad = document.createElement("span");
      calGrid.appendChild(pad);
    }

    for (var day = 1; day <= daysInMonth; day++) {
      var date = new Date(viewYear, viewMonth, day);
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "calendar-day";
      btn.textContent = String(day);

      var past = date < today;
      var unavailable = isUnavailable(date);

      if (past) {
        btn.classList.add("is-muted");
        btn.disabled = true;
      } else if (unavailable) {
        btn.classList.add("is-booked");
        btn.disabled = true;
        btn.setAttribute("aria-label", day + " — indisponible");
      } else {
        btn.addEventListener("click", function (d) {
          return function () { onSelectDate(d); };
        }(date));
      }

      if (selection.start && date.getTime() === selection.start.getTime()) btn.classList.add("is-selected");
      if (selection.end && date.getTime() === selection.end.getTime()) btn.classList.add("is-selected");
      if (isInSelection(date)) btn.classList.add("is-in-range");

      calGrid.appendChild(btn);
    }
  }

  function onSelectDate(date) {
    if (!selection.start || (selection.start && selection.end)) {
      selection = { start: date, end: null };
    } else if (date > selection.start) {
      selection.end = date;
    } else {
      selection = { start: date, end: null };
    }

    // Prevent a range that crosses an unavailable date.
    if (selection.start && selection.end) {
      var cursor = new Date(selection.start);
      var crosses = false;
      while (cursor < selection.end) {
        if (isUnavailable(cursor)) { crosses = true; break; }
        cursor.setDate(cursor.getDate() + 1);
      }
      if (crosses) selection = { start: date, end: null };
    }

    updateInputs();
    render();
  }

  function formatShort(d) {
    return d.getDate() + " " + MONTHS_FR[d.getMonth()].slice(0, 3) + " " + d.getFullYear();
  }

  function formatEUR(n) {
    return n.toLocaleString("fr-FR") + " €";
  }

  function updateInputs() {
    checkinInput.value = selection.start ? formatShort(selection.start) : "";
    checkoutInput.value = selection.end ? formatShort(selection.end) : "";

    if (selection.start && selection.end) {
      var nights = Math.round((selection.end - selection.start) / 86400000);
      summaryDates.textContent = formatShort(selection.start) + " → " + formatShort(selection.end);
      summaryNights.textContent = nights + (nights > 1 ? " nuits" : " nuit");
      var total = stayTotal(selection.start, selection.end);
      summaryPrice.textContent = total !== null ? formatEUR(total) + " au total" : "";
      summary.classList.add("is-visible");
    } else {
      summary.classList.remove("is-visible");
    }
  }

  calPrev.addEventListener("click", function () {
    viewMonth -= 1;
    if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; }
    render();
  });
  calNext.addEventListener("click", function () {
    viewMonth += 1;
    if (viewMonth > 11) { viewMonth = 0; viewYear += 1; }
    render();
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var email = document.getElementById("email").value.trim();
    var guests = document.getElementById("guests").value;

    if (!selection.start || !selection.end) {
      checkinInput.focus();
      return;
    }
    if (!email) {
      document.getElementById("email").focus();
      return;
    }

    var total = stayTotal(selection.start, selection.end);
    var bodyLines = [
      "Dates souhaitées : " + formatShort(selection.start) + " au " + formatShort(selection.end),
      "Voyageurs : " + guests,
      "E-mail de contact : " + email
    ];
    if (total !== null) bodyLines.push("Total estimé : " + formatEUR(total));
    bodyLines.push("", "(Message envoyé depuis le site lamaisondeloncanjean — demande à confirmer manuellement.)");

    var subject = "Demande de réservation — La Maison de l'Oncle Jean";
    var mailto = "mailto:" + OWNER_EMAIL + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(bodyLines.join("\n"));
    window.location.href = mailto;
  });

  render();

  /* ---------------------------------------------------------
     Load real availability + pricing from Supabase.
     Fails silently (open calendar, no price shown) if the
     network/CDN is unavailable — never fabricates data.
  --------------------------------------------------------- */
  (function loadLiveData() {
    if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY || typeof window.supabase === "undefined") return;

    var client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

    client.from("unavailable_ranges").select("start_date, end_date").then(function (res) {
      if (res.error || !res.data) return;
      BOOKING_UNAVAILABLE = res.data.map(function (r) { return { start: r.start_date, end: r.end_date }; });
      render();
    });

    client.from("monthly_prices").select("month, price_per_night").then(function (res) {
      if (res.error || !res.data) return;
      res.data.forEach(function (r) { MONTHLY_PRICES[r.month] = Number(r.price_per_night); });
      updateInputs();
      var prices = Object.keys(MONTHLY_PRICES).map(function (k) { return MONTHLY_PRICES[k]; });
      if (prices.length && tarifFromPrice) {
        tarifFromPrice.textContent = "À partir de " + formatEUR(Math.min.apply(null, prices)) + " / nuit selon la période";
      }
    });
  })();
})();
