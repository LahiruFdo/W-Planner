/**
 * RSVP receiver for the wedding invitation.
 *
 * Setup (one time):
 *   1. Create a Google Sheet, then open Extensions → Apps Script.
 *   2. Replace the editor contents with this file and save.
 *   3. Deploy → New deployment → type "Web app".
 *        Execute as:      Me
 *        Who has access:  Anyone
 *   4. Copy the web app URL (ends in /exec) into `googleApiUrl` in
 *      src/environments/environment.ts and environment.development.ts.
 *
 * After editing this script, publish the change with
 * Deploy → Manage deployments → Edit → Version: New version. The URL stays the same.
 *
 * Each invitee has one row, keyed by id. Sending the RSVP again updates the row.
 */

// Used to check each RSVP against the real guest list, so the sheet only
// ever holds known invitees with a valid number attending.
const INVITEES_URL = 'https://w-planner.lahirudfdo95-c6a.workers.dev/invitees.json';
const SHEET_NAME = 'RSVPs';
const HEADERS = ['Updated', 'Invitee ID', 'Invitation', 'Invited', 'Attending', 'No. Attending'];

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const id = String(body.guestId || '').trim();
    const attendance = String(body.attendance || '').trim().toLowerCase();

    if (attendance !== 'yes' && attendance !== 'no') {
      return json({ ok: false, error: 'Please choose Yes or No.' });
    }

    const invitee = findInvitee(id);
    if (!invitee) {
      return json({ ok: false, error: 'We could not find your invitation. Please use the link you were sent.' });
    }

    const invited = Math.max(1, Math.floor(Number(invitee.invitedCount)) || 1);
    let attending = 0;
    if (attendance === 'yes') {
      attending = invited > 1 ? Math.floor(Number(body.attendingCount)) : 1;
      if (!(attending >= 1 && attending <= invited)) {
        return json({ ok: false, error: 'Number attending must be between 1 and ' + invited + '.' });
      }
    }

    const row = [
      new Date(),
      invitee.id,
      String(body.guestName || invitee.name || ''),
      invited,
      attendance === 'yes' ? 'Yes' : 'No',
      attending
    ];

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      upsertRow(invitee.id, row);
    } finally {
      lock.releaseLock();
    }

    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: 'Could not save RSVP.' });
  }
}

function findInvitee(id) {
  if (!id) return null;
  const cache = CacheService.getScriptCache();
  let text = cache.get('invitees');
  if (!text) {
    text = UrlFetchApp.fetch(INVITEES_URL).getContentText();
    cache.put('invitees', text, 300); // pick up guest list edits within 5 minutes
  }
  const wanted = id.toLowerCase();
  const list = JSON.parse(text) || [];
  return list.find(function (i) {
    return String(i.id || '').trim().toLowerCase() === wanted;
  }) || null;
}

function upsertRow(id, row) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    // Keep ids like "0123" as text so the leading zero survives.
    sheet.getRange('B:B').setNumberFormat('@');
  }

  const last = sheet.getLastRow();
  if (last > 1) {
    const ids = sheet.getRange(2, 2, last - 1, 1).getValues();
    for (let r = 0; r < ids.length; r++) {
      if (String(ids[r][0]) === String(id)) {
        sheet.getRange(r + 2, 1, 1, row.length).setValues([row]);
        return;
      }
    }
  }
  sheet.appendRow(row);
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
