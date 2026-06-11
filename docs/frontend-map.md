# Lagbot Mobile — Complete Frontend Architecture Map

> Generated 2026-06-10 from source at commit `2f4eafe` (main).
> Scope: every screen, route, interactive element, navigation path, and every point where the UI hands off to the backend (Node.js REST API) or Supabase (Auth/DB/Realtime).

---

## 1. System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│  React Native / Expo App (Expo Router 6, NativeWind)                 │
│                                                                      │
│  app/(welcome) → app/(auth) → app/(onboarding) → app/(tabs)          │
│                                      └── app/(product)               │
│                                                                      │
│  Global state: src/context/AppContext.tsx                            │
│  Services: api.ts (REST) · database.ts (Supabase) · oauth.ts         │
└──────────┬──────────────────────────────┬────────────────────────────┘
           │                              │
           ▼                              ▼
┌─────────────────────┐    ┌──────────────────────────────────────────┐
│ Supabase            │    │ Node.js Backend (port 18790, via ngrok)  │
│ - Auth (JWT, OTP,   │    │ - Auth middleware: Supabase JWT →        │
│   OAuth PKCE)       │    │   userId → businessId                    │
│ - Postgres + RLS    │    │ - Evolution API client (WhatsApp)        │
│ - Realtime (messages│    │ - Claude Haiku (AI replies)              │
│   INSERT events)    │    │ - Paystack (planned)                     │
└─────────────────────┘    └──────────────────────────────────────────┘
```

**Data-flow convention** (memory: confirmed pattern): **reads go directly to Supabase** (RLS-scoped), **writes/actions go through the backend REST API** — except simple CRUD (products, team members, config) which writes Supabase directly.

---

## 2. Route Tree

```
app/
├── _layout.tsx                 ← AuthGate: session + onboarding routing (see §3)
├── (welcome)/index             ← marketing carousel, signup/login entry
├── (auth)/
│   ├── index                   ← animated splash + parallel session check
│   ├── login
│   ├── signup
│   └── verify?email=…          ← 6-digit OTP
├── (onboarding)/
│   ├── index                   ← intro
│   ├── setup                   ← 6-step wizard (name→type→tone→WA→phone→pairing)
│   ├── whatsapp-info           ← education page (re-entry allowed post-onboarding)
│   ├── add-product             ← step 2 of 4
│   ├── configure-nova          ← step 3 of 4
│   ├── activate-skill          ← step 4 of 4
│   └── complete                ← summary, sets onboarding flag
├── (tabs)/                     ← custom floating dock (5 visible tabs)
│   ├── index                   ← boot redirect (hidden)
│   ├── dashboard  │ chats  │ inventory  │ sales  │ wallet     (visible tabs)
│   ├── skills     │ analytics │ admins  │ settings            (hidden, pushed)
└── (product)/
    ├── new                     ← create/edit product (?id= for edit)
    └── import                  ← bulk CSV/Excel/PDF import
```

### Floating Dock (app/(tabs)/_layout.tsx)
| # | Tab | Icon | Badge | Notes |
|---|-----|------|-------|-------|
| 1 | Dashboard | HomeTabIcon | — | |
| 2 | Chats | ChatsTabIcon | unread count | |
| 3 | Inventory | InventoryTabIcon | — | |
| 4 | Sales | SalesTabIcon | — | |
| 5 | Wallet | WalletTabIcon | — | |

Hidden routes (`href: null`, dock hidden on entry): `index`, `skills`, `analytics`, `admins`, `settings`. Dock collapses on scroll (90px range, spring snap), swipe-across gesture moves the active lozenge.

---

## 3. AuthGate Decision Tree (app/_layout.tsx)

```
session === undefined            → LoadingScreen (auth check in flight, 3s trust + 7s hard timeout)
session === null                 → allow (welcome)/(auth), else replace → /(welcome)
session && onboardingDone===null → LoadingScreen (checking flag)
session && onboardingDone=false  → trap in /(onboarding) (allow (auth) for signup→verify)
session && onboardingDone=true   → kick out of (welcome)/(auth)/(onboarding) → /(tabs)
                                   EXCEPT re-entry allowed: onboarding/whatsapp-info, onboarding/setup
