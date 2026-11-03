# Stage 6: Pay

The user is asking: is this the price I agreed to, what else is being added, when will I be charged again, and what if this fails?

Starts at checkout, a payment sheet or an app-store purchase; ends at the confirmation. Hand-off rules and severity: [journey.md](../journey.md).

## Hand-off in and out

- **In**: compare everything here with the record from Understand and Commit. Plan, period, quantity and total match; nothing new appears without a name and a reason.
- **Out**: the confirmation states what was bought, the amount, the next charge date if it renews, and where to cancel (EX3).

## Rules

### Applies when: the journey takes payment

**PA1. The charge matches the commitment.** At payment, the plan, period, quantity and total equal what the button promised at Commit (CO1) and the prices stated at Understand. Any difference (tax, shipping, a currency change, a different billing period) is named and explained before the final button, not only in the receipt. Fix: an order summary above the pay button in the same words and numbers the user chose; the final button repeats the total ("Pay €445"); for subscriptions, the renewal date and amount sit beside it. Convention.

**PA2. Add-ons in context.** An add-on offered where it relates (protection plan under the laptop at checkout) is easier to judge. 2TlIg3VokY8 9:56. Presenter. Guard: opt-in only, never pre-added; its price in the same units as the order (UN13); a plain way to decline (EX1).

**PA3. A failed payment keeps the order.** A declined card, an expired session or a validation error returns the user to the pay step with the order and their entered details intact (card data may need re-entry), and says what happened and what to do next ("Your bank declined the card. Try another card or contact your bank."). Convention.

Mandatory fees belong in the first price shown (UN9, CO1 guard); a fee that first appears here is HO5.

## Honesty items here

HO4 (pre-added insurance or add-ons), HO5 (fees that first appear here), HO7 (add-on framed in mixed units), HO9 (renewal date or amount missing). Details in [honesty.md](../honesty.md).

## Build moves

- Repeat the user's choices and the total in the order summary and on the final button (PA1).
- Put every mandatory fee in the first price the user sees, so the total here is no surprise (UN9).
- Offer add-ons beside what they relate to, unticked, with a decline (PA2).
- Design the failure states: decline, timeout, validation (PA3, SC6).

## At limited depth

Read-only: fees and totals shown before payment are observable; the final total is not. Record HO5 and PA1 as not checked unless code or a test-mode walk shows them. Native apps: the store's own payment sheet is outside the app; judge the screens before and after it.
