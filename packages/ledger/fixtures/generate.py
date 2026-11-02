#!/usr/bin/env python3
"""
Expected figures for the ledger's worked examples.

This script is deliberately independent of the TypeScript engine. It is written from the
accounting definitions (IFRS 16.26-38, 16.39-46, ASC 842-20-25-6, 842-20-35) and the rounding
policy in docs/accounting/method.md, using Python's decimal module. It shares no code with
packages/ledger/src. Run it with:  python3 packages/ledger/fixtures/generate.py

Policy, restated here so the script stands alone:
  * Period rate r = (1 + annual rate) ** (1 / periods per year) - 1.
  * Discount factor for a payment t periods away = (1 + annual rate) ** (-t / periods per year).
  * Arrears payments fall at the end of each period; advance payments at the start. At
    commencement the advance payment is already paid, so it goes into the ROU asset, not the liability.
  * Money rounds half away from zero to the currency's minor unit. The initial liability and
    asset are rounded once; interest and depreciation are rounded every period; balances carry
    forward rounded. The final period absorbs whatever is left so balances end at exactly zero.
"""

import calendar
import csv
import datetime as dt
from decimal import Decimal, ROUND_HALF_UP, getcontext
from pathlib import Path

getcontext().prec = 34
getcontext().rounding = ROUND_HALF_UP

HERE = Path(__file__).resolve().parent
MINOR = {"EUR": 2, "AED": 2, "KES": 2}


# --------------------------------------------------------------------------- helpers

def money(x, ccy):
    places = MINOR[ccy]
    return Decimal(x).quantize(Decimal(1).scaleb(-places), rounding=ROUND_HALF_UP)


def text(x, ccy):
    return f"{money(x, ccy):.{MINOR[ccy]}f}"


def shift_months(d, months):
    total = d.year * 12 + (d.month - 1) + months
    year, month = divmod(total, 12)
    month += 1
    day = min(d.day, calendar.monthrange(year, month)[1])
    return dt.date(year, month, day)


def period_bounds(commencement, months_per_period, t):
    start = shift_months(commencement, (t - 1) * months_per_period)
    end = shift_months(commencement, t * months_per_period) - dt.timedelta(days=1)
    return start, end


def discount(annual, periods_per_year, t):
    """Value today of 1 paid t periods from now."""
    return (Decimal(1) + annual) ** (Decimal(-t) / Decimal(periods_per_year))


# --------------------------------------------------------------------------- one segment of a schedule

def walk(lease, first, opening_liability, opening_rou, annual, payments, last, dep_last, skip_first, segment):
    """
    Rows for periods first..max(last, dep_last).

    payments[t] is the amount due in period t (1-based dict). The liability starts at
    opening_liability before period `first`'s payment; the asset at opening_rou.
    """
    ccy = lease["currency"]
    ppy = lease["periods_per_year"]
    mpp = 12 // ppy
    arrears = lease["timing"] == "ARREARS"
    operating = lease["standard"] == "ASC842_OPERATING"
    r = (Decimal(1) + annual) ** (Decimal(1) / Decimal(ppy)) - Decimal(1)
    if operating:
        dep_last = last

    rows = []
    liability = opening_liability
    rou = opening_rou

    straight_line = Decimal(0)
    if dep_last >= first:
        straight_line = money(opening_rou / (dep_last - first + 1), ccy)

    level_cost = Decimal(0)
    if operating:
        applied = sum(payments[t] for t in range(first, last + 1) if not (skip_first and t == first))
        level_cost = money((applied + opening_rou - opening_liability) / (last - first + 1), ccy)

    for t in range(first, max(last, dep_last) + 1):
        start, end = period_bounds(lease["commencement"], mpp, t)
        due = payments[t] if t <= last else Decimal(0)
        applied = Decimal(0) if (t > last or (skip_first and t == first)) else due

        if t > last:
            interest = Decimal(0)
        elif t == last:
            interest = applied - liability          # plug: clears the liability exactly
        elif arrears:
            interest = money(liability * r, ccy)    # accrues on the balance outstanding all period
        else:
            interest = money((liability - applied) * r, ccy)   # paid first, then accrues

        closing = liability + interest - applied

        if operating:
            if t == last:
                amortisation = rou
                cost = amortisation + interest
            else:
                cost = level_cost
                amortisation = cost - interest
            depreciation = amortisation
        else:
            if t > dep_last:
                depreciation = Decimal(0)
            elif t == dep_last:
                depreciation = rou
            else:
                depreciation = min(straight_line, rou)
            cost = interest + depreciation

        rows.append({
            "period": t,
            "start": start.isoformat(),
            "end": end.isoformat(),
            "payment_date": (end if arrears else start).isoformat(),
            "opening_liability": liability,
            "payment": applied,
            "interest": interest,
            "closing_liability": closing,
            "opening_rou": rou,
            "depreciation": depreciation,
            "closing_rou": rou - depreciation,
            "lease_cost": cost,
            "cash_paid": due,
            "segment": segment,
        })
        liability = closing
        rou = rou - depreciation
    return rows