```

- **Onboarding flag:** AsyncStorage `@lagbot/onboarding_v1_${userId}`; fallback: if `business_config` row exists in DB → considered onboarded (`_layout.tsx:129-160`).
- **SIGNED_OUT** event clears all `sb-*` AsyncStorage keys (prevents stale-token loops).
- **Push token registration:** on first signed-in session → `dbBusiness.updateConfig({ push_token })` (best-effort).
- **Notification taps** route by payload: `screen:'sales'` → /(tabs)/sales, `'inventory'` → /(tabs)/inventory, `conversationId`/`customerPhone` → /(tabs)/chats with params.
- **Deep link scheme:** `lagbot://` (OAuth callback `lagbot://auth/callback`).

---

## 4. Entry & Auth Screens

### 4.1 Splash — `/(auth)/index`
- Loading video plays while `auth.getCurrentUser()` (`supabase.auth.getSession()`, local) races a 3s timeout; 7s hard safety timeout.
- Routes: session → `/(tabs)`; no session/failure → `/(auth)/login`.

### 4.2 Welcome — `/(welcome)`
| Element | Action | Backend |
|---|---|---|
| 3-slide auto-carousel + dots | jump to slide | — |
| **Get Started** button | `push('/(auth)/signup')` (`index.tsx:225`) | — |
| **GOOGLE** button | `signInWithGoogle()` → `/(onboarding)` | `supabase.auth.signInWithOAuth({provider:'google'})` + PKCE `exchangeCodeForSession` (`oauth.ts:9-41`) |
| **APPLE** button (iOS) | `signInWithApple()` → `/(onboarding)` | `AppleAuthentication.signInAsync` → `supabase.auth.signInWithIdToken` (`oauth.ts:50-73`) |
| **Log in** link | `push('/(auth)/login')` | — |
| Terms / Privacy links | `Linking.openURL` → lagbot.app/terms, /privacy | external |

### 4.3 Login — `/(auth)/login`
| Element | Action | Backend |
|---|---|---|
| Email + Password inputs (eye toggle) | local state | — |
| **Log In** button | `handleLogin()` → success: `replace('/(tabs)')` | `supabase.auth.signInWithPassword` (`database.ts:53-61`) |
| **Forgot password?** link | ⚠️ no-op (not implemented) | — |
| Google / Apple buttons | same as Welcome | OAuth as above |

### 4.4 Signup — `/(auth)/signup`
| Element | Action | Backend |
|---|---|---|
| First/Last name, Email, Password (+ live checklist: 6 chars, 1 uppercase, 1 number/symbol) | local state | — |
| **Next** button | → `push('/(auth)/verify?email=…')` | `supabase.auth.signUp` (sends 6-digit code; detects already-registered via empty `identities`) (`database.ts:19-37`) |
| Google / Apple buttons | → `/(onboarding)` | OAuth as above |

### 4.5 Verify — `/(auth)/verify?email=`
| Element | Action | Backend |
|---|---|---|
| 6-box OTP input (paste-aware, backspace nav) | local state | — |
| **Verify** button | success → session set → AuthGate routes to `/(onboarding)` | `supabase.auth.verifyOtp({type:'signup'})` (`database.ts:41-45`) |
| **Resend code** (45s cooldown) | — | `supabase.auth.resend({type:'signup'})` (`database.ts:48-51`) |
| **Change Email** link → bottom sheet | re-sends to new address | — |

---

## 5. Onboarding Flow

```
/(onboarding) → setup (steps 0-5) ──WhatsApp paired or "connect later"──┐
                  │ Learn More → whatsapp-info                          │
                  ▼                                                     ▼
        add-product → configure-nova → activate-skill → complete → /(tabs)
        (each step skippable; complete/setup set the AsyncStorage flag)
```

### 5.1 Setup Wizard — `/(onboarding)/setup` (6 internal steps)
| Step | Element | Action | Backend |
|---|---|---|---|
| 0 Name | TextInput, auto-advance | — | `businesses.update({business_name})` (`setup.tsx:375`) |
| 1 Type | OptionCards (Retail/Food/Fashion/Services/Other) | auto-advance | `business_config` upsert `{industry}` (`setup.tsx:427`) |
| 2 Tone | OptionCards (Friendly/Professional/Sales-Focused) | auto-advance | `business_config` upsert `{tone}` (`setup.tsx:438`) |
| 3 Connect WA | **Connect WhatsApp** btn; **Learn More** → whatsapp-info; **"I'll connect later"** → `finishOnboarding()` → /(tabs) | step++ | — |
| 4 Phone | NG-only +234 selector, 11-digit input, **Continue** | step++ | `businesses.update({phone_number})` (`setup.tsx:376-377`) |
| 5 Pairing | code display, **Copy**, countdown (160s), **Change number** | auto-finish on connect | **POST `/api/whatsapp/pairing-code`** `{phoneNumber}`; then polls **GET `/api/whatsapp/status`** every 3s ×60; `connected:true` → `finishOnboarding()` (`setup.tsx:300-323`) |

