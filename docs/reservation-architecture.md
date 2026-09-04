# Architecture de réservation directe — feuille de route

Le site inclut dès maintenant un **widget de réservation** (calendrier, sélection de
dates, formulaire) dans `assets/js/booking.js`. Aujourd'hui, il fonctionne comme un
**formulaire de demande** : le visiteur choisit ses dates et envoie une demande par
e-mail, que vous confirmez manuellement. Aucune date n'est actuellement marquée comme
indisponible (`BOOKING_UNAVAILABLE` est vide) : il ne faut jamais afficher de fausses
dates bloquées à un vrai visiteur.

Voici le chemin pour arriver à une vraie synchronisation multi-plateformes.

## 1. Comment fonctionne la synchronisation entre plateformes

Airbnb, Booking.com et Abritel/Vrbo n'offrent pas d'API publique d'écriture pour un
particulier, mais **tous exportent et importent le format iCal (.ics)** :

- **Airbnb** : Annonce → Calendrier → Disponibilité → *Synchroniser les calendriers* →
  copier le lien d'export, et coller les liens des autres plateformes en import.
- **Booking.com** : Extranet → Calendrier → *Synchroniser les calendriers*.
- **Abritel/Vrbo** : Tableau de bord propriétaire → Calendrier → *Exporter/Importer*.

C'est la méthode standard utilisée par les outils comme Smoobu, Lodgify ou Hospitable :
chaque plateforme exporte ses réservations en iCal, et importe les iCal des autres.

**Étape immédiate, sans développement** : vous pouvez dès aujourd'hui coller le lien
d'export iCal d'Airbnb dans Booking.com et Abritel (et inversement) pour éviter les
doubles réservations entre plateformes, indépendamment de ce site.

## 2. Brancher le site sur ces calendriers (lecture seule)

1. Un petit job planifié (cron serverless : Cloudflare Worker, Vercel Cron, ou une
   fonction Netlify) récupère les 3 flux iCal toutes les 15–30 minutes.
2. Il fusionne les plages occupées dans un fichier `availability.json` :
   ```json
   { "unavailable": [
     { "start": "2026-07-04", "end": "2026-07-11", "source": "airbnb" },
     { "start": "2026-08-02", "end": "2026-08-09", "source": "booking" }
   ]}
   ```
3. `assets/js/booking.js` expose déjà la structure attendue via
   `BOOKING_UNAVAILABLE` — il suffit de remplacer le tableau vide par un `fetch()`
   vers ce JSON au chargement de la page.

## 3. Rendre la réservation directe bloquante partout (écriture)

1. Quand un voyageur envoie une demande sur ce site, un backend (même minimal :
   une fonction serverless + une base légère type Airtable/Supabase) enregistre la
   réservation confirmée.
2. Ce backend republie **son propre flux iCal** (une URL stable, ex.
   `/api/calendar.ics`).
3. Vous ajoutez cette URL comme calendrier externe dans Airbnb, Booking.com et
   Abritel — désormais, une réservation directe bloque aussi les 3 plateformes.

## 4. Ce qu'il reste à construire (par ordre de priorité)

| Étape | Effort | Résultat |
|---|---|---|
| Coller les iCal Airbnb/Booking/Abritel entre elles | 15 min, aucun code | Fin des doubles réservations *entre plateformes* |
| Fonction qui fusionne les 3 iCal → `availability.json` | Quelques heures | Le calendrier du site affiche les vraies indisponibilités |
| Formulaire → e-mail (actuel) | Fait | Demandes reçues, confirmation manuelle |
| Formulaire → backend + confirmation auto + iCal du site | 1–2 jours | Réservation directe qui bloque aussi les autres plateformes |
| Paiement en ligne (acompte) | Selon prestataire (Stripe...) | Réservation directe garantie, moins de no-shows |

Tant que l'étape 2 n'est pas branchée, le calendrier du site reste volontairement
« tout disponible » plutôt que d'afficher des informations non fiables.
