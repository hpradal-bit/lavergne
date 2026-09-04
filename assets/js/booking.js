/* ==========================================================================
   Booking widget — "La Maison de l'Oncle Jean"
   ==========================================================================
   This is a lead-capture calendar, not a live transactional booking engine.
   It lets a visitor pick dates, see them validated against a local list of
   unavailable ranges, and send a reservation request by e-mail.

   ROADMAP TO REAL MULTI-PLATFORM SYNC (Airbnb / Booking.com / Abritel-Vrbo)
   --------------------------------------------------------------------------
   Every major OTA (Airbnb, Booking.com, Vrbo/Abritel) exposes a private
   iCal export URL per listing, and accepts importing external iCal URLs to
   block dates on their side too. That's the standard way independent sites
   sync availability without a paid channel manager:

     1. Backend job (e.g. a small serverless function / cron) fetches the
        iCal feed from each platform every 15-30 min:
          - Airbnb:   Listing > Calendar > Availability > Export calendar
          - Booking.com: Extranet > Calendar > Sync calendars
          - Abritel/Vrbo: Owner dashboard > Calendar > Export
     2. It merges all busy ranges into one JSON file, e.g.:
          { "unavailable": [{ "start": "2026-07-04", "end": "2026-07-11", "source": "airbnb" }, ...] }
     3. This JSON is fetched by `loadUnavailableRanges()` below instead of
        the empty in-file default.
     4. When a visitor books directly on this site, the backend both stores
        the booking AND republishes this site's own iCal export URL — which
        the owner adds as an external calendar in Airbnb/Booking/Abritel, so
        the new direct booking blocks the dates everywhere else too.
     5. Until that backend exists, `BOOKING_UNAVAILABLE` stays empty and
        every request is manually confirmed by e-mail within 24h — never
        show fake "booked" dates to real visitors.
   ========================================================================== */

(function () {
  "use strict";

  // TODO(owner): replace with the real reservation inbox before going live.
  var OWNER_EMAIL = "reservation@lamaisondeloncanjean.fr";

  // Populate this from loadUnavailableRanges() once real sync exists.
  // Shape: [{ start: "YYYY-MM-DD", end: "YYYY-MM-DD" }]
  var BOOKING_UNAVAILABLE = [];

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

  var MONTHS_FR = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
  var DOW_FR = ["L","M","M","J","V","S","D"];

  var today = new Date(); today.setHours(0, 0, 0, 0);
  var viewYear = today.getFullYear();
  var viewMonth = today.getMonth();
  var selection = { start: null, end: null };

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

  function updateInputs() {
    checkinInput.value = selection.start ? formatShort(selection.start) : "";
    checkoutInput.value = selection.end ? formatShort(selection.end) : "";

    if (selection.start && selection.end) {
      var nights = Math.round((selection.end - selection.start) / 86400000);
      summaryDates.textContent = formatShort(selection.start) + " → " + formatShort(selection.end);
      summaryNights.textContent = nights + (nights > 1 ? " nuits" : " nuit");
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

    var subject = "Demande de réservation — La Maison de l'Oncle Jean";
    var body = [
      "Dates souhaitées : " + formatShort(selection.start) + " au " + formatShort(selection.end),
      "Voyageurs : " + guests,
      "E-mail de contact : " + email,
      "",
      "(Message envoyé depuis le site lamaisondeloncanjean — demande à confirmer manuellement.)"
    ].join("\n");

    var mailto = "mailto:" + OWNER_EMAIL + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
    window.location.href = mailto;
  });

  render();
})();
