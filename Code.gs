

var TZ = 'Asia/Manila';

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('💊 Gamot Reminder PH')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getOrCreateSpreadsheet() {
  var props = PropertiesService.getScriptProperties();
  var ssId  = props.getProperty('SPREADSHEET_ID');
  if (ssId) {
    try { return SpreadsheetApp.openById(ssId); } catch (e) {}
  }
  var ss    = SpreadsheetApp.create('Gamot Reminder PH — Data');
  props.setProperty('SPREADSHEET_ID', ss.getId());

  var users = ss.getActiveSheet().setName('Users');
  users.appendRow(['UserID','Name','Email','PasswordHash','Language','CreatedAt','Active']);
  users.setFrozenRows(1);

  var rem = ss.insertSheet('Reminders');
  rem.appendRow(['ReminderID','UserID','Medicine','Dosage','Unit','Frequency',
                 'Times','StartDate','EndDate','Notes','Active','CreatedAt']);
  rem.setFrozenRows(1);

  return ss;
}

function hashPassword(p) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, p)
    .map(function(b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); })
    .join('');
}

function sanitize(str) {
  return String(str || '').replace(/[<>"']/g, '').trim();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function isValidTime(ts) {
  return /^\d{1,2}:\d{2}$/.test(String(ts).trim());
}

function findUserRow(users, email) {
  var data = users.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][2]).toLowerCase() === String(email).toLowerCase()) {
      return { row: i + 1, data: data[i] };
    }
  }
  return null;
}

function registerUser(name, email, password, language) {
  name     = sanitize(name);
  email    = sanitize(email).toLowerCase();
  language = language || 'en';

  if (!name)              return { success: false, message: 'Name is required.' };
  if (!isValidEmail(email)) return { success: false, message: 'Invalid email address.' };
  if (!password || password.length < 6)
    return { success: false, message: 'Password must be at least 6 characters.' };

  var ss    = getOrCreateSpreadsheet();
  var users = ss.getSheetByName('Users');
  if (findUserRow(users, email)) return { success: false, message: 'Email already registered.' };

  var uid  = Utilities.getUuid();
  var hash = hashPassword(password);
  users.appendRow([uid, name, email, hash, language, new Date(), true]);

  try { sendWelcomeEmail(email, name, language); } catch (e) {}
  return { success: true, user: { id: uid, name: name, email: email, language: language } };
}

function loginUser(email, password) {
  email = sanitize(email).toLowerCase();
  if (!email || !password) return { success: false, message: 'Please fill in all fields.' };

  var ss    = getOrCreateSpreadsheet();
  var users = ss.getSheetByName('Users');
  var found = findUserRow(users, email);
  if (!found) return { success: false, message: 'Invalid email or password.' };

  var d = found.data;
  if (!d[6]) return { success: false, message: 'This account has been deactivated.' };
  if (d[3] !== hashPassword(password)) return { success: false, message: 'Invalid email or password.' };

  return { success: true, user: { id: d[0], name: d[1], email: d[2], language: d[4] } };
}

function changePassword(userId, currentPassword, newPassword) {
  if (!newPassword || newPassword.length < 6)
    return { success: false, message: 'New password must be at least 6 characters.' };

  var ss    = getOrCreateSpreadsheet();
  var sheet = ss.getSheetByName('Users');
  var data  = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === userId) {
      if (data[i][3] !== hashPassword(currentPassword))
        return { success: false, message: 'Current password is incorrect.' };
      sheet.getRange(i + 1, 4).setValue(hashPassword(newPassword));
      return { success: true };
    }
  }
  return { success: false, message: 'User not found.' };
}

function updateUserLanguage(userId, language) {
  var ss    = getOrCreateSpreadsheet();
  var sheet = ss.getSheetByName('Users');
  var data  = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === userId) {
      sheet.getRange(i + 1, 5).setValue(language);
      return { success: true };
    }
  }
  return { success: false };
}

