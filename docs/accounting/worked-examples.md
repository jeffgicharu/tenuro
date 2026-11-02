# Worked examples

These are the three leases the ledger is tested against, to the cent. Each headline figure is derived below by hand, using closed-form formulas, so a reviewer can check it without running any code. The full period-by-period figures, journals and maturity tables are in `packages/ledger/fixtures/*.csv`. They were produced by `fixtures/generate.py`, an implementation independent of the TypeScript engine.

Notation: P is the payment, k the periods a year, r = (1 + i)^(1/k) − 1 the period rate for annual rate i, and a(n) = (1 − (1 + r)^−n) / r the present value of n payments of 1 in arrears.

---

## Example 1: office in EUR

A 5-year office lease starting 1 January 2025.

- EUR 10,000 a month in arrears.
- 5% incremental borrowing rate.
- EUR 6,000 of initial direct costs.
- A EUR 12,000 incentive received.

It is run under IFRS 16 and again as an ASC 842 operating lease.

**Period rate.** r = 1.05^(1/12) − 1 = 0.004074123784

**Liability.** 1.05^5 = 1.2762815625, so (1 + r)^−60 = 1 / 1.2762815625 = 0.7835261665.

> a(60) = (1 − 0.7835261665) / 0.004074123784 = 53.13383810
>
> liability = 10,000 × 53.13383810 = **531,338.38**

**ROU asset.** 531,338.38 + 6,000 − 12,000 = **525,338.38**

**First month.**

| | Calculation | Amount |
|---|---|---|
| Interest | 531,338.38 × 0.004074123784 | 2,164.74 |
| Closing liability | 531,338.38 + 2,164.74 − 10,000 | 523,503.12 |
| IFRS 16 depreciation | 525,338.38 ÷ 60 = 8,755.6397 | 8,755.64 |

**Last month.** The opening liability is 9,959.44. Interest is set to 10,000 − 9,959.44 = 40.56, which clears the liability exactly. Depreciation in the last month is whatever is left of the asset: 8,755.62. That is 2 cents less than the others, because 59 × 8,755.64 = 516,582.76.

**Totals.** Interest is 600,000 − 531,338.38 = **68,661.62**. Depreciation is 525,338.38.

**ASC 842 operating.**

> straight-line cost = (600,000 + 6,000 − 12,000) / 60 = **9,900.00** a month

ROU amortisation in month 1 is 9,900.00 − 2,164.74 = **7,735.26**. Total cost is 594,000.00, the same as the IFRS 16 total of interest plus depreciation (68,661.62 + 525,338.38). Only the timing differs.

**Maturity at 31 December 2025.**

| | Amount |
|---|---|
| 12 payments in each of the next 4 years | 120,000 each |
| Total undiscounted | 480,000.00 |
| Carrying amount (closing liability for December 2025) | 435,179.53 |
| Future interest | 44,820.47 |
| Current portion (the liability falls to 334,212.73 by 31 December 2026) | 100,966.80 |

---

## Example 2: warehouse in AED, paid in advance

A logistics warehouse starting 1 January 2025.

- 10 years, plus a 5-year renewal that is reasonably certain. `effectiveTerm()` gives 180 months, or 60 quarters.
- AED 375,000 a quarter, paid in advance, rising 3% at each anniversary.
- 6.25% incremental borrowing rate.
- AED 45,000 of initial direct costs.
- A restoration provision of AED 150,000.

**Period rate.** r = 1.0625^(1/4) − 1 = 0.015271592434, with v = 1/(1 + r).

**Liability.** Group the payments by year y = 0…14. Each year's four payments are 375,000 × 1.03^y, due 4y, 4y + 1, 4y + 2 and 4y + 3 quarters after commencement. With v^4 = 1/1.0625:

> PV of every payment = 375,000 × (1 + v + v² + v³) × Σ (1.03 / 1.0625)^y
>
> = 375,000 × 3.9106503552 × 12.1773858144 = 17,858,061.81

The first payment is made on the commencement date, so it is not in the liability:

> 17,858,061.81 − 375,000.00 = 17,483,061.81 with unrounded rents

The ledger rounds each year's rent to the fils, half up. For example, year 3 is 375,000 × 1.03³ = 409,772.625, which rounds to 409,772.63. That makes the present value 17,483,061.7971:

> liability = **17,483,061.80**

**ROU asset.** 17,483,061.80 + 375,000 (paid at commencement) + 45,000 + 150,000 = **18,053,061.80**

**First quarter.** No payment reduces the liability, because quarter 1's rent was paid at commencement.

