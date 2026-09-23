# Corner UFC: Send to War Room report

App version 2.2.0 (was 2.1.0). Contract `warroom.import` 1.0. The attached schema is identical to the one committed in the War Room repo, so nothing in the contract changed.

Sample: [sample-payload-corner_ufc-2026-09-26.json](sample-payload-corner_ufc-2026-09-26.json). It covers the 2026-09-26 card as of 2026-09-23 19:00 UTC: 22 records for 11 fights.

- **Real in the sample:** fighter names, ufcstats ids and every model number. They come from the ufcstats files, saved on 2026-09-23 (data through UFC 331, 2026-09-19).
- **Made up for the test:** the card itself and the prices. The pairings and dates come from a fake Odds API response, built on real fighters to cover every case below. No price in the sample is a real market price.

## Where the button is

The button is on the **Card tab**, in a panel above the Odds API key box:

- **Send to War Room**, with **Copy JSON** and **Download JSON** beside it.
- **Card date**: each Eastern date with at least one rated fight still to come. It defaults to the next one.
- **Label**: defaults to `UFC <date>`, for example `UFC 2026-09-26`. You can edit it. The edit is kept per date while the app is open, including across price refreshes.
- **A checkbox per fight**, all ticked by default. Untick fights from other promotions: The Odds API's MMA feed has no promotion field, so Corner cannot tell a PFL fight between two ex-UFC fighters from a UFC one.
  - When the Odds API spelling differs from the ufcstats name Corner uses, the row says what will be sent, for example "Abd Al-Selwady vs Alessandro Costa, sent as Abdul-Kareem Al-Selwady vs Alessandro Costa".
- **A count line** covering ticked fights only, for example "10 fights ticked, 20 records, UFC 2026-09-26. Left out: 1 unticked, 1 not rated."
- A **Receiver** setting. It defaults to `https://lighthearted-kringle-dafe7e.netlify.app/import/receive`.

The panel is only on the Card tab. With no Odds API key there is no card, so the buttons are disabled and the panel says why.

## What the export sends

**Records.** Two moneyline records per ticked fight, one per fighter:

- `fighter_a` is the Card's left (red) fighter, `fighter_b` the right (blue).
- Only fights Corner rates on the chosen date that have not started are sent.

What is left out:

- **Fights under way or finished**, meaning the Odds API start time has passed. The Card tab keeps showing a fight for 6 hours after it starts. The export does not send it.
- **Fights with a fighter Corner cannot rate** ("Not rated" on the Card). Corner never evaluated them.

**Names.** Each fighter goes out under the ufcstats name Corner's model uses, not the Odds API spelling on the Card.

- `source_id` is the ufcstats fighter id (for example `262a7d06203657e6` from `ufcstats.com/fighter-details/262a7d06203657e6`).
- The id is read from the cached copy of `ufc_fighter_tott.csv`. That copy is already on the device, so there is no new download.
- The id is left out when the name belongs to two fighters, or is not in that file under the same spelling. See Known Corner issues below.

**Probabilities.**

- `prob_win` is Corner's number from the Card (`d.p`, or 1 minus it for the other fighter).
- `prob_push` is 0: Corner models no draws.
- `prob_loss` is 1 minus `prob_win`.
- Values are rounded to six decimals. They match the Card to the displayed tenth of a percent on every fight, and both fighters of a fight mirror exactly.

**Projection** (stored as metadata):

- `prob_before_uncertainty`: the read before the thin-record pull toward even (`pRaw`).
- `ufc_fights` and `opponent_ufc_fights`.
- `assumed_division`: the division the model priced the fight at. Corner guesses it from the fighters' last fights and never knows the real weight class, so it is not sent as `bout.weight_class`.

**Prices.**

| what the Card shows | sent as | flag |
|---|---|---|
| a best price at your books | odds, the book as shown (DK, FD, MGM, CZR, FAN and so on), that same book's price on the opponent, and `captured_at` = the time of the Odds API pull | none |
| best price n/a (no selected book prices that fighter) | no price block | `no_price_in_app` |

