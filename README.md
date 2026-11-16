# Corner Model

UFC fight forecasting. Runs entirely in the browser, no server and no Python. On
load it fetches fight results, fighter attributes, and event dates from the
ufcstats mirror, refits skill ratings across every UFC fight since 1994, and
predicts any matchup you pick.

## Deploy to Netlify

Drag the `deploy` folder, and only that folder, onto the drop zone at
https://app.netlify.com/drop

No build step, no environment variables. The page loads two pinned, MIT licensed libraries from jsDelivr (glicko2 1.2.2, and openskill 5.0.1 only when ticked in Settings); without them everything else still works. Bump `MODEL_VERSION`
in `index.html` and `APP_VERSION` in `sw.js` together on every deploy, or the old
shell keeps being served, and add a dated line to `CHANGELOG.md`.

## What is in here

The `deploy` folder holds only what the live site needs:

| file | purpose |
|---|---|
| `index.html` | the app, model included |
| `sw.js` | service worker, offline shell |
| `manifest.webmanifest` | installable app metadata |
| `icon.png` | app icon |
| `netlify.toml` | publish config and cache headers |

Everything else is never deployed:

| path | purpose |
|---|---|
| `docs/send-to-war-room-prompt.md` | the brief for the Send to War Room button |
| `docs/warroom-import-1.0.schema.json` | the War Room import contract |
| `docs/war-room-export-report.md` | what the export sends, what it cannot, and the test results |
| `docs/sample-payload-corner_ufc-2026-09-26.json` | a full sample payload (real fighters and model numbers, made up card and prices) |
| `test/` | the acceptance suite, frozen ufcstats files and fixtures |
| `tools/refit.mjs` | scores the model walk forward on the frozen data, and refits it |

## Tests

```
npm install
npx playwright install chromium   # once, for the browser handoff tests
npm test
```

The suite needs no network: the four ufcstats files, the Odds API response,
the glicko2 library and a copy of the 2.1.0 app (`test/fixtures/original-2.1.0.html`,
for the request comparison) are all in the repo, so it passes from a fresh clone.

The suite boots the app in jsdom on frozen copies of the four ufcstats files
with a frozen clock (2026-09-23 19:00 UTC) and a made up Odds API response, and:

1. snapshots every displayed line in every tab, with and without prices, on a
   fresh and a restored cache, and compares it to `test/baseline/2.4.0.json`.
   2.4 changed the forecasts on purpose, so that is the reference now;
   `test/baseline/before.json` is the 2.1.0 app, kept for the record. After a
   deliberate change, run `npm run snapshot` and copy `test/out/after.json`
   over the baseline;
2. checks the War Room payload against the contract schema, the War Room's own
   import pipeline (when `../war-room` is checked out next door), and the Card
   tab it came from;
3. runs the handoff in real Chromium across three local origins;
4. checks every 2.4 change (`test/v24.test.mjs`), including that
   `tools/refit.mjs` still reproduces the numbers quoted below.

`node test/make-fixtures.mjs` rebuilds the Odds API and disagreement log
fixtures from the frozen data; the committed ones are what the baseline used.

## Send to War Room

The Card tab has a **Send to War Room** button. Pick a card date, check the
label (it defaults to `UFC <date>`), untick any fight from another promotion,
and press it. Both fighters of every ticked fight Corner rates on that date, and
that has not started, go to The War Room as one import (contract 1.0): Corner's
probability, the Card's best price and book with the pull time, and the Card's
warnings as flags. Fighters are named as in ufcstats, with the ufcstats fighter
id, not with the Odds API spelling.

The export opens the War Room receiver in a new tab and hands the file over,
only to the receiver's exact origin and only after that tab says it is ready.
If the tab is blocked or does not answer within 60 seconds, **Copy JSON** and
**Download JSON** give the same file to import by hand. The receiver address is
under Receiver and defaults to
`https://lighthearted-kringle-dafe7e.netlify.app/import/receive`.