| | Calculation | Amount |
|---|---|---|
| Interest | 17,483,061.80 × 0.015271592434 | 266,994.19 |
| Depreciation | 18,053,061.80 ÷ 60 | 300,884.36 |

**Second quarter.** The payment of 375,000 is made on 1 April, and interest is charged on what remains:

> (17,750,055.99 − 375,000) × r = 265,344.77

**Fifth quarter.** The first uplift: 375,000 × 1.03 = 386,250.00.

**Totals.**

| | Amount |
|---|---|
| Cash paid | 27,898,370.80 |
| Payments through the liability (cash paid less the 375,000 at commencement) | 27,523,370.80 |
| Interest (27,523,370.80 − 17,483,061.80) | **10,040,309.00** |

**Maturity at 31 December 2025.** Payments still due within one year are 4 × 386,250 = **1,545,000.00**. The carrying amount is the closing liability for quarter 4: **17,416,040.90**.

---

## Example 3: office in KES, with four changes in year 3

An 8-year office lease starting 1 January 2024.

- KES 850,000 a month in arrears, linked to the CPI.
- 13% incremental borrowing rate.
- KES 250,000 of initial direct costs.

**Initial measurement.** r = 1.13^(1/12) − 1 = 0.010236844358

> a(96) = 60.94066848
>
> liability = 850,000 × 60.94066848 = **51,799,568.21**
>
> ROU asset = 51,799,568.21 + 250,000 = **52,049,568.21**

### (a) 1 January 2026: CPI moves from 100.0 to 106.5

This uses the **original** 13% rate (IFRS 16.42(b), 16.43). Rent becomes 850,000 × 1.065 = 905,250.00, and 72 payments remain.

| | Calculation | Amount |
|---|---|---|
| Liability before (December 2025 close) | | 43,150,919.99 |
| Remeasured liability | 905,250 × a(72) = 905,250 × 50.76578820 | **45,955,729.77** |
| Adjustment, liability and ROU asset alike | | **+2,804,809.78** |

Journal: Dr 1610 / Cr 2610, 2,804,809.78.

### (b) 1 April 2026: 40% of the space is handed back, revised rate 14%

The March 2026 close is liability 44,637,905.97 and ROU asset 40,098,569.92.

**Step 1: take out the 40% given up.**

| | Calculation | Amount |
|---|---|---|
| Liability out | 0.4 × 44,637,905.97 | 17,855,162.39 |
| ROU asset out | 0.4 × 40,098,569.92 | 16,039,427.97 |
| **Gain in profit or loss** | 17,855,162.39 − 16,039,427.97 | **1,815,734.42** |

That leaves a liability of 26,782,743.58 and an ROU asset of 24,059,141.95.

**Step 2: remeasure at 14%.** The new rent is 0.6 × 905,250 = 543,150.00, with 69 payments left. r = 1.14^(1/12) − 1 = 0.010978851950.

> liability = 543,150 × a(69) = 543,150 × 48.20564640 = **26,182,896.84**
>
> adjustment = 26,182,896.84 − 26,782,743.58 = **−599,846.74** (Dr 2610 / Cr 1610)
>
> ROU asset = 24,059,141.95 − 599,846.74 = **23,459,295.21**

### (c) 1 July 2026: extended by 2 years to 31 December 2033, revised rate 14.5%

The June 2026 close is liability 25,407,368.86 and ROU asset 22,439,325.84. There are now 90 payments of 543,150 left. r = 1.145^(1/12) − 1 = 0.011347621038.

> liability = 543,150 × a(90) = 543,150 × 56.20484865 = **30,527,663.55**
>
> adjustment = **+5,120,294.69**, against the ROU asset, which becomes 27,559,620.53

### (d) 1 October 2026: an extra floor at its stand-alone price

This is a **separate lease** (IFRS 16.44). It has its own schedule, and the head lease is untouched.

- KES 420,000 a month in arrears.
- 87 months, ending with the head lease on 31 December 2033.
- 14.5% rate.

> liability = 420,000 × a(87) = 420,000 × 55.10584536 = **23,144,455.05**

**Head lease maturity at 31 December 2026.**

| | Amount |
|---|---|
| Each of the next 5 years: 12 × 543,150 | 6,517,800.00 |
| After 5 years | 13,035,600.00 |
| Carrying amount | 29,313,263.82 |
| Current portion | 2,689,952.17 |

---

## Regenerating the fixtures

```
python3 packages/ledger/fixtures/generate.py
pnpm --filter @tenuro/ledger test
```

The script uses only the Python standard library. If you change a policy in the engine, change `generate.py` from the definitions as well, not from the TypeScript, and say why in the pull request.
