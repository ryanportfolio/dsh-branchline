# Decision log format

Surveyors write problems. Manager groups them under fixes. Critics add verdicts. Owner reads the final file, so problem and fix text is plain prose a person can follow (no internal codes beyond the ids).

## Problem (surveyor output, one per entry)

```md
- P<agent>-<n> [hidden | needless | surplus | special] `path:line` (+ more `path:line`)
  What: one sentence, what the code does.
  Change it makes harder: one sentence, the concrete future change that has to touch several places or breaks silently.
  Evidence: co-change together 14, share 0.87; or import edge `a.ts → b.ts`; or copies at ...; or callers ...
```

## Fix (Manager, after redesign; critic verdict appended)

```md
### F<n>: <what changes, one line>
- Solves: P2-1, P2-4, P5-3
- Removes special cases: P2-4 (`if (region === "EU")` in `cart/total.ts:57`)
- Touches: <files or folders>, <caller count>
- Behavior check: `npm test -- cart` (exists) | write first: <what it must show>
- Risk: <what could change behavior, and why rule 4 holds>
- Size: S | M | L
- Critic: keep | revise: <change> | drop: <reason>
```

Order fixes by rank. After fixes: "Unassigned problems" (no fix covers them yet) and "Dropped fixes" (with critic reason).

## Example

Problems from surveyors:

```md
- P2-1 [hidden] `cart/total.ts:40`, `checkout/summary.ts:88`, `email/receipt.ts:31`
  What: shipping cost is computed three times with the same thresholds.
  Change it makes harder: a new free-shipping threshold means three edits; the receipt already uses the old 50 instead of 60.
  Evidence: co-change total.ts/summary.ts together 9, share 0.9; receipt.ts last changed before the threshold moved.
- P2-4 [special] `cart/total.ts:57`
  What: `if (region === "EU")` adds VAT inside the shipping calculation.
  Change it makes harder: each new tax region needs another branch in shipping code.
  Evidence: blame shows the branch added in a "fix EU totals" commit; same check at `checkout/summary.ts:95`.
- P5-3 [needless] `email/receipt.ts:12`
  What: receipt reads `state.items[].priceCents`, a private field of `cart/state.ts`, to list line items.
  Change it makes harder: any change to how the cart stores items breaks receipts.
  Evidence: import edge `email/receipt.ts → cart/state.ts`; commit `a1b2c3d` renamed `price` to `priceCents` in the cart and had to edit `email/receipt.ts:12` too.
```

Fix over them:

```md
### F1: one `pricing` module returns a priced order (lines, shipping, tax by region); cart, checkout and receipt only display it
- Solves: P2-1, P2-4, P5-3
- Removes special cases: P2-4 and the same EU check at `checkout/summary.ts:95`
- Touches: new `pricing/`, `cart/total.ts`, `checkout/summary.ts`, `email/receipt.ts`; 6 callers
- Behavior check: `npm test -- cart` (exists, covers cart only); write first: for one EU and one US order under 50 and over 60, checkout and receipt totals match today's checkout output
- Risk: receipt total changes for orders between 50 and 60 (today's stale threshold); flagged for owner as a bug the fix also fixes
- Size: M
- Critic: revise: keep tax rates in config, not code, since they change on a different schedule
```