Back on step 0 opens **SignOutSheet** ("Leave setup?" → sign out).

### 5.2 Secondary steps
| Screen | Key elements | Backend |
|---|---|---|
| **add-product** (2/4) | name/price/stock/category form, **Add Product**, **Continue**, Skip | `products.insert(...)` per add (`database.ts:269-276`) |
| **configure-nova** (3/4) | AI name input, business instructions textarea, **Save & Continue**, Skip | prefill via `business_config` select; save via `business_config` upsert `{ai_name, ai_instructions}` |
| **activate-skill** (4/4) | skill cards w/ toggles (max 3), **Continue**, Skip | `skills` select (catalog), `user_skills` select/upsert/update (`database.ts:569-649`) |
| **complete** | summary card (WA/products/Nova/skills), **Go to Dashboard →** | reads business + products + config + user_skills; sets onboarding flag on mount & on press |

---

## 6. Dashboard — `/(tabs)/dashboard`

| Element | Action | Backend |
|---|---|---|
| Header **Settings** gear | `push('/(tabs)/settings')` | — |
| Header **Bell** (+ badge when alerts) | opens Alerts sheet | — |
| **Revenue Today** card (left half) | `push('/(tabs)/sales')` | `useDailyRevenue()` ← confirmed sales 7D (Supabase, 60s stale) |
| **Tokens** card (right half) | `push settings?to=usage&returnTo=dashboard` | `tokenState`/`tokenConfig` from AppContext (`vendor_token_state`, `token_config`) |
| **Messages** stat tile | display | `message_count_realtime` select (60s stale) |
| **Pending Sales** stat tile | display | `pending_sales` select count (30s stale + 30s poll) |
| **Lagbot toggle card** (switch) | `toggleNova()` — optimistic, reverts on error | **POST `/api/ai/resume`** or **POST `/api/ai/pause`** (`AppContext.tsx:256-284`) |
| **Active Skills** grid (3 slots) / **Manage** link | `push('/(tabs)/skills')` | reads `activeSkills` from AppContext |
| **Recent Chats** rows (≤3) / **View all** | stash conv → `push('/(tabs)/chats', {convId})` | `getRecentConversations(3)` (20s stale) |
| Pull-to-refresh | `refreshAll()` | re-runs all dashboard fetchers |

**Alerts sheet** rows (each navigates then dismisses): out of tokens → settings/usage · low tokens → settings/usage · Lagbot paused → `toggleNova()` · pending sales → chats · low stock (≤3 units, one per product) → inventory.

**AddFirstProductSheet** (auto on empty inventory): **Add** → `/(product)/new`; **Skip** → AsyncStorage `@lagbot/skipped_first_product_v1_{userId}`.

---

## 7. Chats — `/(tabs)/chats`

### 7.1 Conversation list
| Element | Action | Backend |
|---|---|---|
| **Search** toggle + input | filters by name/last message | — (client-side) |
| **WA status pill** (when disconnected) | → onboarding setup step 3 | `useWhatsAppStatus()` polls **GET `/api/whatsapp/status`** every 30s |
| Stat pills (Today / Unread / Leads·7d) | display | derived |
| Tag filter pills (**All/Lead/Quoted/Paid/Archive**) | client filter | — |
| **ConversationRow** tap | open thread | — |
| **ConversationRow** swipe-right | archive/restore (optimistic) | **PATCH `/api/conversations/:id/archive`** `{archived}` (`chats.tsx:71`, `api.ts:235-240`) |
| Pull-to-refresh / Retry | `refresh()` | re-fetch below |

**Data:** `conversations` select (business, by `last_message_at` desc, limit 100) + last 5 `messages` per conversation (15s stale). **Realtime:** Supabase channel on `messages` INSERT → cache invalidation. Deep-links: `convId` (handoff cache for zero-latency) or `conversationId`/`customerPhone` from push.

