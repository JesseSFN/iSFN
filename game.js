import { locations } from "./Cords/locations.js";

let map;
let currentLocation = null;
let score = 0;
let correctLocations = [];

document.addEventListener("DOMContentLoaded", () => {
  initGame();
});

function initGame() {
  correctLocations = progress.correctLocations;
  score = progress.score;

  updateScoreDisplay();
  initMap();
  renderLocationList();
  bindResetButton();
}

function initMap() {
  map = L.map("map").setView([20, 0], 2);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);

  map.on("click", handleMapClick);
}

function renderLocationList() {
  const list = document.querySelector("#locations-list ul");
  list.innerHTML = "";
  const fragment = document.createDocumentFragment();

  locations.forEach((loc, i) => {
    const li = document.createElement("li");
    li.classList.add("location-item");
    li.dataset.index = i;
    li.innerHTML = `${i + 1}. ${loc.name}`;

    if (correctLocations.includes(loc.name)) {
      li.classList.add("correct");
      li.innerHTML += ' <span class="checkmark">✔</span>';
    }

    const hint = document.createElement("div");
    hint.classList.add("hint-text");
    hint.innerText = loc.hint;
    li.appendChild(hint);
    fragment.appendChild(li);
  });

  list.appendChild(fragment);
  list.addEventListener("click", handleListClick);
}

function handleListClick(e) {
  const li = e.target.closest(".location-item");
  if (!li || li.classList.contains("correct")) return;

  document.querySelectorAll(".location-item").forEach(item => {
    item.classList.remove("selected");
    item.querySelector(".hint-text").classList.remove("show");
  });

  li.classList.add("selected");
  li.querySelector(".hint-text").classList.add("show");

  const index = li.dataset.index;
  currentLocation = locations[index];
  map.setView([currentLocation.lat, currentLocation.lng], 15);
}

function handleMapClick(e) {
  if (!currentLocation) return;

  const distance = getDistanceKm(
    currentLocation.lat,
    currentLocation.lng,
    e.latlng.lat,
    e.latlng.lng
  );

  if (distance <= currentLocation.radius) {
    showPopup(e.latlng, "✅ Goed! Binnen het gebied!");
    markLocationAsCorrect(currentLocation.name);
  } else {
    showPopup(e.latlng, "❌ Fout! Probeer opnieuw.");
  }
}

function markLocationAsCorrect(name) {
  if (!correctLocations.includes(name)) correctLocations.push(name);
  score = correctLocations.length;
  saveProgress();

  updateScoreDisplay();
  renderLocationList();
  nextRound();
}

function nextRound() {
  currentLocation = null;
  map.setView([20, 0], 2);
  if (score === locations.length) showCongratulations();
}

function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(deg2rad(lat1)) *
      Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function deg2rad(deg) {
  retu