function getUserById(userId) {
  var ss   = getOrCreateSpreadsheet();
  var data = ss.getSheetByName('Users').getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === userId)
      return { id: data[i][0], name: data[i][1], email: data[i][2], language: data[i][4] };
  }
  return null;
}

function getReminders(userId) {
  var ss    = getOrCreateSpreadsheet();
  var sheet = ss.getSheetByName('Reminders');
  if (!sheet || sheet.getLastRow() < 2) return [];

  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 12).getValues();
  return data
    .filter(function(r) { return r[0] && r[1] === userId; })
    .map(function(r) {
      return {
        id:        r[0],
        userId:    r[1],
        medicine:  r[2],
        dosage:    r[3],
        unit:      r[4],
        frequency: r[5],
        times:     r[6],
        startDate: r[7]  ? Utilities.formatDate(new Date(r[7]),  TZ, 'yyyy-MM-dd') : '',
        endDate:   r[8]  ? Utilities.formatDate(new Date(r[8]),  TZ, 'yyyy-MM-dd') : '',
        notes:     r[9],
        active:    r[10],
        createdAt: r[11] ? Utilities.formatDate(new Date(r[11]), TZ, 'yyyy-MM-dd') : ''
      };
    });
}

function saveReminder(userId, data) {
  
  if (!sanitize(data.medicine)) return { success: false, message: 'Medicine name is required.' };

  
  if (data.times) {
    var badTimes = String(data.times).split(',').filter(function(t) {
      return t.trim() && !isValidTime(t.trim());
    });
    if (badTimes.length > 0)
      return { success: false, message: 'Invalid time format. Use HH:MM (e.g. 08:00).' };
  }

  var ss    = getOrCreateSpreadsheet();
  var sheet = ss.getSheetByName('Reminders');
  var id    = data.id || Utilities.getUuid();
  var isEdit = false;

  if (data.id) {
    var vals = sheet.getDataRange().getValues();
    for (var i = 1; i < vals.length; i++) {
      if (vals[i][0] === data.id && vals[i][1] === userId) {
        sheet.getRange(i + 1, 1, 1, 12).setValues([[
          id, userId,
          sanitize(data.medicine), data.dosage, data.unit,
          data.frequency, data.times || '',
          data.startDate || '', data.endDate || '',
          sanitize(data.notes), data.active !== false, vals[i][11]
        ]]);
        isEdit = true;
        break;
      }
    }
  }

  if (!isEdit) {
    sheet.appendRow([
      id, userId,
      sanitize(data.medicine), data.dosage, data.unit,
      data.frequency, data.times || '',
      data.startDate || '', data.endDate || '',
      sanitize(data.notes), true, new Date()
    ]);
  }

  try {
    var user = getUserById(userId);
    if (user) sendReminderSavedEmail(user, data, isEdit);
  } catch (e) {}

  return { success: true, id: id };
}

function deleteReminder(userId, reminderId) {
  var ss    = getOrCreateSpreadsheet();
  var sheet = ss.getSheetByName('Reminders');
  var vals  = sheet.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    if (vals[i][0] === reminderId && vals[i][1] === userId) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { success: false };
}

function toggleReminder(userId, reminderId, active) {
  var ss    = getOrCreateSpreadsheet();
  var sheet = ss.getSheetByName('Reminders');
  var vals  = sheet.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    if (vals[i][0] === reminderId && vals[i][1] === userId) {
      sheet.getRange(i + 1, 11).setValue(active);
      return { success: true };
    }
  }
  return { success: false };
}

function sendWelcomeEmail(email, name, lang) {
  var fil = lang === 'fil';
  MailApp.sendEmail({
    to:      email,
    subject: fil ? '🌟 Maligayang pagdating sa Gamot Reminder PH!' : '🌟 Welcome to Gamot Reminder PH!',
    body:    fil
      ? 'Kamusta ' + name + '!\n\nMaligayang pagdating sa Gamot Reminder PH 🇵🇭\n'
        + 'Maaari ka na mag-set ng iyong mga paalala para sa gamot.\n\nIngat lagi at manatiling malusog! 💊'
      : 'Hello ' + name + '!\n\nWelcome to Gamot Reminder PH 🇵🇭\n'
        + 'You can now set your medicine reminders and never miss a dose.\n\nStay safe and healthy! 💊'
  });
}

