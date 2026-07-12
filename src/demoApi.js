// Mirrors src/api.js's method shapes exactly, so App.jsx can swap between
// the two without any call-site changes. Demo mode never touches the
// network or the real database — every visitor gets the same fixed sample
// data, and nothing they do persists past a page reload.

let seq = 0;
const uid = () => `demo-${++seq}`;

const SAMPLE_MATCHES = [
  { opp: "Northside United", saves: 3, shotsFaced: 6, ga: 3, res: "L 1-3", goalsScored: 1, teamShotsOnGoal: 6, minutesPlayed: 70 },
  { opp: "Harbor FC", saves: 4, shotsFaced: 6, ga: 2, res: "D 2-2", goalsScored: 2, teamShotsOnGoal: 7, minutesPlayed: 70 },
  { opp: "Westfield Rovers", saves: 5, shotsFaced: 6, ga: 1, res: "W 3-1", goalsScored: 3, teamShotsOnGoal: 8, minutesPlayed: 70 },
  { opp: "Lakeview SC", saves: 4, shotsFaced: 6, ga: 2, res: "W 2-1", goalsScored: 2, teamShotsOnGoal: 7, minutesPlayed: 70 },
  { opp: "Eastgate Athletic", saves: 3, shotsFaced: 5, ga: 2, res: "L 0-2", goalsScored: 0, teamShotsOnGoal: 5, minutesPlayed: 70 },
  { opp: "Summit City", saves: 6, shotsFaced: 7, ga: 1, res: "W 4-1", goalsScored: 4, teamShotsOnGoal: 9, minutesPlayed: 70 },
  { opp: "Ironbridge FC", saves: 4, shotsFaced: 5, ga: 1, res: "D 1-1", goalsScored: 1, teamShotsOnGoal: 6, minutesPlayed: 70 },
  { opp: "Redhill Rangers", saves: 5, shotsFaced: 5, ga: 0, res: "W 2-0", goalsScored: 2, teamShotsOnGoal: 7, minutesPlayed: 70 },
  { opp: "Southport Town", saves: 4, shotsFaced: 6, ga: 2, res: "W 3-2", goalsScored: 3, teamShotsOnGoal: 8, minutesPlayed: 70 },
  { opp: "River City FC", saves: 5, shotsFaced: 7, ga: 0, res: "W 1-0", goalsScored: 1, teamShotsOnGoal: 9, minutesPlayed: 70 },
];

const detailDefaults = { distributionCompleted: 0, distributionAttempted: 0, claims: 0, punches: 0, penaltySaves: 0, bigSaves: 0, errors: 0, notes: null };

// Fresh state per call, so re-entering Demo App always starts clean.
export function createDemoApi() {
  const keeperId = uid();
  let keepers = [
    {
      id: keeperId,
      name: "Jordan Casey",
      team: "Riverside SC — U14 Elite",
      level: "youth",
      focusArea: { title: "Low Diving Saves", note: "Work on technique and explosiveness" },
      nextGoal: "Increase distribution accuracy above 80%",
      showGMIS: true,
      notifPrefs: { matchReminders: true, weeklySummary: false },
    },
  ];
  let matchesByKeeper = {
    [keeperId]: SAMPLE_MATCHES.map((m, i) => ({ id: uid(), n: i + 1, ...detailDefaults, ...m })),
  };
  let fixturesByKeeper = { [keeperId]: [] };

  return {
    listKeepers: async () => keepers,

    createKeeper: async (k) => {
      const keeper = { id: uid(), focusArea: null, nextGoal: null, showGMIS: true, notifPrefs: { matchReminders: true, weeklySummary: false }, ...k };
      keepers = [...keepers, keeper];
      matchesByKeeper[keeper.id] = [];
      fixturesByKeeper[keeper.id] = [];
      return keeper;
    },

    updateKeeper: async (id, patch) => {
      keepers = keepers.map((k) => (k.id === id ? { ...k, ...patch } : k));
      return keepers.find((k) => k.id === id);
    },

    deleteKeeper: async (id) => {
      keepers = keepers.filter((k) => k.id !== id);
      delete matchesByKeeper[id];
      delete fixturesByKeeper[id];
      return null;
    },

    listMatches: async (keeperId) => matchesByKeeper[keeperId] || [],

    createMatch: async (keeperId, m) => {
      const existing = matchesByKeeper[keeperId] || [];
      const n = (existing[existing.length - 1]?.n || 0) + 1;
      const record = { id: uid(), n, ...detailDefaults, ...m };
      matchesByKeeper[keeperId] = [...existing, record];
      return record;
    },

    updateMatch: async (keeperId, matchId, patch) => {
      matchesByKeeper[keeperId] = (matchesByKeeper[keeperId] || []).map((m) => (m.id === matchId ? { ...m, ...patch } : m));
      return matchesByKeeper[keeperId].find((m) => m.id === matchId);
    },

    deleteMatch: async (keeperId, matchId) => {
      matchesByKeeper[keeperId] = (matchesByKeeper[keeperId] || []).filter((m) => m.id !== matchId);
      return null;
    },

    listFixtures: async (keeperId) => fixturesByKeeper[keeperId] || [],

    importFixtures: async (keeperId, items) => {
      const created = items.filter((i) => i?.opponent).map((i) => ({ id: uid(), opponent: i.opponent, date: i.date ?? null }));
      fixturesByKeeper[keeperId] = [...(fixturesByKeeper[keeperId] || []), ...created];
      return created;
    },

    deleteFixture: async (keeperId, fixtureId) => {
      fixturesByKeeper[keeperId] = (fixturesByKeeper[keeperId] || []).filter((f) => f.id !== fixtureId);
      return null;
    },

    // No real storage in demo mode — just a local object URL for this tab's session.
    uploadKeeperPhoto: async (keeperId, file) => URL.createObjectURL(file),
  };
}