# --------------------------------------------------------------------------- journals as flat lines

def line(lines, period, date, account, signed, ccy):
    if signed == 0:
        return
    debit = signed if signed > 0 else Decimal(0)
    credit = -signed if signed < 0 else Decimal(0)
    lines.append([period, date, account, text(debit, ccy), text(credit, ccy)])


def period_lines(lease, rows):
    ccy = lease["currency"]
    out = []
    for row in rows:
        p = row["period"]
        line(out, p, row["payment_date"], "2610", row["payment"], ccy)
        line(out, p, row["payment_date"], "1000", -row["payment"], ccy)
        if lease["standard"] == "ASC842_OPERATING":
            line(out, p, row["end"], "6830", row["lease_cost"], ccy)
            line(out, p, row["end"], "2610", -row["interest"], ccy)
            line(out, p, row["end"], "1619", -row["depreciation"], ccy)
        else:
            line(out, p, row["end"], "6810", row["interest"], ccy)
            line(out, p, row["end"], "2610", -row["interest"], ccy)
            line(out, p, row["end"], "6820", row["depreciation"], ccy)
            line(out, p, row["end"], "1619", -row["depreciation"], ccy)
    return out


# --------------------------------------------------------------------------- a fresh lease

def measure(lease):
    """Initial measurement and the full schedule for a lease as it stands at commencement."""
    ccy = lease["currency"]
    ppy = lease["periods_per_year"]
    n = lease["term"]
    annual = lease["ibr"]
    payments = lease["payments"]
    advance = lease["timing"] == "ADVANCE"

    if advance:
        # Instalment 1 is paid on the commencement date; instalment t falls t-1 periods later.
        pv = sum(payments[t] * discount(annual, ppy, t - 1) for t in range(2, n + 1))
        paid_at_commencement = payments[1]
    else:
        pv = sum(payments[t] * discount(annual, ppy, t) for t in range(1, n + 1))
        paid_at_commencement = Decimal(0)
    liability = money(pv, ccy)

    restoration = lease.get("restoration", Decimal(0)) if lease["standard"] == "IFRS16" else Decimal(0)
    rou = (liability + paid_at_commencement + lease.get("idc", Decimal(0))
           + restoration - lease.get("incentive", Decimal(0)))

    rows = walk(lease, 1, liability, rou, annual, payments, n, n, advance, 0)

    date = lease["commencement"].isoformat()
    lines = []
    line(lines, 0, date, "1610", liability, ccy)
    line(lines, 0, date, "2610", -liability, ccy)
    line(lines, 0, date, "1610", paid_at_commencement, ccy)
    line(lines, 0, date, "1000", -paid_at_commencement, ccy)
    line(lines, 0, date, "1610", lease.get("idc", Decimal(0)), ccy)
    line(lines, 0, date, "1000", -lease.get("idc", Decimal(0)), ccy)
    line(lines, 0, date, "1610", restoration, ccy)
    line(lines, 0, date, "2650", -restoration, ccy)
    line(lines, 0, date, "1000", lease.get("incentive", Decimal(0)), ccy)
    line(lines, 0, date, "1610", -lease.get("incentive", Decimal(0)), ccy)
    lines += period_lines(lease, rows)

    return {
        "lease": lease,
        "initial_liability": liability,
        "initial_rou": rou,
        "paid_at_commencement": paid_at_commencement,
        "rows": rows,
        "lines": lines,
        "events": [],
    }


