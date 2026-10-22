# Changelog

## 2.3.0 (2026-10-21)

- Second opinion rating: Glicko-2 (glicko2 1.2.2, MIT) replayed over every fight in Corner's history in monthly rating periods, so a fighter's rating deviation grows while he is out. Shown beside Corner's number on the Matchup and Card tabs with a High, Medium or Low confidence badge. Corner's own forecast is unchanged.
- New Settings tab: the two RD cutoffs for the badge (defaults 140 and 200), and an optional OpenSkill comparison (openskill 5.0.1, MIT, loaded from the CDN only when ticked).
- Send to War Room: new projection fields glicko2_prob_win, glicko2_confidence, glicko2_rd, glicko2_opponent_rd, and openskill_prob_win when the comparison is on. New model_config.second_opinion block. Contract 1.0 is unchanged.
- The fight list used for the replay is kept in the fit cache, so the first load after this update refits once.
- Service worker caches the pinned CDN libraries so the second opinion works offline.