### 7.2 Thread view
| Element | Action | Backend |
|---|---|---|
| **Back** | close thread, refresh list | — |
| Customer identity tap | open **CustomerSummarySheet** | — |
| **AI On/Off** pill | handoff toggle | `conversations.update({status:'active'\|'manual'})`; on →manual also `human_interventions` insert (`chats.tsx:561-589`) |
| **Smart-reply chips** (manual mode, inbound last) | fill composer (no auto-send) | **POST `/api/conversations/:id/smart-replies`** (`SmartReplyStrip.tsx:48`) |
| Composer **Send** | optimistic bubble; flips conv to manual if AI was on | **POST `/api/whatsapp/send`** `{to, message}`; + `conversations.update({status:'manual'})` + `human_interventions` insert (`chats.tsx:591-632`) |
| Pull-to-refresh | reload messages | `messages` select by conversation |

Thread open: `messages` select all + `conversations.update({unread_count: 0})`. Realtime: `messages` INSERT filtered by `conversation_id` appends live.

**CustomerSummarySheet:** stats (spend/messages/first-seen), extracted details, per-day history timeline → **DayDetailModal** (read-only day thread). All derived from already-loaded messages; no extra backend calls.

---

## 8. Inventory — `/(tabs)/inventory` and `(product)` group

### 8.1 Inventory
| Element | Action | Backend |
|---|---|---|
| Hero stats (Total/Low stock/Value) | display | `useProducts()` ← `products` select active (30s stale) |
| **Search** / **Add** / **Import** buttons | search bar · `push('/(product)/new')` · `push('/(product)/import')` | — |
| Category pills | client filter | — |
| Product row tap | open **ProductDetailSheet** | — |
| Sheet **Edit Product** | `push('/(product)/new?id=…')` | — |
| Sheet **Delete Product** | Alert confirm → delete | `products.update({active:false})` soft-delete + cache invalidate (`inventory.tsx:137-155`) |

### 8.2 New/Edit Product — `/(product)/new[?id]`
- Fields: photo (⚠️ picker stubbed — "coming soon"), category tiles, sizes/colors chip inputs, ₦ price (min 100), stock stepper, description.
- **Submit** → `products.insert(...)` (create) or `products.update(id, ...)` (edit) → `replace('/(tabs)/inventory')`.

### 8.3 Import — `/(product)/import`
1. Pick format (CSV/Excel/PDF) → `DocumentPicker` → **POST `/api/products/import`** (raw `fetch` with Bearer token, FormData) → parsed preview (`import.tsx:132-175`).
2. Preview table with row checkboxes / select-all; server parse errors listed.
3. **Import** → loop `products.insert(...)` per selected row → done screen → **Go to Inventory**.

---

## 9. Sales — `/(tabs)/sales` (segmented: Sales | Teams)

### 9.1 Sales view
| Element | Action | Backend |
|---|---|---|
| Revenue hero + period pill (24H/7D/1M/2M/6M) + chart | cycle period | `pending_sales` (confirmed) + `confirmed_sales` selects per period (30s stale) |
| Settlement toggle (Manual/Auto) | persists locally | AsyncStorage only |
| **Pending sale card** tap | open **PendingDetailSheet** | `pending_sales` select status=pending (15s stale, 10s poll) |
| Sheet **Link a product** | **ProductPickerSheet** → select | — |
| Sheet **Confirm Sale** | confirm + cache invalidate | **POST `/api/sales/:id/confirm`** `{linkedProductId?}` (`PendingDetailSheet.tsx:31-43`) |
| **Completed sale card** tap | open **ConfirmedDetailSheet** | — |
| Sheet **Push to Team** | **TeamPickerSheet** → **Send** per member | **POST `/api/whatsapp/send`** `{to, message}` (`TeamPickerSheet.tsx:64-80`) |

