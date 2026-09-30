(function () {
  "use strict";

  if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY || typeof window.supabase === "undefined") {
    document.body.innerHTML = "<p style='padding:40px;font-family:sans-serif'>Configuration Supabase manquante.</p>";
    return;
  }

  var client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  var MONTHS_FR = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

  var loginPanel = document.getElementById("loginPanel");
  var dashboard = document.getElementById("dashboard");
  var loginForm = document.getElementById("loginForm");
  var loginError = document.getElementById("loginError");
  var userEmailEl = document.getElementById("userEmail");

  function showStatus(el, text, isError) {
    el.textContent = text;
    el.hidden = false;
    el.style.color = isError ? "#b3261e" : "";
    setTimeout(function () { el.hidden = true; }, 4000);
  }

  /* ---------------- Auth ---------------- */
  loginForm.addEventListener("submit", function (e) {
    e.preventDefault();
    loginError.hidden = true;
    var email = document.getElementById("loginEmail").value.trim();
    var password = document.getElementById("loginPassword").value;
    client.auth.signInWithPassword({ email: email, password: password }).then(function (res) {
      if (res.error) {
        loginError.textContent = "Connexion refusée : " + res.error.message;
        loginError.hidden = false;
        return;
      }
      enterDashboard(res.data.session);
    });
  });

  document.getElementById("logoutBtn").addEventListener("click", function () {
    client.auth.signOut().then(function () { window.location.reload(); });
  });

  client.auth.getSession().then(function (res) {
    if (res.data && res.data.session) enterDashboard(res.data.session);
  });

  function enterDashboard(session) {
    loginPanel.hidden = true;
    dashboard.hidden = false;
    userEmailEl.textContent = session.user.email;
    loadPrices();
    loadIcalSources();
    loadPhotos();
  }

  /* ---------------- Prices ---------------- */
  var pricesForm = document.getElementById("pricesForm");
  var pricesStatus = document.getElementById("pricesStatus");

  function loadPrices() {
    client.from("monthly_prices").select("month, price_per_night").order("month").then(function (res) {
      if (res.error || !res.data) return;
      pricesForm.innerHTML = "";
      res.data.forEach(function (row) {
        var label = document.createElement("label");
        label.textContent = MONTHS_FR[row.month - 1];
        var input = document.createElement("input");
        input.type = "number";
        input.step = "0.01";
        input.min = "0";
        input.dataset.month = row.month;
        input.value = row.price_per_night;
        label.appendChild(input);
        pricesForm.appendChild(label);
      });
    });
  }

  pricesForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var updates = Array.prototype.map.call(pricesForm.querySelectorAll("input"), function (input) {
      return { month: Number(input.dataset.month), price_per_night: Number(input.value) };
    });
    client.from("monthly_prices").upsert(updates).then(function (res) {
      showStatus(pricesStatus, res.error ? "Erreur : " + res.error.message : "Tarifs enregistrés.", !!res.error);
    });
  });

  /* ---------------- iCal sources ---------------- */
  var icalForm = document.getElementById("icalForm");
  var icalStatus = document.getElementById("icalStatus");
  var syncLog = document.getElementById("syncLog");
  var PLATFORM_FIELDS = { "Airbnb": "icalAirbnb", "Booking.com": "icalBooking", "Abritel/Vrbo": "icalAbritel" };

  function loadIcalSources() {
    client.from("ical_sources").select("platform, url, last_synced_at, last_sync_status").then(function (res) {
      if (res.error || !res.data) return;
      res.data.forEach(function (row) {
        var fieldId = PLATFORM_FIELDS[row.platform];
        if (fieldId) document.getElementById(fieldId).value = row.url;
      });
      renderSyncLog(res.data);
    });
  }

  function renderSyncLog(rows) {
    syncLog.innerHTML = "";
    rows.forEach(function (row) {
      if (!row.last_synced_at) return;
      var li = document.createElement("li");
      var date = new Date(row.last_synced_at).toLocaleString("fr-FR");
      li.textContent = row.platform + " — dernière synchro " + date + " (" + (row.last_sync_status || "?") + ")";
      syncLog.appendChild(li);
    });
  }

  icalForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var rows = [];
    Object.keys(PLATFORM_FIELDS).forEach(function (platform) {
      var url = document.getElementById(PLATFORM_FIELDS[platform]).value.trim();
      if (url) rows.push({ platform: platform, url: url, active: true });
    });
    client.from("ical_sources").select("id, platform").then(function (existing) {
      var byPlatform = {};
      (existing.data || []).forEach(function (r) { byPlatform[r.platform] = r.id; });
      var upserts = rows.map(function (r) {
        return byPlatform[r.platform] ? Object.assign({ id: byPlatform[r.platform] }, r) : r;
      });
      client.from("ical_sources").upsert(upserts).then(function (res) {
        showStatus(icalStatus, res.error ? "Erreur : " + res.error.message : "Liens enregistrés. La prochaine synchro automatique aura lieu dans les 3h, ou cliquez sur « Synchroniser maintenant ».", !!res.error);
      });
    });
  });

  document.getElementById("syncNowBtn").addEventListener("click", function () {
    client.auth.getSession().then(function (res) {
      var token = res.data.session.access_token;
      showStatus(icalStatus, "Synchronisation en cours…", false);
      fetch(window.SUPABASE_URL + "/functions/v1/sync-calendars", {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" }
      }).then(function (r) { return r.json(); }).then(function (data) {
        showStatus(icalStatus, "Synchronisé : " + data.total_ranges + " période(s) bloquée(s) au total.", false);
        loadIcalSources();
      }).catch(function (err) {
        showStatus(icalStatus, "Erreur de synchronisation : " + err, true);
      });
    });
  });

  /* ---------------- Photos ---------------- */
  var photoForm = document.getElementById("photoForm");
  var photoStatus = document.getElementById("photoStatus");
  var photoGrid = document.getElementById("photoGrid");

  function loadPhotos() {
    client.from("gallery_photos").select("id, storage_path, caption, position").order("position").then(function (res) {
      if (res.error || !res.data) return;
      photoGrid.innerHTML = "";
      res.data.forEach(function (photo) {
        var item = document.createElement("div");
        item.className = "admin-photo-item";
        var img = document.createElement("img");
        img.src = window.SUPABASE_URL + "/storage/v1/object/public/gallery/" + photo.storage_path;
        img.alt = photo.caption || "";
        var del = document.createElement("button");
        del.textContent = "×";
        del.setAttribute("aria-label", "Supprimer");
        del.addEventListener("click", function () { deletePhoto(photo); });
        item.appendChild(img);
        item.appendChild(del);
        photoGrid.appendChild(item);
      });
    });
  }

  function deletePhoto(photo) {
    client.storage.from("gallery").remove([photo.storage_path]).then(function () {
      client.from("gallery_photos").delete().eq("id", photo.id).then(function (res) {
        if (!res.error) loadPhotos();
      });
    });
  }

  photoForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var file = document.getElementById("photoFile").files[0];
    var caption = document.getElementById("photoCaption").value.trim();
    if (!file) return;

    var path = Date.now() + "-" + file.name.replace(/[^a-zA-Z0-9.\-]/g, "_");
    showStatus(photoStatus, "Envoi en cours…", false);

    client.storage.from("gallery").upload(path, file).then(function (uploadRes) {
      if (uploadRes.error) {
        showStatus(photoStatus, "Erreur : " + uploadRes.error.message, true);
        return;
      }
      client.from("gallery_photos").select("position").order("position", { ascending: false }).limit(1).then(function (posRes) {
        var nextPosition = posRes.data && posRes.data.length ? posRes.data[0].position + 1 : 0;
        client.from("gallery_photos").insert({ storage_path: path, caption: caption, position: nextPosition }).then(function (insertRes) {
          showStatus(photoStatus, insertRes.error ? "Erreur : " + insertRes.error.message : "Photo ajoutée.", !!insertRes.error);
          photoForm.reset();
          loadPhotos();
        });
      });
    });
  });
})();
