-- Seeds one keeper profile with the sample season used by the prototype UI,
-- so a fresh database renders the same demo data the static build shipped with.

INSERT INTO keepers (id, name, team, level, focus_area_title, focus_area_note, next_goal)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Jordan Casey',
  'Riverside SC — U14 Elite',
  'youth',
  'Low Diving Saves',
  'Work on technique and explosiveness',
  'Increase distribution accuracy above 80%'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO matches (keeper_id, match_number, opponent, saves, shots_faced, goals_against, result, goals_scored, team_shots_on_goal, minutes_played)
VALUES
  ('00000000-0000-0000-0000-000000000001', 1,  'Northside United',   3, 6, 3, 'L 1-3', 1, 6, 70),
  ('00000000-0000-0000-0000-000000000001', 2,  'Harbor FC',          4, 6, 2, 'D 2-2', 2, 7, 70),
  ('00000000-0000-0000-0000-000000000001', 3,  'Westfield Rovers',   5, 6, 1, 'W 3-1', 3, 8, 70),
  ('00000000-0000-0000-0000-000000000001', 4,  'Lakeview SC',        4, 6, 2, 'W 2-1', 2, 7, 70),
  ('00000000-0000-0000-0000-000000000001', 5,  'Eastgate Athletic',  3, 5, 2, 'L 0-2', 0, 5, 70),
  ('00000000-0000-0000-0000-000000000001', 6,  'Summit City',        6, 7, 1, 'W 4-1', 4, 9, 70),
  ('00000000-0000-0000-0000-000000000001', 7,  'Ironbridge FC',      4, 5, 1, 'D 1-1', 1, 6, 70),
  ('00000000-0000-0000-0000-000000000001', 8,  'Redhill Rangers',    5, 5, 0, 'W 2-0', 2, 7, 70),
  ('00000000-0000-0000-0000-000000000001', 9,  'Southport Town',     4, 6, 2, 'W 3-2', 3, 8, 70),
  ('00000000-0000-0000-0000-000000000001', 10, 'River City FC',      5, 7, 0, 'W 1-0', 1, 9, 70)
ON CONFLICT (keeper_id, match_number) DO NOTHING;