### 9.2 Teams view
| Element | Action | Backend |
|---|---|---|
| Member **delete** | Alert confirm | `team_members.delete(id)` |
| **Add team member** → sheet (name, role chips, WhatsApp) | **Save member** | `team_members.insert(...)` |
| Routing rules: row tap → **RuleEditorSheet** (event vocab, target role/person, template) | **Save rule** | **POST `/api/routing-rules`** (new) / **PATCH `/api/routing-rules/:id`** (edit) (`sales.tsx:574-603`) |
| Rule pause switch | optimistic | **PATCH `/api/routing-rules/:id`** `{enabled}` |
| Rule **X** delete | optimistic | **DELETE `/api/routing-rules/:id`** |
| First load | seeds default rules | `routing_rules` select; if empty → N × **POST `/api/routing-rules`** (`sales.tsx:514-559`) |
| Connectors (inDrive/Glovo/Bolt) | ⚠️ "Coming soon" alerts | — |

---

## 10. Wallet — `/(tabs)/wallet`

Two modes: **setup** (no bank details + no active wallet) and **active**.

| Element | Action | Backend |
|---|---|---|
| Load on focus | `fetchWallet()` | **GET `/api/wallet`** (backend stub) + `business_config` read for `bank_details`; falls back to demo data if bank set (`wallet.tsx:412-542`) |
| Hero balance + tokens-earned/day (coin animation) | display | derived: `floor(available/1000)` tokens/day |
| Hero footer metric row | `push settings?to=usage&returnTo=wallet` | — |
| **Withdraw to bank** → WithdrawModal (amount, MAX) → **Confirm** | success alert + silent refresh | **POST `/api/wallet/withdraw`** `{amount_naira}` (`wallet.tsx:1221-1233`) ⚠️ **no backend route exists** |
| Month summary **Export** | ⚠️ "Coming soon" alert | — |
| Setup CTA **Add bank account** | `push settings?to=bank-details&returnTo=wallet` | — |
| Ledger rows | display only (not tappable) | from `/api/wallet` transactions or demo |

---

## 11. Analytics — `/(tabs)/analytics`

| Element | Action | Backend (all Supabase, `Promise.allSettled`) |
|---|---|---|
| Period pills (7D/1M/2M/6M) | reload | — |
| **Response Time** card tap → detail list | `getResponseTimeDetail` | `response_time_metrics` (+ join `conversations`) |
| AI Accuracy card | display | RPC `calculate_ai_accuracy` |
| Customer Satisfaction card | display | `customer_satisfaction` select |
| Human Interventions card | display | `human_interventions` + `conversations` count |
| **Top Customers** card tap → ranked detail | display | `conversations` + `messages` aggregate |
| Pull-to-refresh | `loadAnalytics()` | all of the above + `daily_stats` range select |

---

## 12. Skills — `/(tabs)/skills`

| Element | Action | Backend |
|---|---|---|
| **Back** | `router.back()` | — |
| Active-count hero (N / 3 + progress) | display | AppContext |
| Skill row toggle (disabled at max-3) | optimistic add/remove, reverts on error | `user_skills` upsert (activate) / update `is_active:false` (deactivate) via `skillsDB` (`AppContext.tsx:210-250`) |
| Locked cards (appointment, payments) **Upgrade** | ⚠️ no-op Pressable | — |

---

## 13. Settings — `/(tabs)/settings` (hub + 9 sub-pages, internal `currentSection` state; deep-linkable via `?to=…&returnTo=…`)

### Hub
| Row | → Sub-page | Notes |
|---|---|---|
| Account hero card | profile | |
| WhatsApp | whatsapp-connect (if disconnected) | **Disconnect** btn → **POST `/api/whatsapp/disconnect`** |
| Bank Details | bank-details | |
| Lagbot Persona | persona | |
| Business Info | business-info | |
| Appearance switch | — | `toggleDarkMode()` (local) |
| Tokens | usage | |
| Privacy & Security | blocked-contacts → privacy sections | |
| **Sign Out** | modal → confirm | `supabase.auth.signOut()` + `resetToDefaults()` → `replace('/(auth)/login')` |

