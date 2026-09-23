# Corner Model

UFC fight forecasting. Runs entirely in the browser, no server and no Python. On
load it fetches fight results, fighter attributes, and event dates from the
ufcstats mirror, refits skill ratings across every UFC fight since 1994, and
predicts any matchup you pick.

## Deploy to Netlify

Drag this whole folder onto the drop zone at https://app.netlify.com/drop

No build step, no environment variables, no dependencies.

## What is in here

| file | purpose |
|---|---|
| `index.html` | the app, model included |
| `sw.js` | service worker, offline shell |
| `manifest.webmanifest` | installable app metadata |
| `icon.png` | app icon |
| `netlify.toml` | publish config and cache headers |

## Why a matchup picker instead of a slate

The NFL app shows an upcoming week because the schedule is published months in
advance. The UFC source data contains only completed fights, and cards are
announced irregularly, so a fixed slate view would be empty most of the time.
The matchup picker is the right shape for the sport: you already know who is
fighting, and the model answers for any pairing you name.

## The three tabs

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

Tested on 2,754 fights against closing moneylines:

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

## Updating

The upstream data refreshes daily from ufcstats.com. The app caches for six hours,
then re-pulls and rebuilds ratings from scratch in roughly 60 ms. Nothing to
maintain.

To retune hyperparameters after more fights accumulate, run `ufc_eval.py` in the
Python project and paste the new values into the `P` object near the top of the
script block in `index.html`.


---

## Verification

Both apps are executed in a real DOM (jsdom) as part of the build, not just
syntax-checked. Every tab is clicked, every render path runs, and the suite
asserts:

- all tabs render non-empty content with zero runtime errors
- the model reproduces the Python reference exactly
- a renamed upstream column produces a loud, accurate error rather than silent
  nulls and confident nonsense
- interactive paths work end to end (search, select, expand, sort, week stepping)

Run `node render_test.js` and `node interact_test.js` from the project root after
any change.

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

Keyboard support: arrow keys to move, Enter to pick, Escape to close.

## Recent tab

An earlier version showed the model's hit rate next to "67.8% market, for
reference." Those two numbers were computed on different sets of fights, which
made the comparison meaningless. It has been replaced with a calibration check
comparing what the model claimed against what happened, on the same fights. Live
closing prices are not in this data set, so no market number appears here at all.
