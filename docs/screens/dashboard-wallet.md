# Dashboard + Wallet — code-true component inventory
> Generated from app code @ aef6e84 (2026-06-11). Regenerate by asking Claude to "sync the map from code".

## DASHBOARD (Home)
1. Header — typewriter greeting "Hello, [firstName]." + Settings gear (→ /(tabs)/settings) + Bell with orange badge (→ Alerts modal)
2. Error card (conditional) — "Failed to load dashboard. Pull down to retry."
3. Revenue Today card — matte-dark hero, two halves: LEFT "Revenue" + count-up amount + "View sales" (→ sales); RIGHT "Tokens" shimmer count + "available" + meter + "500 free/day · 30 left" (→ settings?to=usage). Data: useDailyRevenue, tokensAvailable/UsedToday/FreePerDay
4. "View analytics" link + chevron → /(tabs)/analytics
5. Stats row — Messages tile (all_time_count, → chats) | Pending Sales tile (pending.data, → sales)
6. Lagbot Toggle card — 64px logo (jump anim), "Lagbot" + status dot (green Online / grey Offline by waConnected), iOS switch (toggleNova, optimistic), typewriter feedback line ("Now responding to customers" / "Lagbot paused" / WhatsApp status)
7. Section divider — hairline + orange dot
8. Active Skills — 3-column tile grid: filled tile = skill PNG + orange glow halo + name; empty slot = plus icon + "Add skill". Tap → /(tabs)/skills. Dim when paused.
9. Recent Chats white panel — header "Recent Chats" + "View all" + "+N"; rows = avatar w/ orange slash if AI active, name, relative time, optional "Responded" pill + tag chip (Quoted/Paid/Archive), 2-line preview, unread badge. Empty: dashed pill "No conversations yet". Tap row → chats with convId.

### Alerts modal (bell)
Handle bar · eyebrow "Notifications" · title "Alerts" · subtitle "You're all caught up…" or "N items need your attention."
Rows: Out of tokens ("Lagbot can't reply…", → settings usage) · Low tokens <70 ("About N left — roughly one customer…") · Lagbot paused ("Customers aren't getting AI replies.", tap toggles) · Pending sales ("N customers waiting. Reply before they go cold.", → chats) · Low stock per product ≤3 ("Only N units left", → inventory) · All clear (green check, "Everything's running smoothly.")

## WALLET — SETUP MODE (no bank + wallet not active)
1. Eyebrow "Wallet" · Title "Get set up"
2. Preview hero (dark) — "Preview" / "₦0.00" / "Ready when you are."
3. Lead: "Your AI-powered business finance. Lagbot tags every payment for your taxes, so when your accountant asks, the answer is ready."
4. "How it works" checklist ×3: 1 Connect your bank ("Add your account in Settings…") · 2 Verify with Paystack ("Under a minute. Bank-grade KYC…") · 3 Start receiving ("Payments land here, tagged for tax.")
5. CTA "Add bank account" → settings?to=bank-details&returnTo=wallet
6. Trust footer: "Powered by Paystack. Naira-first. Bank-grade encryption."

## WALLET — ACTIVE MODE
1. Eyebrow "Wallet" · Title "Lagbot Wallet" · sub "Customer payments collect here."
2. Hero (dark) — LEFT: count-up balance (compact ₦62k/₦1.2M) + "Available"; divider; RIGHT: orange "+[dailyBonusRate]" + "Tokens earned / day"; COIN BURST on first open (1 coin per ~100 tokens/day, max 8). Earn footer (rotating typewriter): "≈ X customers handled free, every day" / "+N tokens land here daily" / "₦1,000 held ≈ 1 free token every day" / "N bonus tokens ready to spend" / "Bonus tokens never expire — they bank up" → settings?to=usage
3. CTA "Withdraw to bank" + arrow icon → WithdrawModal (alert "Nothing to withdraw…" if ₦0). Caption "To [account_name] · [bank_name] ••••[last4]"
4. Month summary row (conditional) — "This month" + amount + % breakdown sentence | "Export" pill → alert "A FIRS-ready CSV… will email to you. (Coming soon.)"
5. Ledger — header "Ledger" + "[N] transactions"; filter all/settled/pending. Empty: "Your first customer payment will land here. Lagbot tags it for you automatically." Cards: avatar initials, name, description + relative time, amount (+green / −muted), status pill only when not success (Pending orange / Failed red), tax category label GOODS/SERVICES/REFUND. 3D wheel-tilt scroll effect.
- DEMO DATA: when bank set but API has no real wallet → hardcoded demo transactions render (₦62k, ₦18k pending, ₦125k, ₦45k, ₦30k, ₦270k, ₦56k, −₦80k). Flag for App Review.
- Old "Settles tomorrow / ₦18,000 settled" UI: REMOVED from code.

### Withdraw modal
Eyebrow "Withdraw" + X · title "How much to your bank?" · bank line "[bank] · ****[last4]" or "No bank set yet. Add one in Settings." · ₦ + amount input (number pad) · "Available: ₦X" + MAX pill · confirm "Withdraw ₦[amount]" → POST /api/wallet/withdraw (⚠ backend route missing) → success "On its way. Should land within 10 minutes." · fine print "No fees. Payouts land in your bank within minutes."

Data: GET /api/wallet (status, balances, transactions) · business_config.bank_details · tokenState/tokenConfig from AppContext.