### Sub-pages
| Sub-page | Elements | Backend |
|---|---|---|
| **Profile** | photo (label only), name, email, +234 phone, business address, Save/Cancel | `businesses.update({business_name, phone_number})` + `business_config` upsert `{business_address}` + **POST `/api/settings/refresh`** |
| **Persona** | business name (inline confirm), tone radio (Friendly/Professional/Sales), live chat preview, greeting textarea + AI suggestion chips, Save | `businesses.update` + `business_config` upsert `{tone, greeting_message}` + **POST `/api/settings/refresh`** |
| **Business Info** | "Lagbot's brain" textarea, per-day operating-hours editor (open/close times, Open/Closed toggle, live "Open now" pill), Save | `business_config` upsert `{ai_instructions, business_hours}` + **POST `/api/settings/refresh`** |
| **Bank Details** | bank name, 10-digit account number, account name, **Save bank details** (honors `returnTo`) | `business_config` upsert `{bank_details}` + **POST `/api/settings/refresh`** |
| **WhatsApp Connect** | phone input, **Get pairing code** → animated code reveal + copy + 160s countdown | **POST `/api/whatsapp/pairing-code`**; polls **GET `/api/whatsapp/status`** every 3s ×40 → "Connected!" alert |
| **Notifications** | push toggle | off → `business_config` update `{push_token: null}` |
| **Usage (Tokens)** | balance hero, daily free-token meter, breakdown (free/rolled/bonus/purchased), store: Starter ₦4,000 / Growth ₦18,750 / Scale ₦70,000, payment sheet (Card vs Bank transfer) → **Continue to Paystack** | **POST `/api/tokens/purchase/init`** `{pack, channel}` → opens `authorizationUrl` in browser → `refreshTokens()` ⚠️ **backend endpoint missing** |
| **Privacy & Security** | current/new/confirm password, Save; **Danger Zone → Delete Account** | `supabase.auth.updateUser({password})`; delete: **POST `/api/account/delete`** → clear AsyncStorage (`@lagbot/*`, notes) → signOut → `replace('/(welcome)')` |
| **Blocked Contacts** | list + Unblock chips, **Add contact** → picker modal (recent conversations + device contacts, search, multi-select, Done) | `conversations` select (contacts); `Contacts.getContactsAsync` (device); persist: `business_config` upsert `{blocked_contacts}` |

---

## 14. Admins — `/(tabs)/admins`

| Element | Action | Backend |
|---|---|---|
| **Back** / header **+** | back · open Add modal | — |
| Stats (TOTAL, ROLES) | display | `team_members` select on focus |
| Member row **trash** | confirm modal | `team_members.delete(id)` |
| Add modal: name, role chips (Employee/Team Lead/Delivery Driver/Sales Agent/Manager), WhatsApp number → **Add Member** | reload list | `team_members.insert(...)` |

> Note: Admins and Sales→Teams manage the **same** `team_members` table through two different UIs.

---

## 15. Backend Boundary — Complete Reference

### 15.1 REST API calls (src/services/api.ts — all `Authorization: Bearer <Supabase JWT>`, 10s timeout, 3 retries w/ exponential backoff on network errors only)

| Method & Path | Triggered by | Status |
|---|---|---|
| GET `/api/whatsapp/status` | chats header poll (30s), pairing polls (onboarding + settings) | ✅ |
| POST `/api/whatsapp/pairing-code` | onboarding setup step 5; settings WhatsApp connect | ✅ |
| POST `/api/whatsapp/disconnect` | settings hub Disconnect | ✅ |
| POST `/api/whatsapp/send` | chat composer Send; sales Push-to-Team | ✅ |
| POST `/api/ai/pause` / `/api/ai/resume` | Lagbot toggle (dashboard + alerts) | ✅ |
| POST `/api/conversations/:id/smart-replies` | SmartReplyStrip | ✅ |
| PATCH `/api/conversations/:id/archive` | conversation swipe | ✅ |
| POST `/api/sales/:id/confirm` | PendingDetailSheet Confirm Sale | ✅ |
| POST `/api/products/import` | import screen (raw fetch + FormData) | ✅ |
| POST/PATCH/DELETE `/api/routing-rules[/:id]` | sales Teams rule editor + first-load seeding | ✅ |
| POST `/api/settings/refresh` | every settings save (profile/persona/biz-info/bank) | ✅ |
| POST `/api/account/delete` | settings Danger Zone | ✅ |
| GET `/api/wallet` | wallet tab focus | ✅ (backend stub) |
| **POST `/api/wallet/withdraw`** | withdraw modal confirm | ⚠️ **no backend route** |
| **POST `/api/tokens/purchase/init`** | token store Continue to Paystack | ⚠️ **no backend route** |
| **POST `/api/whatsapp/qr`** (`api.initializeWhatsApp`) | nothing | ⚠️ dead code both sides |

### 15.2 Supabase tables touched by the frontend