- If the book with the best price posts only one side, `opposite_american_odds` is null: 1 of 18 priced records in the sample.
- If a refresh fails, the Card shows the last good pull, and `captured_at` is that pull's time.

**Event.**

- `source_event_id` is the Odds API event id.
- `start_time` is the Eastern date at `T00:00:00Z`, with `start_time_precision: "date"` and `timezone: "America/New_York"`.
- A fight starting at 01:00 UTC on Sunday is on Saturday's card. That matches how ufcstats dates cards.
- No `venue`, `neutral_site` or `bout` block: Corner knows none of them.

**Grouping.** `{"type": "card", "label": "<label>"}`.

**Batch.**

- `model_name`: "Corner UFC".
- `model_version`: 2.2.0.
- `source_batch_id`: `corner_ufc-2026-UFC 2026-09-26-20260923T190000Z`.
- `generated_at`: when the first of Send, Copy or Download was pressed for this card state. It is reused so all three carry identical JSON, and it changes when the fights, prices, label or ticks change.

**model_config** (read, never written):

- the rating parameters `P`
- the feature coefficients `FB`
- the shrinkage constants and `SCALE`
- the fit date, the data-through date and the number of fighters rated
- the flag thresholds (thin record under 4 fights, worth researching at a 5 point gap, layoff over 400 days)
- the price source, your selected books, the pull time and the price engine version

The Odds API key is never included, and a test checks that.

## Flags

Every flag except `no_price_in_app` is fight level, so both fighters carry it.