function sendReminderEmail(email, name, medicine, dosage, unit, time, lang) {
  var fil = lang === 'fil';
  MailApp.sendEmail({
    to:      email,
    subject: fil ? '⏰ Paalala: ' + medicine + ' — ' + time : '⏰ Reminder: ' + medicine + ' — ' + time,
    body:    fil
      ? 'Kamusta ' + name + '!\n\n💊 Gamot: ' + medicine + '\n📏 Dosis: ' + dosage + ' ' + unit
        + '\n⏰ Oras: ' + time + '\n\nHuwag kalimutang uminom! Ingat palagi.\n\n— Gamot Reminder PH 🇵🇭'
      : 'Hello ' + name + '!\n\n💊 Medicine: ' + medicine + '\n📏 Dosage: ' + dosage + ' ' + unit
        + '\n⏰ Time: ' + time + "\n\nDon't forget to take your medicine! Stay healthy.\n\n— Gamot Reminder PH 🇵🇭"
  });
}

function sendReminderSavedEmail(user, data, isEdit) {
  var fil    = user.language === 'fil';
  var action = isEdit
    ? (fil ? 'Na-update' : 'Updated')
    : (fil ? 'Naidagdag' : 'Added');
  var times  = (data.times || '').split(',')
    .map(function(ts) { return ts.trim(); })
    .filter(Boolean).join(', ');

  MailApp.sendEmail({
    to:      user.email,
    subject: fil
      ? '💊 ' + action + ' ang Reminder: ' + data.medicine
      : '💊 Reminder ' + action + ': ' + data.medicine,
    body: fil
      ? 'Kamusta ' + user.name + '!\n\n'
        + (isEdit ? 'Na-update ang iyong reminder:\n' : 'Naidagdag ang bagong reminder:\n')
        + '\n💊 Gamot: ' + data.medicine
        + '\n📏 Dosis: ' + data.dosage + ' ' + data.unit
        + '\n🔄 Dalas: ' + data.frequency
        + '\n⏰ Oras: ' + (times || '(hindi natakda)')
        + '\n📅 Simula: ' + (data.startDate || '—')
        + (data.endDate ? '\n📅 Katapusan: ' + data.endDate : '')
        + (data.notes   ? '\n🗒️ Tala: ' + data.notes : '')
        + '\n\nHuwag kalimutang uminom ng gamot!\n— Gamot Reminder PH 🇵🇭'
      : 'Hello ' + user.name + '!\n\n'
        + (isEdit ? 'Your reminder has been updated:\n' : 'Your new reminder has been added:\n')
        + '\n💊 Medicine: ' + data.medicine
        + '\n📏 Dosage: ' + data.dosage + ' ' + data.unit
        + '\n🔄 Frequency: ' + data.frequency
        + '\n⏰ Schedule: ' + (times || '(not set)')
        + '\n📅 Start: ' + (data.startDate || '—')
        + (data.endDate ? '\n📅 End: ' + data.endDate : '')
        + (data.notes   ? '\n🗒️ Notes: ' + data.notes : '')
        + "\n\nDon't forget to take your medicine! Stay healthy.\n— Gamot Reminder PH 🇵🇭"
  });
}

