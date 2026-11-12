# The Arcade

Station-rotation game tracker for the Play and Learn club (Satriwithaya EP). Students play table games 1 v 1, move round the stations on a timer, answer three quick English questions after each game, and finish on a podium.

- Student console: https://pegasus028.github.io/arcade/
- Leaderboard console (teacher, projector): https://pegasus028.github.io/arcade/leaderboard

## How a session runs

1. **Set-up tab** on the leaderboard console: choose the club date (Fridays from 13 Nov 2026; 20 Nov is a holiday), press **New session**, check the timers and tick the stations that are in the room.
2. Students open the student console and choose their name. A new student types her name once; it is then in the list every week. The app puts each student in Group A or Group B at random (even numbers in each).
3. **Start session.** One station is opened for every two students. Everyone gets one "moving" period to reach her first station.
4. Each round: **play** (default 5:00) → buzzer → **move** (default 1:00). In the moving minute each student sends her result (I won / Tie / I lost), answers 3 questions about the game she just played (very easy, easy, medium; 2 points each) and walks to her next station.
5. Group A moves **up** the station numbers (1, 2, 3 …), Group B moves **down** (… 3, 2, 1), so opponents change every round.
6. When no further full round fits in the session time (default 40 min), or when you press **End session & podium**, the podium opens and the session is saved to the all-time totals.

### Points

Win 10 · tie 5 each · loss 0 · each question 2 · no opponent this round (odd number of students) 5. The teacher can add or take away a point in Set-up → Players today.

### When the winner is not clear

The student taps "Ask the teacher to decide". The game appears under **Needs your call** on the leaderboard console with three buttons (first student, Tie, second student). The same list shows results that do not agree (both said "I won") and games where nobody sent a result.

### Things the rotation does for you

- With an even number of stations, plain up/down would bring the same two students together again half-way round, so Group B steps one extra station at that point. No student meets the same opponent twice until she has met everyone in the other group.
- A late student joins from the next round. If every station is full the app opens one more.
- A student removed in Set-up keeps her points and leaves the rotation from the next round.

## Teacher passcode

The controls ask for a passcode once per computer. It starts as `arcade2026`; change it in Set-up → Passcode. Anyone can view the board; only the passcode can change anything.

## Files

| File | What it is |
|---|---|
| `index.html` | student console |
| `leaderboard.html` | leaderboard console: live board, timers, podium, music, all-time totals, past matchups, set-up |
| `config.js` | backend address, club dates and holidays, the 15 stations in table order |
| `questions.js` | question bank, built from `q/*.json` (do not edit by hand) |
| `q/<game>.json` | 15 questions per game: 5 very easy, 5 easy, 5 medium |
| `apps-script/Code.gs` | Google Apps Script backend (no Sheet: data is kept in Script Properties) |
| `tools/` | question checker and builder, mock backend, tests |

### Editing

- **Holiday or new term:** edit `window.CLUB` in `config.js`.
- **Station order or names:** edit `window.STATIONS` in `config.js`. Keep each `id`; keep 15 entries (the backend counts 15).
- **Questions:** edit `q/<game>.json`, then run `node tools/validate-q.js` and `node tools/build-questions.js`, and raise the `?v=` on `questions.js` in `index.html`.
- **Backend:** after any change to `apps-script/Code.gs`, paste it into the Apps Script project and deploy a new version of the same deployment.

### Tests

```
node tools/test-backend.js      # rotation for 4–30 students, timers, scoring, history
node tools/test-e2e.js          # a whole session in real browsers against the mock backend (needs Playwright)
```

## Music and sounds

Made in the browser with the Web Audio API (no audio files): an original relaxed loop during game time, faster with a ticking clock in the last 30 seconds, a buzzer when the time ends and a chime when the next game begins. Sound plays from the leaderboard console only and needs one click on the page after it loads.
