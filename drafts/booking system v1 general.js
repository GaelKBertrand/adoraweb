// ==========================================
// CONFIGURATION
// ==========================================
const GITHUB_TOKEN = '';
const REPO_OWNER = '';
const REPO_NAME = 'adoraweb';
const QUIET_PERIOD_MINUTES = 3;

// 1. ADDS THE "🚀 Web Update" MENU TO YOUR SHEET
function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu('🚀 Website Update Push')
      .addItem('Push Update Now (Manual)', 'processAndPushToGithub')
      .addToUi();
  } catch (e) {}
}

// 2. TRIGGER: RECORDS THE TIME OF YOUR LAST EDIT
// Set this up in Triggers -> "On Edit"
function recordEditTimestamp() {
  const cache = CacheService.getScriptCache();
  cache.put('last_edit_time', new Date().getTime().toString());
}

// 3. TRIGGER: CHECKS THE TIMER AND PUSHES AUTOMATICALLY
// Set this up in Triggers -> "Time-driven" -> "Every minute"
function checkQuietPeriodAndPush() {
  const cache = CacheService.getScriptCache();
  const lastEdit = cache.get('last_edit_time');
  if (!lastEdit) return;

  const elapsed = (new Date().getTime() - parseInt(lastEdit)) / 1000 / 60;
  if (elapsed >= QUIET_PERIOD_MINUTES) {
    processAndPushToGithub();
    cache.remove('last_edit_time');
  }
}

// 4. MAIN SYNC LOGIC
function processAndPushToGithub() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const data = sheet.getDataRange().getValues();

  // FETCH CURRENT DATA TO PRESERVE YOUR IMAGE GALLERIES
  const existingHotels = fetchCurrentHotels();
  const imageMap = {};
  if (existingHotels) {
    existingHotels.forEach(h => {
      if (h["Main hotel ID"]) imageMap[h["Main hotel ID"]] = h.images;
    });
  }

  let hotels = [];
  let roomsListing = [];
  let currentHotel = null;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0] && !row[6]) continue;

    if (row[0] && row[0].toString().trim() !== "") {
      if (currentHotel) hotels.push(currentHotel);

      const hotelId = row[1];
      // Use existing images from GitHub if available, otherwise default cover
      const preservedImages = imageMap[hotelId] || ["assets/img/hotel/" + hotelId.replace('-main','') + "cover.jpg"];

      // Structure for room-details.html (hotels.json)
      currentHotel = {
        "Main Hotel": row[0],
        "Main hotel ID": hotelId,
        "Main Hotel description": row[2],
        "Phone": row[3],
        "Email": row[4],
        "Address Line (Street, Landmark, Village, )": row[5],
        "images": preservedImages,
        "Amenities (same for all hotels)": row[21],
        "rooms": []
      };

      // Structure for rooms.html (rooms.json)
      roomsListing.push({
        "id": hotelId,
        "name": row[0],
        "category": row[0],
        "price": row[11],
        "description": row[9],
        "image": preservedImages[0],
        "maxOccupancy": row[16],
        "features": ["wifi", "balcony", "mountain view"]
      });
    }

    if (currentHotel && row[6]) {
      currentHotel.rooms.push({
        "Hotel rooms options": row[6],
        "Availability": row[7],
        "Group Price (per night)": row[11],
        "Short Description": row[9]
      });
    }
  }
  if (currentHotel) hotels.push(currentHotel);

  updateGithub('hotels.json', hotels);
  updateGithub('rooms.json', roomsListing);
}

// HELPERS
function fetchCurrentHotels() {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/hotels.json`;
  try {
    const res = UrlFetchApp.fetch(url, { "headers": { "Authorization": "token " + GITHUB_TOKEN }, "muteHttpExceptions": true });
    if (res.getResponseCode() === 200) {
      const content = JSON.parse(res.getContentText()).content;
      return JSON.parse(Utilities.newBlob(Utilities.base64Decode(content)).getDataAsString());
    }
  } catch (e) {}
  return null;
}

function updateGithub(path, objContent) {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`;
  const headers = {
    "Authorization": "token " + GITHUB_TOKEN,
    "Accept": "application/vnd.github.v3+json",
    "Content-Type": "application/json"
  };

  let sha = "";
  try {
    const res = UrlFetchApp.fetch(url, { "headers": headers, "muteHttpExceptions": true });
    if (res.getResponseCode() === 200) sha = JSON.parse(res.getContentText()).sha;
  } catch (e) {}

  const payload = {
    "message": "Update " + path,
    "content": Utilities.base64Encode(JSON.stringify(objContent, null, 2), Utilities.Charset.UTF_8),
    "sha": sha
  };

  UrlFetchApp.fetch(url, { "method": "put", "headers": headers, "payload": JSON.stringify(payload), "muteHttpExceptions": true });
}