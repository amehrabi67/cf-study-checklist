# CF Study Checklist

**Purdue University · Cognitive Flexibility Study**  
A fully browser-based, three-view study management portal for participants, data collectors (RAs), and admin.

---

## 🚀 Deploy to GitHub Pages (5 minutes)

### 1. Create a new GitHub repository
```
Name: cf-study-checklist
Visibility: Private (recommended for research data)
```

### 2. Upload these 3 files
- `index.html`
- `style.css`
- `app.js`

### 3. Enable GitHub Pages
```
Settings → Pages → Source: Deploy from a branch
Branch: main → / (root)
Save
```

Your portal will be live at:
```
https://YOUR-USERNAME.github.io/cf-study-checklist/
```

---

## 🔗 The Three Links

| Who | URL |
|-----|-----|
| **Participant** | `https://YOUR-USERNAME.github.io/cf-study-checklist/#participant` |
| **Data Collector (RA)** | `https://YOUR-USERNAME.github.io/cf-study-checklist/#collector` |
| **Admin / PI** | `https://YOUR-USERNAME.github.io/cf-study-checklist/#admin` |

---

## 🔐 Default Admin Password

```
CFstudy2025
```

To change it, open `app.js` and edit line:
```js
const ADMIN_PASSWORD = 'CFstudy2025';
```

---

## 📋 How It Works

### For Participants (`#participant`)
1. Participant enters their **CF code** (e.g. `CF001`)
2. Their **personalized checklist** appears — steps locked in order
3. Only the **current step** is active and clickable
4. **Survey steps** open a modal with a direct link to Qualtrics (ID embedded in URL)
5. Participant clicks **"Mark as Submitted"** after completing each survey
6. RA steps show "Waiting for RA" — participant cannot skip them
7. Full session history downloadable as CSV

### For Data Collectors (`#collector`)
1. RA enters participant code + their own initials
2. Full **Session 1** and **Session 2** checklists appear
3. RAs can:
   - Mark RA steps as done
   - Record **exact timestamps** for exam start/end (one click = now)
   - Open survey links for participants
   - Mark surveys as submitted
   - Set session dates and times
   - Log HRV device ID
   - Add notes per step or per session
   - **Undo** any step if needed
4. All changes save instantly to the browser

### For Admin (`#admin`)
1. Password-protected dashboard
2. **Stats**: Total enrolled, S1 done, S2 started, Complete
3. **Group balance**: Review vs No Review with visual bar + imbalance warning
4. **Participant table**: All participants with progress bars, status, dates, RA
5. **Add participants** with auto-balanced group assignment
6. **Edit** any participant field (schedule, group, status, notes)
7. **Export all data** as JSON (for backup / cross-device sync)
8. **Import JSON** to restore or merge from another device

---

## 🔄 Cross-Device Sync

Data is stored in **localStorage** (browser only). To sync across devices:

1. **Admin** → Export All → saves `cf_study_data_YYYYMMDD.json`
2. On the other device → **Admin** → Import JSON → select the file
3. Data merges (imported data wins on conflict)

> **Best practice**: Export after every session. Keep the JSON file in a secure shared folder (e.g., Purdue Box/OneDrive).

---

## 📊 Survey Links (embedded in portal)

| Survey | URL |
|--------|-----|
| Sleep Quality | `https://purdue.ca1.qualtrics.com/jfe/form/SV_80buUCCnp3ssuEu` |
| Test Anxiety | `https://purdue.ca1.qualtrics.com/jfe/form/SV_bkGoyGnyAYnrbtY` |
| Fatigue | `https://purdue.ca1.qualtrics.com/jfe/form/SV_eD4CwmMjOpMLm3c` |
| Review Text Check | `https://purdue.ca1.qualtrics.com/jfe/form/SV_8k5vYg8glY43VIi` |

Each survey link automatically appends `?participant=CF###` for tracking.

---

## 📁 Session Step Order

### Session 1 (Day 1)
| # | Step | Who | Type |
|---|------|-----|------|
| 1 | Sleep Quality Survey (Pre) | Participant | Survey |
| 2 | Test Anxiety Survey (Pre) | Participant | Survey |
| 3 | Fatigue Survey (Pre) | Participant | Survey |
| 4 | Polar H10 Fitted & Verified | RA | RA Action |
| 5 | Resting HRV Baseline (5 min) | RA | RA Action |
| 6 | Exam 1 — Start Time | RA | Timestamp |
| 7 | Exam 1 — End Time | RA | Timestamp |
| 8 | Sleep Quality Survey (Post) | Participant | Survey |
| 9 | Test Anxiety Survey (Post) | Participant | Survey |
| 10 | Fatigue Survey (Post) | Participant | Survey |
| 11 | Review Materials Delivered | RA | RA Action |

### Session 2 (Day 2)
| # | Step | Who | Type | Note |
|---|------|-----|------|------|
| 1 | Review Text Check | Participant | Survey | **Review group only** |
| 2 | Sleep Quality Survey (Pre) | Participant | Survey | |
| 3 | Test Anxiety Survey (Pre) | Participant | Survey | |
| 4 | Fatigue Survey (Pre) | Participant | Survey | |
| 5 | Resting HRV Baseline (5 min) | RA | RA Action | |
| 6 | Exam 2 — Start Time | RA | Timestamp | |
| 7 | Exam 2 — End Time | RA | Timestamp | |
| 8 | Fatigue Survey (Post) | Participant | Survey | |
| 9 | Compensation Recorded | RA | RA Action | |

---

## 🛠 Customization

To change the admin password, survey URLs, step order, or group names, edit `app.js` at the top — all config is in the first ~50 lines.

---

*CF Study Portal · Built for Purdue University*