The export only reads the model and changes no number the app shows. For the
War Room to accept the handoff, this site's domain must be listed in
`handoff_allowed_origins` in War Room Settings. Details are in
`docs/war-room-export-report.md`.

## Why a matchup picker instead of a slate

The NFL app shows an upcoming week because the schedule is published months in
advance. The UFC source data contains only completed fights, and cards are
announced irregularly, so a fixed slate view would be empty most of the time.
The matchup picker is the right shape for the sport: you already know who is
fighting, and the model answers for any pairing you name.

## The five tabs

Every forecast opens with a **Pick**: one line naming the expected winner, how
strong a favorite (toss-up below 55%, lean, clear, strong from 72%), and where
the number comes from. On a fight the betting market has priced, the pick is the
market's favorite, because in the side by side test below the market picked more
winners than Corner; Corner's own number sits beside it with "Corner agrees" or
"Corner picks the other fighter". Without a price, the pick is Corner's.

**Matchup.** Pick a red corner and a blue corner. You get a win probability, a
breakdown of what is driving it, and the fight counts, ages, and reaches behind
it. The driver bars decompose the prediction into skill rating, age, reach, ring
rust, and stance, each in logit points, so you can see which factor is carrying
the call rather than trusting a bare number.

**Rankings.** The model's rating for every active fighter with three or more UFC
fights, by division. Rating is skill in logit points relative to an average
fighter. The certainty column reflects how much the model has actually seen,
which falls during long layoffs and on a weight class change.

**Recent.** Every fight from roughly the last year scored against what the model
said beforehand, so the app grades itself rather than asking you to trust a
backtest.

**Card.** The upcoming card from The Odds API (free key), fights first, each with
its pick, Corner's number, the market's no-vig number, Glicko-2, and the best
price at your books. Below: Send to War Room, the key and books, and the running
test of whether Corner sees anything before the market does. A fighter the data
has never seen is rated as a debut instead of being skipped, and says so.

**Settings.** The second opinion cutoffs, and a backup of the disagreement log:
Export writes it to a file, Import merges a file back in, and "Keep it on this
device" asks the browser not to clear it.

## The uncertainty machinery, and why it is the point

The median UFC fighter has four career fights. A point estimate from four
observations is mostly noise, so the model carries a variance next to every
rating and uses it twice: to size each update, and to pull the predicted
probability toward even when either fighter is poorly known.

You can see this working. Jon Jones against an opponent the model has never seen
reads 82.7% raw, and the app reports 67.6% after accounting for knowing nothing
about the opponent. When a thin record is involved the app says so explicitly and
shows both numbers. That is the opposite of what most fight models do, which is
state a confident number for a debutant and never mention the sample size.

## The leakage guard

In the raw source file the first-listed fighter wins 64.00% of the time. That is
a writing convention in how UFCStats formats the bout string, not information.
Every fight is reoriented alphabetically by fighter name, which is independent of
the outcome, and the resulting base rate is 49.82%. Any model fed the raw ordering
would inherit 64% accuracy for free and learn nothing. This is the easiest way to
build a fight model that looks excellent and predicts nothing.

## Honest performance

Tested on 2,754 fights against closing moneylines (the 2.0 evaluation, in the
Python project):

| | log loss | accuracy | AUC |
|---|---|---|---|
| this model | 0.66233 | 61.29% | 0.6546 |
| market close | 0.60001 | 67.79% | 0.7408 |

The model has real predictive ability. AUC 0.6546 with a confidence interval of
[0.6353, 0.6731] is nowhere near chance, it beats a career-record baseline at
p = 3.8e-06, and it independently recovered the age decline curve, the southpaw
advantage, and ring rust from fight outcomes alone.

It is also clearly worse than the closing line, and when you condition on the
market the model adds no significant information (p = 0.084).

**Use it as a forecaster. It does not beat the book.** Both statements are
supported by the numbers above and they are not in conflict.

Walk forward on the frozen data in this repo, fitted on fights before 2022 and
scored on the 2,435 since, by `node tools/refit.mjs`:

