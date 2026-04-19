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



// WORKING LOGIC

/**
 * BIDIRECTIONAL SYNC: AIRBNB & BOOKING.COM
 * Matches "Occupied" and "Available" strictly.
 */

const GITHUB_TOKEN = '';
const REPO_OWNER = '';
const REPO_NAME = 'adoraweb';

const CAL_CONFIG = {
  sheetName: "Hotel listing",
  googleCalendarName: "Adora Bookings",
  // AIRBNB LINKS
  icals: {
    "Amaira 5 BHK": "https://www.airbnb.com/calendar/ical/1267101270553717636.ics?t=35af7d414c3847b5a669e8906047af29&locale=en-GB",
    "Terra 4 BHK": "https://www.airbnb.com/calendar/ical/1236007881478633269.ics?t=bdc4ce2b9a844737b5328fd45a666154&locale=en-GB",
    "Glen Haus 2 BHK": "https://www.airbnb.com/calendar/ical/1236007881478633269.ics?t=bdc4ce2b9a844737b5328fd45a666154&locale=en-GB",

    // BOOKING.COM LINKS (Add new rooms here following the exact name in your Sheet)
    "4 bhk juniper": "https://ical.booking.com/v1/export?t=4eb6b8ec-a24a-4323-bfbd-7de0eea5f093",
    "Juniper 2 bhk": "https://ical.booking.com/v1/export?t=743d2b0f-5459-4f90-af0d-5c458fd955bb"
  }
};

function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu('🚀 Website Update Push')
      .addItem('Sync iCals & Push Now', 'masterSyncEngine')
      .addToUi();
  } catch (e) {}
}

function masterSyncEngine() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CAL_CONFIG.sheetName);
  const data = sheet.getDataRange().getValues();
  const today = new Date();
  today.setHours(0,0,0,0);

  let cal = CalendarApp.getCalendarsByName(CAL_CONFIG.googleCalendarName)[0] || CalendarApp.createCalendar(CAL_CONFIG.googleCalendarName);

  for (let i = 1; i < data.length; i++) {
    const roomOption = data[i][6]; // Column G
    const currentStatus = data[i][7]; // Column H
    if (!roomOption) continue;

    const icalUrl = CAL_CONFIG.icals[roomOption];

    // Safety check: Only automate if NOT manually locked in "Dealing" or "Reserved"
    if (icalUrl && currentStatus !== "Dealing" && currentStatus !== "Reserved") {
      const isBookedToday = checkIcalAvailability(icalUrl, today);

      let newStatus = isBookedToday ? "Occupied" : "Available";

      if (currentStatus !== newStatus) {
        sheet.getRange(i + 1, 8).setValue(newStatus);
        data[i][7] = newStatus;
      }
    }
    syncToGoogleCalendar(cal, roomOption, data[i][7], today);
  }
  processAndPushToGithub(data);
}

function checkIcalAvailability(url, targetDate) {
  try {
    const freshUrl = url + (url.indexOf('?') > -1 ? '&' : '?') + 'force=' + new Date().getTime();
    const response = UrlFetchApp.fetch(freshUrl, {
      'headers': { 'Cache-Control': 'no-cache' },
      'muteHttpExceptions': true
    }).getContentText();

    const vevents = response.split("BEGIN:VEVENT");

    for (let i = 1; i < vevents.length; i++) {
      const event = vevents[i];

      // Regex modified to handle both Airbnb (DATE:8digits) and Booking.com (DATE:8digitsT6digitsZ)
      const dtstartMatch = event.match(/DTSTART;?[^:]*:(\d{8})/);
      const dtendMatch = event.match(/DTEND;?[^:]*:(\d{8})/);

      if (dtstartMatch && dtendMatch) {
        const start = parseIcalDate(dtstartMatch[1]);
        const end = parseIcalDate(dtendMatch[1]);

        if (targetDate >= start && targetDate < end) {
          return true;
        }
      }
    }
    return false;
  } catch (e) {
    return false;
  }
}

function parseIcalDate(dateStr) {
  const y = parseInt(dateStr.substring(0, 4));
  const m = parseInt(dateStr.substring(4, 6)) - 1;
  const d = parseInt(dateStr.substring(6, 8));
  return new Date(y, m, d);
}

// ==========================================
// DATA PUSH (PRESERVING IMAGES)
// ==========================================
function processAndPushToGithub(passedData) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CAL_CONFIG.sheetName);
  const data = passedData || sheet.getDataRange().getValues();

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
      const preservedImages = imageMap[hotelId] || ["assets/img/hotel/" + hotelId.replace('-main','') + "cover.jpg"];

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

      roomsListing.push({
        "id": hotelId, "name": row[0], "category": row[0], "price": row[11],
        "description": row[9], "image": preservedImages[0], "maxOccupancy": row[16],
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
  const headers = { "Authorization": "token " + GITHUB_TOKEN, "Accept": "application/vnd.github.v3+json", "Content-Type": "application/json" };
  let sha = "";
  try {
    const res = UrlFetchApp.fetch(url, { "headers": headers, "muteHttpExceptions": true });
    if (res.getResponseCode() === 200) sha = JSON.parse(res.getContentText()).sha;
  } catch (e) {}
  const payload = { "message": "Adora Multi-Sync", "content": Utilities.base64Encode(JSON.stringify(objContent, null, 2), Utilities.Charset.UTF_8), "sha": sha };
  UrlFetchApp.fetch(url, { "method": "put", "headers": headers, "payload": JSON.stringify(payload), "muteHttpExceptions": true });
}

function syncToGoogleCalendar(cal, roomName, status, date) {
  const events = cal.getEventsForDay(date, {search: roomName});
  if (["Occupied", "Reserved"].includes(status) && events.length === 0) {
    cal.createAllDayEvent(`[${status}] ${roomName}`, date);
  } else if (status === "Available" && events.length > 0) {
    events.forEach(e => { if (e.getTitle().includes(roomName)) e.deleteEvent(); });
  }
}