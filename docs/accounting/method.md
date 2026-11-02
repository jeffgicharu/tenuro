# Lease accounting method

This is how Tenuro calculates lessee lease accounting under IFRS 16, with ASC 842 as a second standard. The code is in `packages/ledger`. It is a pure calculation package: no database, no network, no clock. Every figure it produces can be reproduced from the lease's inputs alone.

## What goes in

| Input | Notes |
|---|---|
| Commencement date | Period 1 starts on this date. Later periods start on the same day of the month, clamped to month end (31 January, then 28 February, then 31 March). |
| Frequency | Monthly, quarterly or annual. |
| Timing | In advance (paid on the first day of each period) or in arrears (paid on the last day). |
| Lease term | In periods, after options are assessed. `effectiveTerm()` applies the rules below. |
| Rent | Fixed, fixed escalation (compounding uplift each year), index-linked, stepped (including rent-free steps), or an explicit list. |
| Additional payments | Residual value guarantees, purchase option prices and termination penalties, each in a given period. |
| Discount rate | The rate implicit in the lease if known, otherwise the incremental borrowing rate, as an effective annual rate. |
| Initial direct costs, incentives received, prepayments, restoration | Amounts added to or taken from the right-of-use asset at commencement. |
| Useful life, ownership transfer | Decide the depreciation period. |
| Standard | `IFRS16`, `ASC842_FINANCE` or `ASC842_OPERATING`. |
| Exemption | Short-term or low-value (IFRS 16.5–8; ASC 842-20-25-2). |

## Lease term

The term is the non-cancellable period, plus periods covered by an option to extend that the lessee is reasonably certain to exercise, plus periods covered by an option to terminate that the lessee is reasonably certain not to exercise (IFRS 16.18–19, B34–B41; ASC 842-10-30-1).

In practice `effectiveTerm()` takes the contractual term ignoring breaks and then:

- stops at the earliest break the lessee is reasonably certain to exercise, and adds no renewals after it;
- otherwise adds renewals in order, and stops at the first one that is not reasonably certain. A second renewal can only count if the first does.

The result must be a whole number of periods.

## Rates

The discount rate is an effective annual rate. The rate for one period is

> r = (1 + annual rate)^(1/k) − 1, where k is 12, 4 or 1 periods a year.

A payment due t periods from a date is discounted by (1 + r)^−t, which is the same as (1 + annual rate)^(−t/k).

All arithmetic uses decimal numbers at 34 significant digits (decimal.js), never binary floating point.

## Initial measurement (IFRS 16.26–28, 16.23–24)

**Lease liability.** The present value of the lease payments not yet paid at commencement:

- In arrears, the payment for period t falls at the end of period t, so it is discounted for t periods.
- In advance, the payment for period t falls at the start of period t, so it is discounted for t − 1 periods. The payment for period 1 is made on the commencement date, so it is already paid. It is **not** part of the liability; it goes into the right-of-use asset instead.

Index-linked rent is measured at the index in force at commencement. Future inflation is not forecast (IFRS 16.27(b), 16.28; ASC 842-10-30-5(b)). When the index moves, the liability is remeasured; see below.

**Right-of-use asset.**

> liability + payments made at or before commencement + initial direct costs + restoration provision − incentives received

Under ASC 842, a restoration obligation is an asset retirement obligation under ASC 410-20, not part of the lease. The ledger leaves it out of the ROU asset and says so in the schedule's `notes`.

## Each period

**Interest** is charged on the liability outstanding during the period:

- in arrears, on the opening balance;
- in advance, on the opening balance after that period's payment.

> closing liability = opening liability − payment + interest

**Depreciation** is straight-line over the shorter of the lease term and the asset's useful life. If ownership transfers, or a purchase option is reasonably certain to be exercised, it is over the useful life instead, and the schedule runs past the end of the term (IFRS 16.31–32; ASC 842-20-35-8).

**Journals**, posted to a default chart of accounts that the API can map to a client's own codes:

| When | Debit | Credit |
|---|---|---|
| Commencement | 1610 Right-of-use assets | 2610 Lease liabilities |
| Commencement (advance payment, initial direct costs) | 1610 | 1000 Cash |
| Commencement (prepayments) | 1610 | 1450 Prepaid lease payments |
| Commencement (restoration, IFRS 16) | 1610 | 2650 Restoration provisions |
| Commencement (incentives received) | 1000 | 1610 |
| Each period: interest | 6810 Interest on lease liabilities | 2610 |
| Each period: payment | 2610 | 1000 |
| Each period: depreciation | 6820 Depreciation of right-of-use assets | 1619 Accumulated depreciation |

Journals are derived from the schedule with `scheduleJournals()` instead of being built every time. Most callers, such as portfolio snapshots, need only the balances.

## ASC 842 operating leases

Finance leases under ASC 842 follow the pattern above. Operating leases recognise a **single lease cost on a straight-line basis** (ASC 842-20-25-6(a)):

> total cost = all lease payments + initial direct costs − incentives received (+ prepayments)
>
> cost each period = total cost ÷ number of periods