| | winners picked | log loss | AUC |
|---|---|---|---|
| 2.3.0 | 61.36% | 0.64677 | 0.6703 |
| 2.4.0 | 62.79% | 0.64201 | 0.6791 |
| 2.4.0, fights with a debutant | 58.15% | 0.65766 | 0.6399 |

## Updating

The upstream data refreshes daily from ufcstats.com. The app caches for six hours,
then re-pulls and rebuilds ratings from scratch in roughly 60 ms. Nothing to
maintain.

To retune after more fights accumulate, copy the four current ufcstats CSV files
into a folder and run `node tools/refit.mjs --fit --data <folder>`. It fits only
on fights before the split (`--split`, default 2022-01-01), prints the scores
before and after, and prints the values to paste into `index.html`: `b_age` in
`P`, `STAT_DECAY`, and the `FB` coefficients. The other rating parameters still
come from the Python reference.


---

## Verification

The app runs in a real DOM (jsdom) and in real Chromium, not just a syntax
check. Every tab is clicked and every render path runs. Run `npm test` after any
change; the Tests section above lists what it checks.

## Storage

Cached data lives in IndexedDB, with localStorage as a fallback only if IndexedDB
is unavailable. An earlier version used localStorage alone, which put a multi-MB
payload against a 5MB browser ceiling. A quota failure there would have silently
forced a full re-download on every open.

## Fighter search

The picker is a filtered search box, not a dropdown. An earlier version used a
native select holding roughly a thousand active fighters, which rendered 94KB of
DOM and was unusable on a phone. The search version renders 3KB and each result
row shows fight count and division so same-name fighters can be told apart.

Since 2.4 it searches every fighter with a UFC fight and every ufcstats profile
with none yet (rated as a debut), about 4,600 names, still showing at most 60
rows. Active fighters list first, then likely debutants, then former fighters.
Accents and case are ignored.

Keyboard support: arrow keys to move, Enter to pick, Escape to close.

## Recent tab

An earlier version showed the model's hit rate next to "67.8% market, for
reference." Those two numbers were computed on different sets of fights, which
made the comparison meaningless. It has been replaced with a calibration check
comparing what the model claimed against what happened, on the same fights. Live
closing prices are not in this data set, so no market number appears here at all.

## Second opinion rating (2.3)

A Glicko-2 rating of wins and losses only, shown beside Corner's number and never
feeding it. Every fight is replayed in date order in monthly rating periods, so a
fighter who is not fighting gets a larger rating deviation (RD). The win
probability is the Glicko-2 expected score using both RDs. The confidence badge
comes from the larger RD of the two fighters, against two cutoffs in Settings
(defaults: High at 140 or below, Low above 200, measured on active fighters whose
RDs run from about 115 to 210). The Send to War Room export carries
`glicko2_prob_win`, `glicko2_confidence`, `glicko2_rd` and `glicko2_opponent_rd`
in each record's `model.projection`, plus `openskill_prob_win` when the OpenSkill
comparison is on. Run `node test/second-opinion.test.mjs` for its checks.

Since 2.4 the Matchup line says what a disagreement has meant, counted in the
replay on every fight since 2022 with each forecast made before the fight: when
Glicko-2 and Corner disagreed, Corner still picked the winner in 59% of 794
fights (65% of 1,641 when they agreed). A disagreement is a reason to look
closer, not a reversal.

## Weight classes and shared names (2.4)

ufcstats spells one class many ways ("UFC Interim Heavyweight Title Bout",
"Ultimate Fighter 28 Heavyweight Tournament"). Each spelling used to be its own
division, so a title fight counted as a weight class move and champions were
filed under "Interim Heavyweight". Every label now maps to its class; catch
weight and open weight are no division at all.

Eight names in ufcstats belong to two fighters. Each fight is matched to the
profile whose weight is that fight's class limit. Bruno Silva is now two
fighters, "Bruno Silva (Flyweight)" and "Bruno Silva (Middleweight)", and Jean
Silva, Mike Davis, Michael McDonald and Victor Valenzuela take the right
birthday and reach. The War Room export sends the ufcstats name with the
resolved fighter id.
