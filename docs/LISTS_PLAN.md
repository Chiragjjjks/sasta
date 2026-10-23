# Lists (multiple wish lists) — plan for v0.3.0

**Decision.** Add named lists of products you buy again and again, like "Office snacks" or "Monthly groceries". A list can hold 20 products. Each time, you open it, tick the 5 you need, and tap **Add 5 to cart**. Sasta refreshes their prices and the cart picks the cheapest way to buy them, as it does today.

Status: plan only. Nothing here is built yet.

## Example

1. You search `lays`, tap the bookmark on Cream & Onion 48 g, and save it to **Office snacks**. You also save Maggi and Classic Salted there.
2. Over a month, Office snacks grows to 20 products.
3. Friday, you open Office snacks. Each row shows the last price Sasta saw and which app was cheapest. The products you bought last time are marked.
4. You tick 5 products, or tap **Same as last time**, and set Maggi to 4 packs.
5. **Add 5 to cart** refreshes just those 5 prices and drops them into the cart. The cart opens on the cheapest cart.
6. The list stays as it is for next time, and remembers what you picked.

## What a list is

| Field | Meaning |
|---|---|
| `id`, `name` | "Office snacks". Renamable |
| `emoji` | One emoji for the list, e.g. 🏢 or 🛒, so lists are easy to tell apart |
| `items[]` | Saved products, in the order you saved them |
| `createdAt`, `updatedAt` | For sorting lists |

Each saved product keeps:

| Field | Meaning |
|---|---|
| `key`, `brand`, `variant`, `variantKey`, `sizeGrams`, `query` | Same identity the cart uses, so a list item becomes a cart item directly |
| `qty` | Usual quantity, e.g. Maggi × 4. Pre-filled when ticked |
| `lastOffers`, `lastSeenAt` | Price snapshot from the last time Sasta looked, for the list view without a network call |
| `addedAt`, `lastPickedAt`, `timesPicked` | Drive "Same as last time" and "Often bought" sorting |
| `note` | Optional, e.g. "only if under ₹40" |

The same product can sit in several lists. Lists live on the phone only, next to the cart.

## Screens

1. **Save to list.** A bookmark button on every result card and in the compare sheet opens a small sheet: your lists with ticks, plus **New list** inline. A product can be saved to more than one list. The bookmark fills when the product is in any list.
2. **Lists screen.** A bookmark icon in the header, next to the account icon, opens it. One card per list: emoji, name, product count, and the estimated total if you bought everything. **New list** at the bottom. Starter names are offered on first use: Monthly groceries, Office snacks, Party.
3. **List detail.**
   - One row per product: tick box, pack icon, name and size, last cheapest price and app, quantity stepper.
   - Badges: **Price dropped** when the cheapest price fell since you saved it, **Last time** for products picked last time, **Not found** when no app has it now.
   - Top actions: **Same as last time**, **Select all**, **Clear**.
   - Sort: Saved order, Often bought, Cheapest, A–Z.
   - Sticky bottom button: **Add 5 to cart · about ₹212**.
   - Row menu: move or copy to another list, edit note, remove. The list menu: rename, change emoji, share as text, delete.
4. **After adding.** The cart sheet opens, with a short note: "5 added from Office snacks."

## Rules

- **Adding to the cart adds.** If an item is already in the cart, its quantity goes up by the list quantity. It never empties the cart.
- **Refresh only what you picked.** Opening a list shows saved prices. Prices are refreshed for the ticked items when you tap Add, not for all 20. That keeps requests low once live search and logged-in apps exist.
- **Products that changed.** If a refresh can't find the exact pack, the item is added with its last-seen prices and marked "Prices from 3 days ago". It is never dropped silently.
- **Deleting a list asks first** and offers Undo for a few seconds.
- **Share as text** produces a plain list ("Office snacks: Lay's Cream & Onion 48 g × 2, Maggi 70 g × 4 …") for WhatsApp. Real shared lists between people need a server and stay out of scope.
- **Backup.** Export and import all lists as a JSON file, since there is no account or server to restore from if the phone is lost.

## Code changes

- `src/lib/lists.ts`: types and pure functions: `createList`, `renameList`, `deleteList`, `saveToList`, `removeFromList`, `moveItem`, `setItemQty`, `selectSameAsLast`, `toCartItems(list, selectedKeys)`, `markPicked`, `estimateTotal`, `priceDropped`. Unit tests in `lists.test.ts`.
- `src/lib/storage.ts`: `loadLists` / `saveLists` under `sasta.lists`.
- `src/lib/cart.ts`: `addItems(cart, items)` that adds quantities. Reuse `refreshCart` to refresh only the picked items.
- Components: `SaveToListSheet`, `ListsSheet`, `ListDetailSheet`, a bookmark button on `ProductCard` and `CompareSheet`, and a header icon.
- `App.tsx`: lists state, persistence, back button closes the list sheets in order.

## Steps (one commit each)

1. Lists model, storage and tests.
2. Save to list: bookmark on cards and the compare sheet, Save sheet with New list.
3. Lists screen and list detail with ticks, quantities, and **Add N to cart**.
4. Refresh-on-add, Price dropped, Not found, Last time and Same as last time.
5. Manage: rename, emoji, move or copy, delete with Undo, sort.
6. Share as text, export and import.
7. Release v0.3.0 with notes in `docs/releases/v0.3.0.md`.

Steps 1 to 3 are the minimum useful release. Steps 4 to 6 can follow in v0.3.x if needed.

## Not in this release

- Lists shared live between people or phones (needs a server).
- Reminders like "restock every Friday" (good next step after this).
- Price-drop alerts in the background (Sasta never fetches in the background).

## Decide before release

- **The login screen is already on `main`.** A v0.3.0 release would ship it too. Test Swiggy Connect on a phone first. If it doesn't work yet, hide the Connected apps button behind a setting for v0.3.0.
- **Name.** "Lists" in the app, with "wish list" wording in the empty state, unless you prefer "Wish lists" or "Buckets" everywhere.