# --------------------------------------------------------------------------- remeasuring

def pv_from(payments, first, last, annual, ppy, advance):
    """Present value on the first day of period `first` of the payments still to come."""
    total = Decimal(0)
    for t in range(first, last + 1):
        periods_away = (t - first) if advance else (t - first + 1)
        total += payments[t] * discount(annual, ppy, periods_away)
    return total


def apply_change(state, effective_period, new_payments, new_term, new_ibr, scope_given_up, label):
    """
    Rebuild the schedule from `effective_period` after a reassessment or modification.

    scope_given_up: share of the right of use surrendered (None if scope is unchanged).
    """
    lease = dict(state["lease"])
    ccy = lease["currency"]
    ppy = lease["periods_per_year"]
    advance = lease["timing"] == "ADVANCE"
    before = state["rows"][effective_period - 2]
    l_before = before["closing_liability"]
    r_before = before["closing_rou"]
    date = state["rows"][effective_period - 1]["start"]

    l_after = money(pv_from(new_payments, effective_period, new_term, new_ibr, ppy, advance), ccy)

    lines = []
    gain = Decimal(0)
    l_base, r_base = l_before, r_before
    if scope_given_up is not None:
        l_out = money(l_before * scope_given_up, ccy)
        r_out = money(r_before * scope_given_up, ccy)
        line(lines, effective_period, date, "2610", l_out, ccy)
        line(lines, effective_period, date, "1610", -r_out, ccy)
        line(lines, effective_period, date, "7910", -(l_out - r_out), ccy)
        gain += l_out - r_out
        l_base = l_before - l_out
        r_base = r_before - r_out

    change = l_after - l_base
    if change >= 0:
        r_after = r_base + change
        line(lines, effective_period, date, "1610", change, ccy)
        line(lines, effective_period, date, "2610", -change, ccy)
    else:
        cut = min(-change, r_base)
        excess = -change - cut
        r_after = r_base - cut
        line(lines, effective_period, date, "2610", -change, ccy)
        line(lines, effective_period, date, "1610", -cut, ccy)
        line(lines, effective_period, date, "7910", -excess, ccy)
        gain += excess

    lease["term"] = new_term
    lease["ibr"] = new_ibr
    lease["payments"] = new_payments
    segment = len(state["events"]) + 1
    tail = walk(lease, effective_period, l_after, r_after, new_ibr, new_payments,
                new_term, new_term, False, segment)

    kept_rows = [r for r in state["rows"] if r["period"] < effective_period]
    kept_lines = [l for l in state["lines"] if l[0] < effective_period]
    event = {
        "label": label,
        "period": effective_period,
        "date": date,
        "liability_before": l_before,
        "rou_before": r_before,
        "liability_after": l_after,
        "rou_after": r_after,
        "liability_adjustment": l_after - l_before,
        "rou_adjustment": r_after - r_before,
        "profit_or_loss": gain,
    }
    return {
        "lease": lease,
        "initial_liability": state["initial_liability"],
        "initial_rou": state["initial_rou"],
        "paid_at_commencement": state["paid_at_commencement"],
        "rows": kept_rows + tail,
        "lines": kept_lines + lines + period_lines(lease, tail),
        "events": state["events"] + [event],
    }


# --------------------------------------------------------------------------- maturity analysis