| Table | Reads | Writes |
|---|---|---|
| `auth.users` (Auth API) | getSession, onAuthStateChange | signUp, signInWithPassword, OAuth, verifyOtp, resend, updateUser(password), signOut |
| `businesses` | getCurrent (by owner_user_id) | update (name, phone) |
| `business_config` | getConfig (tone, greeting, hours, instructions, bank, blocked, push_token) | upsert from onboarding + 6 settings sub-pages |
| `products` | getAll (active) | insert / update / soft-delete (`active:false`) |
| `conversations` | list (100), getById, contacts for block list | `unread_count:0`, `status: active↔manual` |
| `messages` | last-5 per conv, full thread; **Realtime INSERT subscription** ×2 | — (writes go via backend) |
| `human_interventions` | analytics counts | insert on handoff / manual send |
| `skills` / `user_skills` | catalog, active slugs | activate (upsert) / deactivate |
| `vendor_token_state` / `token_config` | token balance + config | — (backend service-role only) |
| `pending_sales` / `confirmed_sales` | pending list, confirmed by period | — (confirm goes via backend API) |
| `team_members` | getAll | insert / delete |
| `routing_rules` | getAll | — (writes via backend API) |
| `daily_stats`, `response_time_metrics`, `customer_satisfaction`, `message_count_realtime` | analytics + dashboard reads | — |
| RPC `calculate_ai_accuracy` | analytics | — |

### 15.3 Caching & polling (src/lib/cache.ts — in-memory SWR-style, session-only)

| Cache key | Stale after | Background poll |
|---|---|---|
| `conversations:{limit}` | 15s | realtime invalidation |
| `whatsapp:status` | 15s | 30s |
| `sales:pending` | 15s | 10s |
| `sales:confirmed:{period}` | 30s | — |
| `products:all` | 30s | — |
| `dashboard:pending-count` | 30s | 30s |
| `dashboard:recent-conversations:{n}` | 20s | — |
| `dashboard:messages`, `dashboard:conv-count` | 60s | — |
| analytics | none | 30s interval |

### 15.4 Backend routes with NO frontend caller (dormant)
`POST /api/auth/signup`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/create-business` (auth delegated to Supabase client) · `GET /api/sales/pending`, `GET /api/sales/confirmed`, `GET /api/dashboard/message-count`, `GET /api/dashboard/ai-accuracy`, `GET /api/dashboard/recent-conversations` (frontend reads Supabase directly) · `GET /api/dashboard/budget`, `GET /api/stats`, `POST /api/test/push` (dev).

---

## 16. Global State (AppContext)

| Field | Source | Mutators → backend effect |
|---|---|---|
| `activeSkills` / `availableSkills` | `skills` + `user_skills` | `addActiveSkill`/`removeActiveSkill` → `user_skills` upsert/update (optimistic, reverts) |
| `novaActive` / `novaToggling` | `business_config.auto_respond` | `toggleNova` → POST /api/ai/pause·resume (optimistic, reverts) |
| `businessContext` | `businesses` + `business_config` | `updateBusinessContext` → both tables |
| `tokenState` / `tokenConfig` / `tokensAvailable` | `vendor_token_state`, `token_config` | `refreshTokens()` (read-only) |
| `darkMode` | local | `toggleDarkMode` (no persistence) |

Loaded on mount and on every `SIGNED_IN` auth event via `loadFromDB()` (6 parallel queries).

---

## 17. Known Gaps & Stubs (found during mapping)

1. **POST `/api/wallet/withdraw`** — called by wallet, route missing on backend (withdrawal silently fails server-side).
2. **POST `/api/tokens/purchase/init`** — called by token store, route missing (Paystack integration pending); UI shows "Checkout not connected yet" on failure.
3. **`api.initializeWhatsApp` → POST `/api/whatsapp/qr`** — dead code (no caller, no route).
4. **Forgot password** link on Login — no-op.
5. **Product image picker** — stubbed ("Image picker coming soon").
6. **Wallet tax CSV export** — "Coming soon" alert.
7. **Sales connectors** (inDrive/Glovo/Bolt) — mocked, "Coming soon".
8. **Locked skills "Upgrade"** button — empty Pressable.
9. **Wallet demo data** — when bank details exist but the API returns no real wallet, the UI shows hardcoded demo transactions (₦508k balance) — worth flagging before App Review.
10. **Two UIs, one table** — Admins tab and Sales→Teams both manage `team_members` with different role chips/styling.
