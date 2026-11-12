/* Arcade — shared settings for the student console and the leaderboard console. */

/* Apps Script Web App /exec URL */
window.API_URL = "PASTE_APPS_SCRIPT_EXEC_URL";

/* Club dates: every Friday from `first` to `last`, minus the holidays. Add a holiday as 'YYYY-MM-DD'. */
window.CLUB = { first: "2026-11-13", last: "2027-02-26", holidays: ["2026-11-20"] };

/* Game stations in table order (Station 1 first). The app opens as many as it needs: one for every two students.
   Order alternates lively and quiet games and keeps look-alike games apart. Do not change an `id`:
   the question bank is keyed on it. The backend expects 15 stations. */
window.STATIONS = [
  { id: "fussball",     name: "mini fussball" },
  { id: "spotit",       name: "Spot it" },
  { id: "jenga",        name: "Jenga" },
  { id: "chess",        name: "chess" },
  { id: "hippos",       name: "hungry hippos" },
  { id: "uno",          name: "Uno mercy" },
  { id: "pool",         name: "table pool" },
  { id: "scrabble",     name: "scrabble" },
  { id: "slingpuck",    name: "sling puck game" },
  { id: "dice",         name: "4 way dice countdown game" },
  { id: "crocodile",    name: "crocodile teeth game" },
  { id: "dobble",       name: "Dobble HP" },
  { id: "basketball",   name: "table basketball" },
  { id: "mathscrabble", name: "math scrabble" },
  { id: "sudoku",       name: "table sudoku" }
];