def maturity(state, as_of):
    ccy = state["lease"]["currency"]
    as_of_date = dt.date.fromisoformat(as_of)
    edges = [shift_months(as_of_date, 12 * y).isoformat() for y in range(1, 6)]
    bands = [Decimal(0)] * 6
    for row in state["rows"]:
        if row["payment"] == 0 or row["payment_date"] <= as_of:
            continue
        band = next((i for i, edge in enumerate(edges) if row["payment_date"] <= edge), 5)
        bands[band] += row["payment"]

    def carrying(on):
        # Only period-end dates are used here: the closing liability of the period ending that day.
        match = [r for r in state["rows"] if r["end"] == on]
        if match:
            return match[0]["closing_liability"]
        if on > state["rows"][-1]["end"]:
            return Decimal(0)
        raise ValueError(f"{on} is not a period end")

    held = carrying(as_of)
    in_a_year = carrying(edges[0])
    total = sum(bands)
    labels = ["WITHIN_1_YEAR", "YEAR_1_TO_2", "YEAR_2_TO_3", "YEAR_3_TO_4", "YEAR_4_TO_5", "AFTER_5_YEARS"]
    out = [[as_of, label, text(amount, ccy)] for label, amount in zip(labels, bands)]
    out += [
        [as_of, "TOTAL_UNDISCOUNTED", text(total, ccy)],
        [as_of, "FUTURE_INTEREST", text(total - held, ccy)],
        [as_of, "CARRYING_AMOUNT", text(held, ccy)],
        [as_of, "CURRENT", text(held - in_a_year, ccy)],
        [as_of, "NON_CURRENT", text(in_a_year, ccy)],
    ]
    return out


# --------------------------------------------------------------------------- output

ROW_FIELDS = ["period", "start", "end", "payment_date", "opening_liability", "payment", "interest",
              "closing_liability", "opening_rou", "depreciation", "closing_rou", "lease_cost",
              "cash_paid", "segment"]
MONEY_FIELDS = set(ROW_FIELDS) - {"period", "start", "end", "payment_date", "segment"}