The liability accretes interest exactly as under IFRS 16. ROU amortisation is the balancing figure, the "plug" (ASC 842-20-35-3(b)):

> amortisation = straight-line cost − interest

Each period posts Dr 6830 Operating lease cost, Cr 2610 (the interest) and Cr 1619 (the amortisation). After a remeasurement, the cost still to recognise is spread evenly over the remaining periods: the remaining payments plus the ROU asset minus the liability.

## Reassessments and modifications (IFRS 16.39–46; ASC 842-10-35, 842-10-25-8 to 25-18)

A change takes effect on the first day of a period after the first. Earlier periods stay exactly as they were. From that date, the liability is remeasured at the present value of the revised remaining payments, and the rest of the schedule is rebuilt.

| Change | Discount rate | Treatment |
|---|---|---|
| A change in the index or rate that drives rent | **Unchanged** (IFRS 16.42(b), 16.43) | The difference in the liability adjusts the ROU asset. |
| A change in the amount expected under a residual value guarantee | **Unchanged** (IFRS 16.42(a)) | As above. |
| Reassessed lease term (an option now is, or is no longer, reasonably certain) | **Revised** (IFRS 16.40(a)) | As above. Added periods repeat the last rent unless told otherwise. |
| Reassessed purchase option | **Revised** (IFRS 16.40(b)) | As above. Depreciation moves to the useful life if the option is now reasonably certain. |
| Modification adding a right of use at a stand-alone price | n/a | **A separate lease** (IFRS 16.44): its own schedule. The original is untouched. |
| Modification decreasing scope (less space, shorter term) | **Revised** | First, take out the share of the liability and the asset given up; the difference is a **gain or loss in profit or loss**. Then remeasure the rest at the revised rate against the ROU asset (IFRS 16.46(a), Illustrative Example 17). |
| Any other modification (an extension, a rent change) | **Revised** | The difference in the liability adjusts the ROU asset (IFRS 16.46(b)). |

If a reduction in the liability is larger than the ROU asset, the asset goes to zero and the rest is a gain in profit or loss (IFRS 16.39).

Remeasurement journals post the liability change against 1610, and any gain or loss to 7910 Gain or loss on lease modification.

## Maturity analysis (IFRS 16.58, IFRS 7.39(a) and B11; ASC 842-20-50-6)

Undiscounted lease payments still to fall due, in bands from the analysis date: within 1 year, 1–2, 2–3, 3–4, 4–5 and over 5 years. The same bands give ASC 842's "each of the next five years and the total thereafter".

The table reconciles to the balance sheet:

> total undiscounted − future interest = carrying amount of the liability

The carrying amount is also split into current (expected to be settled within 12 months) and non-current. A payment due on the analysis date counts as paid. Within a period, interest for that period has not yet been charged.

## Rounding

- Money is rounded **half away from zero** to the currency's minor unit (ISO 4217): EUR, USD, GBP, KES and AED to 2 places, BHD and OMR to 3, UGX and RWF to 0.
- Each rent payment is rounded once, after any escalation.
- The initial liability and the initial asset are each rounded once.
- Interest and depreciation are rounded every period. Balances carry forward from the rounded figures, so every row adds up exactly as printed.
- **The last period absorbs what is left.** Its interest is whatever brings the liability to exactly zero, and its depreciation is whatever is left of the asset. No balance is left over after the final period.

How large is the amount the last period absorbs? The initial liability and each period's interest can each be off by at most half a minor unit, and each of those errors then accrues interest. So the residual is at most ½ unit × Σ(1 + r)^k for k = 1…n. For a 10-year monthly lease at 6% that is about 82 cents at most. At monthly rates up to 20% a year it stays under n minor units. The property tests check both bounds on hundreds of random leases.

## How it's tested

- **Three worked examples, to the cent.** Every period, every journal line and every maturity band is checked against fixtures from `packages/ledger/fixtures/generate.py`. That is a separate implementation in plain Python, written from the definitions above, with no code shared with the TypeScript. The headline figures are also derived by hand, with closed-form annuity formulas, in [worked-examples.md](worked-examples.md).
- **Property tests** on random leases (all three standards, both timings, all frequencies, five currencies):
  - both balances end at zero;
  - total interest equals total payments less the initial liability;
  - every journal balances;
  - the general ledger clears both balance-sheet accounts;
  - ASC 842 operating cost equals payments plus initial direct costs;
  - the maturity analysis reconciles on any date;
  - schedules stay well formed after an index change and a modification.
- **Behaviour tests** for each rule above, and for the errors the API turns into typed results.

## Performance

These figures were measured on an Intel Core i7-7600U laptop, under load, with Node 22. Run `pnpm --filter @tenuro/ledger bench` to reproduce them.

| Work | Median | 95th percentile |
|---|---|---|
| 120-period monthly schedule (rows and totals) | 1.9 ms | 4.1 ms |
| Its 361 journal entries, when asked for | 1.3 ms | 2.6 ms |

The benchmark asserts a 3 ms median as a regression guard.
