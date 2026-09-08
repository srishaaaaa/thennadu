# Inventory & Products Module — Full Build Prompt

Paste this entire document into another AI coding assistant (or use it as your own spec) to reproduce this Inventory module exactly, structure and flow included, in a different project.

---

## 0. Tech stack assumptions

- React (function components + hooks), TypeScript
- Tailwind CSS (utility classes, arbitrary values like `bg-[#E87020]` are used throughout)
- Supabase (Postgres + PostgREST + Row Level Security) as the backend, via `@supabase/supabase-js`
- `lucide-react` for all icons
- A currency formatter function `formatCurrency(value: number): string` (swap for your own locale/currency)
- A sound-effects hook `useSound()` returning `{ play: (type: 'success'|'error'|'alert'|'bell') => void, soundEnabled: boolean }` — used for light audio feedback on save/error/low-stock actions. If you don't have one, stub it out or drop the `play(...)` calls.
- A brand-name constant, e.g. `BRAND_EN = "Your Business Name"`, interpolated into a couple of modal titles.

If your stack differs (Firebase, a REST API, plain fetch, Vue, etc.), keep every piece of **UI structure, copy, colors, and interaction logic** identical and only swap the data-access calls.

---

## 1. Design tokens (exact hex values used)

```
PRIMARY        = #E87020   (orange — brand primary; all solid buttons, active tab, modal headers, icons)
PRIMARY_DARK   = #C85C10   (orange hover/darker shade)
PRIMARY_SUBTLE = rgba(255,255,255,0.85)  (subtitle text sitting on a PRIMARY-colored bar)

Neutral surface tokens used throughout:
  page/card border      #EEEBE3
  table header / hover bg  #FAFAF7
  divider                #F0EEE9
  soft peach card bg     #FFF8F2
  soft peach border      #FDDBB4
  peach pill bg          #FDE9C8
  heading/body text      #111111
  secondary text         #374151
  muted text             #6B7280
  placeholder/icon gray  #9CA3AF
```

Semantic status colors (Tailwind defaults, not custom hex):
- **Emerald** (`emerald-50/100/500/600/700`) = healthy stock / restock / positive movement
- **Amber** (`amber-50/100/600/700`) = low stock / reconciliation
- **Red** (`red-50/100/600/700`) = out of stock / loss / negative movement
- **Purple** (`purple-50/100/500/600/700`) = customer return / POS sale movement type
- **Blue** (`blue-50/100/500/600/700`) = reconciliation adjustment type

Corner radius: `rounded-xl` (buttons/inputs/small cards) and `rounded-2xl` (page-level cards, modals). Shadows: `shadow-sm` on cards, `shadow-2xl` on modals.

---

## 2. Data model (Supabase tables)

### `products`
Columns actually read/written by this module:
```
id                bigint / uuid, PK
name              text, required
category          text (denormalized category name, not a FK id — simplest to keep in sync manually)
price             numeric  -- selling price
purchase_price    numeric  -- cost price, "for records only, not used in billing"
stock_quantity    numeric
low_stock_alert   numeric, default 5
description       text, nullable
is_active         boolean, default true  -- if false, hidden from the billing/POS panel
updated_at        timestamptz
image_url         text, nullable
item_type         text, 'product' | 'service', default 'product'
```

### `categories`
```
id          bigint / uuid, PK
name_en     text, unique
name_ta     text (optional secondary-language name; drop if you don't need i18n)
is_active   boolean, default true
sort_order  integer, default 0
```

### `inventory_logs` (append-only audit ledger)
```
id             uuid, PK, default gen_random_uuid()
product_id     FK -> products.id, on delete cascade
old_quantity   numeric
new_quantity   numeric
adjustment     numeric          -- new_quantity - old_quantity, signed
reason         text CHECK (reason IN ('sale','restock','return','manual_adjustment','loss'))
reference_id   text, nullable   -- free-text note the user typed
created_by     uuid, nullable, FK -> auth users
created_at     timestamptz, default now()
```
Row Level Security: if your app's admin/staff login is a **client-side password check and not real Supabase Auth** (i.e. requests hit PostgREST as the `anon` role), every policy on this table — and on `products`/`categories` — must grant `TO anon, authenticated`, not `TO authenticated` only, or every write will be silently rejected.

