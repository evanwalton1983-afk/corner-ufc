# Changelog

## 2.4.0 (2026-11-16)

- A pick on every forecast: one line naming the expected winner and how strong a favorite. On a priced fight it is the market's favorite, with "Corner agrees" or "Corner picks" the other fighter beside it; otherwise it is Corner's.
- Card tab: the fights come first, with a summary of how often Corner agrees with the market. Send to War Room, the Odds API key and the market test follow below.
- Debutants are rated instead of skipped: in the Matchup picker (any ufcstats profile with no UFC fight), and on the Card, where a name ufcstats does not know at all, against a UFC veteran, is rated as a debut and says so. New War Room flags: debut, no_ufcstats_profile.
- The picker searches every rated fighter (about 4,600 names), active fighters first, accents ignored. It used to list only the 861 active in the last thirty months.
- Fix: weight class labels map to their class. Title and tournament bouts no longer count as a weight class move, champions are no longer filed under "Interim Heavyweight", and catch weight is no division. Rankings now offers only real divisions.
- Fix: names two fighters share. Bruno Silva is split into the flyweight and the middleweight; Jean Silva, Mike Davis, Michael McDonald and Victor Valenzuela get their own birthday and reach (Jean Silva had been aged 48). The War Room export sends their fighter ids.
- Model refit on fights before 2022: age penalty 0.0894 to 0.1301 a year past 28.4, and the twelve statistical coefficients. Since 2022: 62.79% of winners picked against 61.36%, log loss 0.64201 against 0.64677 (z 3.67 paired). Recency weighting was tested and left off. Every forecast number changes.
- Second opinion: instead of a bold "picks the other fighter", the Matchup says how Corner has done since 2022 when the two agreed and when they did not.
- Settings: export and import the disagreement log, and ask the browser to keep it.
- tools/refit.mjs: scores the model walk forward on the frozen data and refits it. The test suite now passes from a fresh clone with no network; the 2.4.0 snapshot is the new baseline.

## 2.3.0 (2026-10-21)

- Second opinion rating: Glicko-2 (glicko2 1.2.2, MIT) replayed over every fight in Corner's history in monthly rating periods, so a fighter's rating deviation grows while he is out. Shown beside Corner's number on the Matchup and Card tabs with a High, Medium or Low confidence badge. Corner's own forecast is unchanged.
- New Settings tab: the two RD cutoffs for the badge (defaults 140 and 200), and an optional OpenSkill comparison (openskill 5.0.1, MIT, loaded from the CDN only when ticked).
- Send to War Room: new projection fields glicko2_prob_win, glicko2_confidence, glicko2_rd, glicko2_opponent_rd, and openskill_prob_win when the comparison is on. New model_config.second_opinion block. Contract 1.0 is unchanged.
- The fight list used for the replay is kept in the fit cache, so the first load after this update refits once.
- Service worker caches the pinned CDN libraries so the second opinion works offline.