function sendTestReminder(userId) {
  var user = getUserById(userId);
  if (!user) return { success: false, message: 'User not found.' };
  try {
    sendReminderEmail(
      user.email, user.name,
      'Sample Medicine', '500', 'mg',
      Utilities.formatDate(new Date(), TZ, 'hh:mm a'),
      user.language
    );
    return { success: true };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

function sendPasswordReset(email) {
  email = sanitize(email).toLowerCase();
  if (!isValidEmail(email)) return { success: false, message: 'Invalid email address.' };

  var ss    = getOrCreateSpreadsheet();
  var users = ss.getSheetByName('Users');
  var found = findUserRow(users, email);
  if (!found || !found.data[6]) return { success: false, message: 'No account found with that email.' };

  
  var tempPw = Math.random().toString(36).slice(-8) + Math.floor(Math.random() * 100);
  users.getRange(found.row, 4).setValue(hashPassword(tempPw));

  try {
    MailApp.sendEmail({
      to:      email,
      subject: '🔑 Gamot Reminder PH — Password Reset',
      body:    'Hello ' + found.data[1] + '!\n\nYour temporary password is: ' + tempPw
               + '\n\nPlease log in and change your password in Settings → Change Password.\n\n— Gamot Reminder PH 🇵🇭'
    });
    return { success: true };
  } catch (e) {
    return { success: false, message: 'Failed to send email: ' + e.message };
  }
}

function setupDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'checkAndSendReminders') ScriptApp.deleteTrigger(t);
  });
  
  ScriptApp.newTrigger('checkAndSendReminders').timeBased().everyMinutes(1).create();
  return { success: true };
}

function checkAndSendReminders() {
  var ss       = getOrCreateSpreadsheet();
  var now      = new Date();
  var nowStr   = Utilities.formatDate(now, TZ, 'HH:mm');
  var nowParts = nowStr.split(':');
  var nowMin   = parseInt(nowParts[0]) * 60 + parseInt(nowParts[1]);

  var usersData     = ss.getSheetByName('Users').getDataRange().getValues();
  var remindersData = ss.getSheetByName('Reminders').getDataRange().getValues();

  var userMap = {};
  for (var i = 1; i < usersData.length; i++) {
    if (usersData[i][6])
      userMap[usersData[i][0]] = {
        name:     usersData[i][1],
        email:    usersData[i][2],
        language: usersData[i][4]
      };
  }

  for (var j = 1; j < remindersData.length; j++) {
    var r    = remindersData[j];
    if (!r[10]) continue;
    var user = userMap[r[1]];
    if (!user) continue;

    (r[6] || '').split(',').forEach(function(t) {
      t = t.trim();
      if (!isValidTime(t)) return;
      var parts = t.split(':');
      var tMin  = parseInt(parts[0]) * 60 + parseInt(parts[1]);
      
      if (tMin === nowMin || Math.abs(tMin - nowMin) === 5) {
        try {
          sendReminderEmail(user.email, user.name, r[2], r[3], r[4], t, user.language);
        } catch (e) {}
      }
    });
  }
}

function doPost(e) {
  var headers = { 'Access-Control-Allow-Origin': '*' };
  try {
    var body   = JSON.parse(e.postData.contents);
    var action = body.action;
    var result;

    switch (action) {
      case 'register':
        result = registerUser(body.name, body.email, body.password, body.language || 'en');
        break;
      case 'login':
        result = loginUser(body.email, body.password);
        break;
      case 'getReminders':
        result = { success: true, reminders: getReminders(body.userId) };
        break;
      case 'saveReminder':
        result = saveReminder(body.userId, body.reminder);
        break;
      case 'deleteReminder':
        result = deleteReminder(body.userId, body.reminderId);
        break;
      case 'toggleReminder':
        result = toggleReminder(body.userId, body.reminderId, body.active);
        break;
      case 'changePassword':
        result = changePassword(body.userId, body.currentPassword, body.newPassword);
        break;
      case 'sendPasswordReset':
        result = sendPasswordReset(body.email);
        break;
      case 'sendTestReminder':
        result = sendTestReminder(body.userId);
        break;
      case 'updateUserLanguage':
        result = updateUserLanguage(body.userId, body.language);
        break;
      case 'setupDailyTrigger':
        result = setupDailyTrigger();
        break;
      default:
        result = { success: false, message: 'Unknown action: ' + action };
    }

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