`sale` rows are written automatically by a POS/checkout flow elsewhere in the app (not by this module) whenever an order completes — this module only ever writes `restock`, `return`, `loss`, and `manual_adjustment`.

---

## 3. Page shell

Route: a single `Inventory` page/component, typically embedded as one tab inside a larger admin dashboard.

**Outer container**: `p-4 sm:p-6 space-y-5`

### 3.1 Header row
`flex flex-wrap items-center justify-between gap-3`
- Left: `<h1>` — a package icon (PRIMARY-colored, size 24) + text **"Inventory & Products"**, `text-2xl font-black`.
- Right: a **"Refresh"** button (white bg, `#EEEBE3` border, refresh icon + label) that re-fetches both products and categories.

### 3.2 Tab bar
White rounded-2xl bar (`border border-[#EEEBE3] shadow-sm p-2`), tabs laid out `flex gap-1.5 overflow-x-auto` (horizontal-scroll on narrow phones instead of wrapping to uneven rows). Four tabs, each `icon + label`, `px-4 py-2.5 rounded-xl font-black text-sm`:

| key | label | icon |
|---|---|---|
| stock | Stock Management | Package |
| products | Add / Edit Products | Layers |
| categories | Categories | Tag |
| analytics | Analytics & Reports | BarChart3 |

Active tab: solid PRIMARY background, white text. Inactive: `text-[#374151]`, hover `bg-[#FAFAF7]`.

State: `activeTab: 'stock' | 'products' | 'categories' | 'analytics'`, default `'stock'`.

---

## 4. Tab 1 — Stock Management

### 4.1 Four summary stat cards
`grid grid-cols-2 sm:grid-cols-4 gap-3`. Each card: white, `rounded-2xl border border-[#EEEBE3] p-4 shadow-sm`, containing a 36×36 (`w-9 h-9`) rounded-xl icon badge, then an uppercase 10px muted label, then a bold 24px (`text-2xl`) value.

| Label | Value | Icon | Icon badge bg | Icon color |
|---|---|---|---|---|
| Total SKUs | `products.length` | Layers | solid PRIMARY | white |
| Total Stock | `sum(stock_quantity) + " Units"` | Box | `bg-emerald-50` | `text-emerald-600` |
| Low Stock Items | count where `0 < stock_quantity <= low_stock_alert` | AlertTriangle | `bg-amber-50` | `text-amber-600` |
| Stock Valuation | `formatCurrency(sum(stock_quantity * price))` | Wallet | `bg-orange-50` | `text-orange-600` |

### 4.2 Search bar
Full-width input, search icon inset left, `placeholder="Search SKU name, category..."`, rounded-2xl. Filters the table by substring match on **name OR category**, case-insensitive.

### 4.3 Filter pills row
`flex flex-wrap items-center gap-2`, four pill buttons + a small square refresh/reset icon button at the end:

| key | label | active style |
|---|---|---|
| all | `All (n)` | solid PRIMARY bg, white text |
| ok | `In Stock (n)` | `bg-emerald-100 text-emerald-700 border-emerald-200` |
| low | `Low Stock (n)` | `bg-amber-100 text-amber-700 border-amber-200` |
| out | `Out of Stock (n)` | `bg-red-100 text-red-700 border-red-200` |

Inactive pills: white bg, `#EEEBE3` border, `#374151` text. The trailing icon button (RefreshCw) resets both the search box and the filter back to "all".

**Stock status classifier** (used everywhere in this module):
```ts
function getStatus(p) {
  if (p.stock_quantity <= 0) return 'out'
  if (p.stock_quantity <= (p.low_stock_alert || 5)) return 'low'
  return 'ok'
}
```

### 4.4 Product table
White card, `rounded-2xl border shadow-sm overflow-hidden`, inner `overflow-x-auto` wrapper so it scrolls horizontally on mobile instead of squeezing columns.

