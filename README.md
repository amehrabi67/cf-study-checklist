# CF Study Checklist v2
**Purdue University · Cognitive Flexibility Study**  
Real-time shared backend — no duplicate codes, all devices see the same data.

---

## Architecture

```
Your Browser (participant / RA / admin)
        ↕  fetch()
Google Apps Script Web App   ← free, no server needed
        ↕  read/write
Google Sheet "Participants"  ← single source of truth
```

Every device reads and writes to the **same Google Sheet**. Codes are generated server-side with a lock, so no two participants ever get the same code.

---

## STEP 1 — Set Up the Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a **new blank spreadsheet**
2. Name it: `CF Study Data`
3. Leave it blank — the script will create the `Participants` sheet automatically on first use

---

## STEP 2 — Deploy the Google Apps Script

1. In your Google Sheet, click **Extensions → Apps Script**
2. Delete all existing code in the editor
3. Open `Code.gs` from this repo and **paste the entire contents** into the editor
4. Click **Save** (floppy disk icon), name the project `CF Study API`
5. Click **Deploy → New deployment**
6. Click the gear icon ⚙ next to "Select type" → choose **Web app**
7. Fill in:
   - **Description:** `CF Study API v1`
   - **Execute as:** `Me`
   - **Who has access:** `Anyone`  ← important, allows the portal to call it
8. Click **Deploy**
9. Click **Authorize access** → choose your Google account → Allow
10. **Copy the Web App URL** — it looks like:
    ```
    https://script.google.com/macros/s/AKfycb.../exec
    ```

---

## STEP 3 — Configure the Frontend

1. Open `app.js` in any text editor
2. Find line 8:
   ```js
   const API_URL = 'YOUR_APPS_SCRIPT_WEB_APP_URL';
   ```
3. Replace `YOUR_APPS_SCRIPT_WEB_APP_URL` with the URL you copied in Step 2:
   ```js
   const API_URL = 'https://script.google.com/macros/s/AKfycb.../exec';
   ```
4. Optionally change the admin password on line 9:
   ```js
   const ADMIN_PASSWORD = 'CFstudy2025';
   ```

---

## STEP 4 — Deploy to GitHub Pages

1. Create a new GitHub repository: `cf-study-checklist`
2. Upload these 4 files:
   - `index.html`
   - `style.css`
   - `app.js`  ← with your API URL already filled in
   - `README.md`
3. **Make the repository Public** (required for free GitHub Pages)
4. Go to **Settings → Pages → Source: Deploy from a branch → main → / (root) → Save**
5. Wait ~2 minutes, then visit:
   ```
   https://YOUR-USERNAME.github.io/cf-study-checklist/
   ```

---

## Your Three Links

| Who | URL |
|-----|-----|
| **Participant** | `https://YOUR-USERNAME.github.io/cf-study-checklist/#participant` |
| **Data Collector (RA)** | `https://YOUR-USERNAME.github.io/cf-study-checklist/#collector` |
| **Admin / PI** | `https://YOUR-USERNAME.github.io/cf-study-checklist/#admin` |

---

## How It Works — Per Role

### Participant (`#participant`)
- Enters their CF code → portal loads from Google Sheets
- Steps are locked in order — only the current step is active
- Survey steps open a modal with the Qualtrics link (participant ID embedded in URL)
- After completing a survey, clicks **Mark as Submitted** → saved to Sheet instantly
- RA steps show "Waiting for RA" — participants cannot skip them
- Full session report downloadable as CSV

### Data Collector / RA (`#collector`)
- Enter any participant code + RA initials → loads real-time from Sheet
- Full Session 1 and Session 2 checklists visible at once
- **✓ Done** — marks RA action steps complete
- **⏱ Record Now** — stamps exact current time for exam start/end
- **✓ Submitted** — confirms participant survey completion
- **↩ Undo** — reverses any step if needed
- Notes field per step, HRV device ID, session dates/times
- **📅 Schedule** button to set session dates
- **↻ Refresh** to pull latest data from Sheet (e.g. after participant does a survey on their own device)

### Admin (`#admin`)
- Password-protected
- Stats: Enrolled, S1 Done, S2 Started, Complete
- **Group Balance bar** with warning if Review vs No Review is off by >2
- Full participant table with progress bars, status, dates, RA
- **Add Participant** — server assigns next available CF code (no duplicates)
- **Edit** any participant field
- **Drop** a participant
- **↻ Refresh** pulls latest from Sheet

---

## Cross-Device Sync

All data lives in Google Sheets — no export/import needed.

- Participant completes a survey on their phone → RA sees it instantly on their laptop (click ↻ Refresh)
- Admin adds a participant on their computer → it appears for all RAs immediately
- No duplicate CF codes — the server uses a script lock during code generation

---

## Session Step Order

### Session 1 (Day 1) — All Participants
| # | Step | Who |
|---|------|-----|
| 1 | Sleep Quality Survey (Pre) | Participant |
| 2 | Test Anxiety Survey (Pre) | Participant |
| 3 | Fatigue Survey (Pre) | Participant |
| 4 | Polar H10 Fitted & Verified | RA |
| 5 | Resting HRV Baseline (5 min) | RA |
| 6 | Exam 1 — Start Time | RA (timestamp) |
| 7 | Exam 1 — End Time | RA (timestamp) |
| 8 | Sleep Quality Survey (Post) | Participant |
| 9 | Test Anxiety Survey (Post) | Participant |
| 10 | Fatigue Survey (Post) | Participant |
| 11 | Review Materials Delivered | RA |

### Session 2 (Day 2)
| # | Step | Who | Note |
|---|------|-----|------|
| 1 | Review Text Check | Participant | **Review group only** |
| 2 | Sleep Quality Survey (Pre) | Participant | |
| 3 | Test Anxiety Survey (Pre) | Participant | |
| 4 | Fatigue Survey (Pre) | Participant | |
| 5 | Resting HRV Baseline (5 min) | RA | |
| 6 | Exam 2 — Start Time | RA (timestamp) | |
| 7 | Exam 2 — End Time | RA (timestamp) | |
| 8 | Fatigue Survey (Post) | Participant | |
| 9 | Compensation Recorded | RA | |

---

## Updating the App

If you change `app.js` or `style.css`, just push the updated file to GitHub. Pages redeploys automatically within ~2 minutes.

If you change `Code.gs` (the Apps Script), you must create a **new deployment**:  
Extensions → Apps Script → Deploy → New deployment → copy the new URL → update `app.js`.

---

## Survey Links

| Survey | URL |
|--------|-----|
| Sleep Quality | `https://purdue.ca1.qualtrics.com/jfe/form/SV_80buUCCnp3ssuEu` |
| Test Anxiety | `https://purdue.ca1.qualtrics.com/jfe/form/SV_bkGoyGnyAYnrbtY` |
| Fatigue | `https://purdue.ca1.qualtrics.com/jfe/form/SV_eD4CwmMjOpMLm3c` |
| Review Text Check | `https://purdue.ca1.qualtrics.com/jfe/form/SV_8k5vYg8glY43VIi` |

Participant ID is appended automatically: `?participant=CF001`

---

*CF Study Checklist v2 · Purdue University*