| flag | when | in the sample |
|---|---|---|
| `weight_class_move` | either fighter's last division differs from the assumed one: the move the model penalises | 8 |
| `thin_record` | either fighter has fewer than 4 UFC fights (the Card's "thin record" pill) | 4 |
| `worth_researching` | Corner and the no-vig market differ by 5 points or more (the Card's pill) | 4 |
| `no_price_in_app` | that fighter shows best price n/a | 4 |
| `layoff` | either fighter idle more than 400 days on fight day. That is the app's own "days idle" threshold on the Rankings tab. The model docks ring rust after 0.75 years and widens its uncertainty after 0.5 years. | 2 |
| `name_matched_loosely` | Corner matched an Odds API name by last name plus first initial, not exactly. An accent or case difference is an exact match and gets no flag. | 2 |

`thin_record`, `layoff`, `weight_class_move`, `worth_researching` and `no_price_in_app` are already in the War Room's Corner profile. `name_matched_loosely` is new to it.

## Contract fields the app cannot supply

| field | why |
|---|---|
| `bout.weight_class` | Corner infers the division from the fighters' last fights. You chose not to send a guess; it is in `projection.assumed_division`. |
| `bout.scheduled_rounds`, `card_position`, `bout_order`, `title_fight` | Corner has no card listing. The Odds API feed gives only the two names and a start time. |
| `event.start_time` as an exact time | Sent as a date, because the Odds API start time for MMA is often the card's start, not the bout's. The War Room fills the exact time from odds data. |
| `event.timezone` outside the Eastern time zone | No venue, so every fight says `America/New_York`. |
| `event.venue`, `neutral_site` | Not known. |
| `model.fair_line`, `confidence`, `edge_supplied` | Corner shows no fair price or confidence score. The gap to the market is a flag, and the War Room computes edge itself. |
| the `short_notice_opponent` flag | The War Room profile lists it, but Corner has no notion of short notice. |
| `captured_at` per book | One time per pull, not each book's own update time. |
| `participants[].source_id` for 24 of the 2,752 fighters Corner rates | See Known Corner issues. |

## Test results

Run with `npm test`. Everything below passed on the frozen data and clock (2026-09-23 19:00 UTC).

**Before and after.** Every displayed line was compared: several Matchup pairings (swapped, with a later date, with a forced division), Rankings for every division, Recent, Card and the footer. The comparison ran with no key and with live prices, each on a fresh cache and a restored one.

| run | lines | numbers | result |
|---|---|---|---|
| no key, fresh cache | 4,186 | 3,388 | identical |
| no key, restored cache | 4,186 | 3,388 | identical |
| live prices, fresh cache | 4,232 | 3,510 | identical |
| live prices, restored cache | 4,232 | 3,510 | identical |

That is 16,836 lines and 13,796 numbers. The only difference is the footer's "Model 2.1.0" becoming "Model 2.2.0", as expected. There were zero JS errors before and after.

**Payload (jsdom), 179 checks.**

- **Schema:** ajv, draft 2020-12, passes.
- **Card match:** record count is 2 × the rated fights on the Card; probabilities and prices match what the Card displays.
- **Flags and names:** flags by case; `source_id` against the ufcstats file for every fighter.
- **Card state:**
  - unticking a fight and editing the label (both survive a Card re-render)
  - the second card date
  - a card half under way: with the clock at 23:30 UTC on fight night, the 6 started fights are left out and 5 are sent
  - no key: buttons disabled with a note
- **Safety:** no key in the payload, same network requests as 2.1.0, no dashes.
- **War Room pipeline**, run offline:
  - with the registry as shipped: 22 records, 0 errors, 0 warnings, all `needs_match` (no UFC fighters seeded yet)
  - with UFC fighters seeded from the ufcstats fighter file: all 22 resolve by exact name
- **Bad payloads:** seven are refused by the app before sending. The War Room itself would accept two of them: a price with no book (it drops the odds) and no price with no flag.

**Handoff (real Chromium), 47 checks.**

- The right origin gets exactly one payload, byte for byte the built JSON, and the app shows "Sent 22 records."
- Untick and relabel in the real UI, then send: 20 records carrying the new label.
- A tab that ends up on the wrong origin gets nothing.
- No answer within 60 seconds shows the fallbacks.
- Copy JSON and Download JSON equal the handoff. The file name is `warroom-corner_ufc-ufc-2026-09-26-<timestamp>.json`.
- Requests go only to the app, the receiver, GitHub raw and the Odds API.
- Zero JS errors and no sideways scroll at 1280px and 390px.
- The service worker cache is `corner-2.2.0`.

## Known Corner issues (not changed here)

1. **8 fighter names in ufcstats belong to two different fighters each:** Anthony Figueroa, Bruno Silva, Jean Silva, Joey Gomez, Michael McDonald, Mike Davis, Tony Johnson, Victor Valenzuela.
   - Corner keys fighters by name, so each pair shares one rating. Bruno Silva, for example, carries 22 fights from two careers.
   - 6 of the 8 appear among the fighters Corner rates. Mike Davis, Bruno Silva, Jean Silva and Victor Valenzuela are active.
   - Their predictions come from the merged record. The export sends them with no `source_id`, since it cannot say which fighter is meant.
   - This needs a separate fix: key the model by ufcstats fighter id instead of name. That is a model change, so it was left alone.
2. **18 names Corner rates are spelled differently, or missing, in the ufcstats fighter file.** Corner takes names from the bout results. The fighter file sometimes spells them differently:
   - "Waldo Cortes Acosta" there is "Waldo Cortes-Acosta"
   - "Rafael Cerquiera" there is "Rafael Cerqueira"
   - "Michael Aswell Jr." there is "Michael Aswell"
   - some, like "Shem Rock", are not in the fighter file at all

   These fighters go out with no `source_id`. They would also miss an exact-name match if the War Room is seeded from the fighter file alone. Seeding from the names in `ufc_fight_results.csv`, or adding these as aliases, would close the gap.

## After deploying

- **Deploy the `deploy` folder only.** Drag it onto https://app.netlify.com/drop.
- **The first open after the deploy rebuilds ratings once** from the cached data, because the fit cache key includes the version. The numbers are the same and the footer says "rebuilt" that once.
- **Allow the new domain.** Add Corner's Netlify domain to `handoff_allowed_origins` in War Room Settings, or the receiver discards the handoff.