def write(name, state, as_of):
    ccy = state["lease"]["currency"]
    with open(HERE / f"{name}.schedule.csv", "w", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(ROW_FIELDS)
        for row in state["rows"]:
            w.writerow([text(row[k], ccy) if k in MONEY_FIELDS else row[k] for k in ROW_FIELDS])

    with open(HERE / f"{name}.journal.csv", "w", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["period", "date", "account", "debit", "credit"])
        for l in sorted(state["lines"], key=lambda l: (l[0], l[1], l[2], l[3], l[4])):
            w.writerow(l)

    with open(HERE / f"{name}.summary.csv", "w", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["key", "value"])
        w.writerow(["initial_liability", text(state["initial_liability"], ccy)])
        w.writerow(["initial_rou", text(state["initial_rou"], ccy)])
        w.writerow(["commencement_payment", text(state["paid_at_commencement"], ccy)])
        for key in ("payment", "cash_paid", "interest", "depreciation", "lease_cost"):
            w.writerow([f"total_{key}", text(sum(r[key] for r in state["rows"]), ccy)])
        for i, e in enumerate(state["events"], start=1):
            for key in ("liability_before", "rou_before", "liability_after", "rou_after",
                        "liability_adjustment", "rou_adjustment", "profit_or_loss"):
                w.writerow([f"event{i}_{key}", text(e[key], ccy)])

    with open(HERE / f"{name}.maturity.csv", "w", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["as_of", "band", "amount"])
        w.writerows(maturity(state, as_of))


# --------------------------------------------------------------------------- the examples

def eur_office(standard):
    """Example 1: 5-year office in EUR, EUR 10,000 a month in arrears, 5% IBR."""
    return {
        "currency": "EUR",
        "commencement": dt.date(2025, 1, 1),
        "periods_per_year": 12,
        "timing": "ARREARS",
        "term": 60,
        "payments": {t: Decimal("10000.00") for t in range(1, 61)},
        "ibr": Decimal("0.05"),
        "idc": Decimal("6000.00"),
        "incentive": Decimal("12000.00"),
        "standard": standard,
    }


def aed_warehouse():
    """
    Example 2: logistics warehouse in AED. 10 years quarterly in advance, plus a 5-year renewal
    that is reasonably certain, so the term is 15 years (60 quarters). AED 375,000 a quarter,
    rising 3% at each anniversary. IBR 6.25%. Restoration provision AED 150,000; IDC AED 45,000.
    """
    payments = {}
    for t in range(1, 61):
        year_index = (t - 1) // 4
        payments[t] = money(Decimal("375000") * (Decimal("1.03") ** year_index), "AED")
    return {
        "currency": "AED",
        "commencement": dt.date(2025, 1, 1),
        "periods_per_year": 4,
        "timing": "ADVANCE",
        "term": 60,
        "payments": payments,
        "ibr": Decimal("0.0625"),
        "idc": Decimal("45000.00"),
        "restoration": Decimal("150000.00"),
        "standard": "IFRS16",
    }


def kes_office():
    """Example 3: 8-year office in KES, KES 850,000 a month in arrears, CPI-linked, 13% IBR."""
    return {
        "currency": "KES",
        "commencement": dt.date(2024, 1, 1),
        "periods_per_year": 12,
        "timing": "ARREARS",
        "term": 96,
        "payments": {t: Decimal("850000.00") for t in range(1, 97)},
        "ibr": Decimal("0.13"),
        "idc": Decimal("250000.00"),
        "standard": "IFRS16",
    }


def kes_sequence():
    state = measure(kes_office())

    # (a) 1 Jan 2026 (period 25): CPI moves from 100.0 to 106.5. Rent rises; ORIGINAL rate (IFRS 16.42(b), 43).
    p = 25
    pay = dict(state["lease"]["payments"])
    for t in range(p, state["lease"]["term"] + 1):
        pay[t] = money(pay[t] * Decimal("106.5") / Decimal("100.0"), "KES")
    state = apply_change(state, p, pay, state["lease"]["term"], state["lease"]["ibr"], None, "index")

    # (b) 1 Apr 2026 (period 28): 40% of the space handed back. Partial derecognition, then revised rate 14%.
    p = 28
    pay = dict(state["lease"]["payments"])
    for t in range(p, state["lease"]["term"] + 1):
        pay[t] = money(pay[t] * (Decimal(1) - Decimal("0.4")), "KES")
    state = apply_change(state, p, pay, state["lease"]["term"], Decimal("0.14"), Decimal("0.4"), "scope_decrease")

    # (c) 1 Jul 2026 (period 31): term extended by 2 years to 120 months at the current rent; revised rate 14.5%.
    p = 31
    pay = dict(state["lease"]["payments"])
    last_rent = pay[state["lease"]["term"]]
    for t in range(state["lease"]["term"] + 1, 121):
        pay[t] = last_rent
    state = apply_change(state, p, pay, 120, Decimal("0.145"), None, "extension")
    return state


def kes_extra_floor():
    """
    (d) 1 Oct 2026: an extra floor at a price in line with its stand-alone price. A separate lease
    (IFRS 16.44): its own schedule, coterminous with the extended head lease (ends 31 Dec 2033).
    """
    return measure({
        "currency": "KES",
        "commencement": dt.date(2026, 10, 1),
        "periods_per_year": 12,
        "timing": "ARREARS",
        "term": 87,
        "payments": {t: Decimal("420000.00") for t in range(1, 88)},
        "ibr": Decimal("0.145"),
        "standard": "IFRS16",
    })


def main():
    write("eur-office-ifrs16", measure(eur_office("IFRS16")), "2025-12-31")
    write("eur-office-asc842-operating", measure(eur_office("ASC842_OPERATING")), "2025-12-31")
    write("aed-warehouse-ifrs16", measure(aed_warehouse()), "2025-12-31")
    write("kes-office-ifrs16", kes_sequence(), "2026-12-31")
    write("kes-extra-floor-ifrs16", kes_extra_floor(), "2026-12-31")
    print("fixtures written to", HERE)


if __name__ == "__main__":
    main()