Columns: **Product | Category | Stock Level | Alert At | Selling Price | Actions**
- Header row: `bg-[#FAFAF7]`, 11px uppercase black labels.
- **Product**: bold name.
- **Category**: plain text, em-dash if empty.
- **Stock Level**: a pill, `{qty} Units`, colored by status — emerald/amber/red backgrounds matching the filter pills above.
- **Alert At**: `low_stock_alert` value, plain semibold text.
- **Selling Price**: bold price + a small pencil icon button next to it that jumps to the Add/Edit Products tab pre-filled with this product (same as clicking Edit elsewhere).
- **Actions**: two buttons side by side —
  1. **Adjust** — peach pill button (`bg-[#FFF8F2] text-[#E87020] border-[#FDDBB4]`), a RefreshCw icon + "Adjust" label. Opens the Adjust Stock modal (§6) for this row. If the item is currently low or out of stock, play the `alert` sound the moment this opens.
  2. **History icon** — plain gray circular icon button (History icon only, no label). Opens the Stock Audit Ledger modal (§7) for this row.

Empty/loading states: a centered single row spanning all columns saying "Loading inventory..." or "No products found."

---

## 5. Tab 2 — Add / Edit Products

Two-column layout: `grid grid-cols-1 lg:grid-cols-5 gap-6` (stacks to one column below `lg` / 1024px so it works on tablets and phones too — don't use `xl` here, it excludes too many laptop widths).

### 5.1 Left panel (`lg:col-span-2`) — the form
White card, `rounded-2xl border shadow-sm p-6 space-y-4`.

**Header row inside the card**: a 40×40 peach (`bg-[#FFF8F2]`) rounded-xl icon badge with a PRIMARY-colored Layers icon, next to:
- Title: **"Add New Product to Catalog"** when creating, or **"Edit Product"** when editing an existing row (plus a small **"+ New Product"** text link on the right that clears the form back to add-mode).
- Subtitle: *"Set pricing, stock and category for this item."*

Inline success/error banner (green or red pill) shows after a save attempt.

**Fields, in this exact order:**

1. **Product Name \*** — text input, required, placeholder `"e.g. Salwar Kameez Set"`.
2. Two-column row (`grid-cols-2`):
   - **Category** — a `<select>` populated from active categories, first option `"Select Category"`.
   - **Low Stock Alert** — number input, min 0.
3. Three-column row (**stacks to one column on phones**, `grid-cols-1 sm:grid-cols-3`):
   - **Selling Price \*** — number input, step 0.01, required, placeholder `"0.00"`.
   - **Cost Price** — number input, step 0.01, optional, placeholder `"0.00"`.
   - **Current Stock** — number input, visually distinct: emerald border + faint emerald tint background, label prefixed with a small Box icon in emerald. This field is editable both when adding a new product and when editing an existing one directly (in addition to the dedicated Adjust Stock modal).
   - Helper caption directly under this row: *"Cost price is for your records only — not used in billing."*
4. **Description / Notes (Optional)** — `<textarea>`, 2 rows, placeholder `"Product material, care instructions, or rack location notes..."`.
5. **Type toggle** — two big equal-width buttons side by side, labelled **"📦 Product"** and **"✂️ Service"**. Selected state: Product = solid blue (`bg-blue-500`), Service = solid purple (`bg-purple-500`), both white text. Caption underneath: *"Products = physical items sold. Services = tailoring, stitching, alterations."*
6. **Active checkbox** inside a light gray (`bg-[#FAFAF7]`) bordered box: *"Active (visible in Billing Panel)"* — unticking this hides the item from the point-of-sale/billing screen elsewhere in the app without deleting it.
7. **Buttons row**: a full-width solid-PRIMARY **"Add Product"** / **"Update Product"** submit button (label swaps based on add vs edit mode, shows "Saving..." while in flight, disabled during save), plus — **only visible while editing** — a small red delete icon button next to it that asks `Delete "{name}"? This cannot be undone.` before calling delete.

### 5.2 Right panel (`lg:col-span-3`) — live product catalog list
White card. Header row: **"Product Catalog (n)"** on the left, a search box on the right (`flex-wrap` so it drops to its own line on narrow screens rather than clipping).

Scrollable list (`max-h-[600px] overflow-y-auto`), one row per product:
- Left: bold name + category (or "No category") underneath, small text.
- Right, in a horizontal cluster: price (bold) stacked over a colored "Stock: n" line (emerald/amber/red matching status), an optional gray **"Hidden"** pill if `is_active` is false, an Edit pencil icon button, and a red Trash icon button (same delete-confirm behavior as above).
- Whichever row is currently loaded into the edit form gets a highlighted background (`bg-orange-50`) and a left accent border in PRIMARY.

---

## 6. Tab 3 — Categories

`grid grid-cols-1 md:grid-cols-2 gap-6`.

**Left card — Add Category**: heading with a PRIMARY plus icon, a single-row form: text input (placeholder `"e.g. Blouse, Saree, Lehenga"`, required) + a solid PRIMARY **"Add"** button (hover darkens to PRIMARY_DARK). New categories get `sort_order = max(existing) + 1` and `is_active = true`. A green success caption appears for ~3 seconds after adding.

**Right card — All Categories (n)**: a list, one row per category —
- Normal state: bold category name on the left; on the right, an Edit pencil icon, a pill button showing **"Active"** (emerald) or **"Inactive"** (gray) that **toggles** `is_active` on click, and a red Trash delete icon (confirms `Delete category "{name}"?` first).
- Edit state (triggered by the pencil): the name becomes an inline text input with autofocus, plus a small solid-PRIMARY **"Save"** button and a plain **"✕"** cancel button.

---

## 7. Tab 4 — Analytics & Reports

A sub-component that independently fetches from `inventory_logs` filtered by a date range (default: last 7 days), joined to the product's name/category.

### 7.1 Filter + export bar
White card, `flex flex-wrap justify-between`.
- Left: five date-range pill buttons — **All Time / Today / This Week / This Month / Custom** — active one filled solid PRIMARY, plus a small refresh icon button. Picking a preset recomputes `fromDate`/`toDate`; picking **Custom** reveals a second row with two native `<input type="date">` fields (From / To).
- Right (`flex-wrap` so the two buttons stack on narrow phones): **"Export Snapshot CSV"** (light emerald button) downloads a CSV of the *current* product list (id, name, category, stock, alert level, price, purchase price, computed status, last updated). **"Export Movements CSV"** (solid PRIMARY/black button) downloads the *currently filtered* ledger rows (date/time, type, product, category, qty delta, before, after, note).

### 7.2 Four summary cards
Same visual style as §4.1, computed from the logs in the current date range:

| Label | Formula | Icon | Badge |
|---|---|---|---|
| Incoming Stock | sum of all positive `adjustment` values | Box | emerald |
| Units Sold (POS) | sum of `abs(adjustment)` where `reason = 'sale'` | Package | purple |
| Lost / Damaged | sum of `abs(adjustment)` where `reason = 'loss'` | AlertTriangle | red |
| Net Stock Delta | sum of all `adjustment` values (signed) | TrendingUp | solid PRIMARY, white icon |

### 7.3 Movement Audit Ledger table
Card header: **"Movement Audit Ledger (n)"** + a search box (matches product name/category) + a **"All Types"** `<select>` filter (values: restock, sale, return, manual_adjustment→"Reconciliation", loss) — both controls `flex-wrap` on mobile.

Table columns: **Date & Time | Type | Product | Category | Qty Delta | Before → After | User | Notes**. Type is a colored pill using this label/badge map (reused everywhere a `reason` is displayed):

```
restock            -> "Restock"            emerald pill
sale               -> "Sale (POS)"         blue pill
return             -> "Return"             purple pill
loss               -> "Loss / Damaged"     red pill
manual_adjustment  -> "Reconciliation"     amber pill
```
Qty Delta is green with a leading `+` if positive, red otherwise. "User" currently just shows a static "Admin" label (wire up real actor names if you track authenticated users).

### 7.4 Two static analytics cards
`grid md:grid-cols-2 gap-5`, computed from the **full current product list** (not date-filtered):
- **Highest Stock Value (Current)** — top 5 products by `stock_quantity * price`, each row: rank badge circle, name, "{qty} units • {price}/unit", and the computed value in bold emerald on the right.
- **Stock by Category (Current)** — total stock summed per category, sorted descending, each row: a colored dot (cycling through orange/emerald/blue/purple/pink), category name, and "{qty} items" with the number in purple.

---

## 8. Adjust Stock modal

Opens from the **Adjust** button in the stock table. Centered fixed overlay (`bg-black/50 backdrop-blur-sm`), card `max-w-md`, **no forced inner scrolling** — every element is sized to fit without a scrollbar (compact paddings/font sizes throughout: this was an explicit design requirement).

**Header** (solid PRIMARY bar): a sliders icon in a translucent white badge, title **"Adjust Inventory Stock ({YourBrandName})"**, subtitle *"Restock, remove stock, or reconcile physical count"* in PRIMARY_SUBTLE, and a circular X close button on the right.

**Body:**
1. **Product / Current Stock strip** — peach box (`bg-[#FFF8F2] border-[#FDDBB4]`), split left/right: left shows the label "Product", the product name (bold), and a small peach category pill; right shows "Current Stock" and the live quantity in large bold text with a small "units" suffix.
2. **"Select Adjustment Type \*"** — a 2-col (mobile) / 4-col (`sm:` and up) grid of four selectable cards. Each card: a small circular icon badge, a bold label, and a tiny sub-caption (sub-caption hidden below the `sm` breakpoint to save space). Selecting one changes the card's border+background+icon color to its assigned color and resets the quantity field.

   | key | label | sub-caption | icon | color when selected |
   |---|---|---|---|---|
   | restock | Restock | + Add Units | Plus | emerald |
   | return | Customer Return | + Add Units | RotateCcw | purple |
   | loss | Loss / Damaged | − Deduct Units | Minus | red |
   | reconciliation | Reconciliation | Set Exact Count | Target | blue |

3. **Quantity box** — background/border tinted to match the selected type's color. Label text changes per type:
   - restock → *"Quantity to Add (Restock) \*"*
   - return → *"Quantity to Add (Return) \*"*
   - loss → *"Quantity to Deduct (Loss / Damaged) \*"*
   - reconciliation → *"New Exact Stock Count \*"*

   A stepper row: a `−` button, a centered numeric input (border matches the type color), a `+` button.

   Below it (**hidden for reconciliation**): a row of "Quick:" preset chips **+1 / +5 / +10 / +25 / +50 / +100** that set the quantity directly; the currently-matching value is highlighted solid in the type's color.

   Below that, a live preview strip: *"Current: {n} → New: {n}"* plus a small colored delta badge (green `+n` / red `−n`).

4. **"Adjustment Note / Reason Description (Optional)"** — free text input, placeholder *"e.g. Received new stock shipment / batch delivery"*.
5. Inline red error banner if validation fails.

**Footer**: a gray **"Cancel"** button and a solid-PRIMARY **"Confirm {TypeLabel} (±n Units)"** button with a checkmark icon — the label text dynamically includes the exact delta about to be applied. Disabled while saving or if the entered quantity doesn't parse.

**Business logic** (this is the exact math — implement it precisely):
```ts
function computePreview(adjustType, qtyString, currentStock) {
  const n = parseFloat(qtyString)
  if (isNaN(n)) return null
  if (adjustType === 'reconciliation') {
    const newStock = Math.max(0, n)              // qty IS the new absolute count
    return { newStock, delta: newStock - currentStock }
  }
  if (adjustType === 'loss') {
    const newStock = Math.max(0, currentStock - n)
    return { newStock, delta: -Math.min(n, currentStock) }
  }
  // restock or return: qty is an amount to ADD
  return { newStock: currentStock + n, delta: n }
}
```
`reasonForType`: `restock`→`'restock'`, `return`→`'return'`, `loss`→`'loss'`, `reconciliation`→`'manual_adjustment'`.

**On confirm** (must be atomic in intent — if the second step fails, surface the error, don't silently leave the log missing):
1. `UPDATE products SET stock_quantity = newStock, updated_at = now() WHERE id = product.id`
2. `INSERT INTO inventory_logs (product_id, old_quantity, new_quantity, adjustment, reason, reference_id) VALUES (...)` — `old_quantity` is the stock value **before** step 1 ran, `adjustment = newStock - old_quantity`, `reference_id` is the optional note (or null).
3. Play a success sound, close the modal, re-fetch the product list. On any error from either step, show the real database error message (not a generic fallback) and play an error sound.

---

## 9. Stock Audit Ledger modal

Opens from the small history-icon button in the stock table. Centered overlay, card `max-w-lg`, `max-h-[92vh]` with the **body** scrollable (this one is fine to scroll — the list is unbounded, unlike the Adjust modal).

**Header** (solid PRIMARY bar): a Clock icon badge, title **"Stock Audit Ledger"**, subtitle **"{YourBrandName} Immutable History"** in PRIMARY_SUBTLE, close X button.

**Body:**
- "Target Product" label (PRIMARY-colored), product name (large bold), category pill, and *"Live Stock: {n} Units"*.
- A divider, then up to the 50 most recent `inventory_logs` rows for this product (newest first), each in its own bordered card:
  - Top row: the reason pill (same label/badge map as §7.3) on the left, formatted date+time on the right.
  - Second row: an up/down arrow icon + signed delta (green/red) on the left, "{old} → {new}" bold on the right.
  - The note text in a muted gray strip (or *"No note added"* if empty).
  - *"By: Admin"* (wire to a real actor name if available).
- Empty state: *"No movements recorded for this product."*

---

## 10. Low Stock Alarm (global, not scoped to this page alone)

A separate top-level component, mounted **once** at the root of your authenticated app shell (not inside the Inventory page itself), so it can fire right after login before the user has even opened Inventory.

**Trigger rule — exact and easy to get wrong:** it must fire in exactly two situations and *no others*:
1. On the component's initial mount (i.e., right after the user logs in), regardless of which tab/page loads first.
2. Every time the user's active-tab state changes **to** `"inventory"` specifically — not on any other tab change.

Implementation pattern: accept a `triggerKey` prop equal to whatever tab-key state your app already tracks; inside a `useEffect` keyed on `[triggerKey]`, use a `useRef` flag to detect "is this the very first run" — on the first run always check, on every later run only check if `triggerKey === 'inventory'`, otherwise return early without querying.

**Query**: all `products` where `is_active = true` and `stock_quantity <= (low_stock_alert || 5)` (this single condition already covers both "low" and "out of stock" — 0 is always ≤ the alert threshold). Exclude any product ID already in an "acknowledged" set.

**Acknowledgment persistence**: store acknowledged product IDs in `sessionStorage` (not `localStorage` — should reset each new browser session), under one key, as a JSON array. When the user dismisses the alarm, add every currently-shown item's ID to that set. This means: once dismissed, the *same* low-stock items won't re-trigger the alarm again this session, but a *different* item newly crossing into low/out-of-stock will.

**Audio**: play a beep immediately when the alarm appears, then repeat every 2.5 seconds until dismissed. **Do not** create a new `AudioContext` on every beep — browsers cap the number of live contexts (~6 in Chrome) and it will silently stop working after ~15 seconds. Create **one** `AudioContext` (via a ref), reuse/resume it for every beep, and explicitly `.close()` it on unmount. Suggested beep: two quick square-wave tones (880Hz then 660Hz, ~0.16s apart, short gain envelope) — a two-tone "siren" rather than a single flat blip. Respect a global `soundEnabled` flag if your app has a mute setting.

**Visual**: full-screen centered overlay, red-bordered white card, red-to-orange gradient header bar with a warning-triangle icon, title **"Low Stock Alarm Active"**, and a dynamic subtitle:
- both low AND out-of-stock items present → *"{n} out of stock, {m} low stock — restock immediately"*
- only out-of-stock → *"{n} item(s) out of stock"*
- only low-stock → *"{n} item(s) require(s) immediate restocking"*

A small **"Alarm Sounding"** badge with a speaker icon shows in the header on `sm`+ screens only (hidden on very narrow phones).

Body: *"The audible alarm and visual alert will sound until acknowledged."* Then a scrollable list of every offending item — icon, name, category on the left; on the right a status pill (**"OUT OF STOCK"** solid red if zero stock, else **"{n} IN STOCK"** amber) and *"Alert limit: {n}"* beneath it.

Footer: a caption *"Silences sound until next new low-stock item."* and a full-width red **"Silence Alarm & Acknowledge"** button (speaker-mute icon) that stops the interval, saves the acknowledged IDs, and hides the modal. On phones the button stacks above the caption (`flex-col` → `sm:flex-row`) so a long button label never gets squeezed into a narrow column next to fixed-width caption text.

---

## 11. Cross-cutting behavior notes

- **Error surfacing**: never swallow a Supabase error silently. A common bug pattern to avoid: `catch (err: any) { ... err.message ... }` looks fine but if you ever `catch (err: unknown)` and check `err instanceof Error`, note that Supabase/PostgREST errors are plain objects, **not** `Error` instances — that check will always be false and hide the real message. Write a small helper that also checks for a `.message` string property on any object before falling back to a generic string.
- **RLS**: if admin auth in your app is a client-side credential check rather than real backend auth, every table this module touches needs policies granted to the `anon` role, not just `authenticated`. This is the single most common "the button does nothing and nothing shows in the ledger" bug.
- **Mobile**: nothing in this module should force a horizontal page scroll or an unreachable off-screen button. Specifically: tab bar scrolls horizontally rather than wrapping; multi-column form rows collapse to one column below `sm`; the 4-across adjustment-type grid becomes 2×2 below `sm`; button/caption pairs that don't fit side-by-side stack vertically instead of squeezing; modal header text containers get `min-w-0` so long names can't push the close button off-screen.
- **Currency**: swap `formatCurrency` for whatever your project already uses; don't hardcode a currency symbol into this module.
- **All monetary/quantity inputs** are plain `<input type="number">` with `min="0"`, not custom steppers, except the Adjust modal's quantity field which additionally gets dedicated `−`/`+` buttons and preset chips.

---

## 12. Copy reference (exact strings, for pixel/word-for-word fidelity)

- Page title: "Inventory & Products"
- Tabs: "Stock Management" / "Add / Edit Products" / "Categories" / "Analytics & Reports"
- Stat labels: "Total SKUs", "Total Stock", "Low Stock Items", "Stock Valuation"
- Search placeholder (Stock tab): "Search SKU name, category..."
- Filter pills: "All (n)", "In Stock (n)", "Low Stock (n)", "Out of Stock (n)"
- Table headers: "Product", "Category", "Stock Level", "Alert At", "Selling Price", "Actions"
- "Adjust" / history icon (no label)
- Form card title: "Add New Product to Catalog" / "Edit Product", subtitle "Set pricing, stock and category for this item."
- "Cost price is for your records only — not used in billing."
- "Products = physical items sold. Services = tailoring, stitching, alterations."
- "Active (visible in Billing Panel)"
- "Product Catalog (n)"
- "All Categories (n)"
- Adjust modal title: "Adjust Inventory Stock ({Brand})", subtitle "Restock, remove stock, or reconcile physical count"
- "Select Adjustment Type *"
- Adjustment note field label: "Adjustment Note / Reason Description (Optional)"
- Ledger modal title: "Stock Audit Ledger", subtitle "{Brand} Immutable History"
- "Target Product", "Live Stock: {n} Units", "No movements recorded for this product.", "No note added", "By: Admin"
- Alarm modal title: "Low Stock Alarm Active", "Alarm Sounding", "The audible alarm and visual alert will sound until acknowledged.", "Silences sound until next new low-stock item.", "Silence Alarm & Acknowledge"
