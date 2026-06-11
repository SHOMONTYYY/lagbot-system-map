# Sales + Analytics + Skills + dock — code-true component inventory
> Generated from app code @ aef6e84 (2026-06-11).

## FLOATING DOCK (tab bar)
Visible: Dashboard · Chats (unread badge, "99+") · Inventory · Sales · Wallet. Hidden (deep-linkable): skills, analytics, settings, admins (→ REDIRECTS to /(tabs)/sales — legacy page removed), index (→ chats). Pill with blur glass + metallic rim; active tab = orange lozenge; labels collapse to icons on scroll; swipe moves lozenge.

## SALES — header + segments
Eyebrow "Sales" · title "Your Sales"/"Your Team" · sub "Pipeline and payments. Mark what is done, push what needs a team." / "Assign contacts to roles. Lagbot hands off the right details automatically." · Segmented "Sales" (pending-count badge) | "Teams" (member-count badge)

### Sales segment
1. Revenue hero (dark) — "Revenue" eyebrow · period pill cycles 24H→7D→1M→2M→6M · compact ₦ amount · optional ±X.X% delta pill (green/red) · bar chart OR "Once Lagbot logs your first sale, the trend appears here."
2. Settlement toggle — Manual (ShieldCheck, "You confirm each payment") | Auto (Zap, "Wallet credit settles it"); helper "Pending sales wait for you to mark them done." / "When the matching payment lands in your Lagbot wallet, the sale moves to Completed automatically." Stored in AsyncStorage (local only).
3. Pending — header + count badge + hint "tap to confirm"/"waiting for payment". Empty: "No pending sales. / When Lagbot confirms an order with a customer, it will land here." SaleCard: avatar ring + name/phone, product or address sub, amount, date+time, orange "Pending" pill. Tap → PendingDetailSheet. 10s auto-refetch.
4. Completed — manual-confirmed + receipt-verified MERGED. Empty: "No completed sales yet. / Pending sales move here the moment they are settled." Green "Confirmed" pill. Tap → ConfirmedDetailSheet.

### PendingDetailSheet
Avatar + name/phone + clock meta · optional green "Receipt Verified" badge · fields Product ("Name × Qty"), Amount (orange), Delivery Address (or "Not provided"), Notes · Product-linking row ("AI detected: [name]" / "[name]" green / "Link a product to update inventory" + Select/Change → ProductPickerSheet) · CTA "Confirm Sale" → pendingSales.confirm()

### ConfirmedDetailSheet
Badge "Receipt Verified" or "Manually Confirmed" · customer + amount + (manual: product/address/notes | receipt: bank name, account name/number on receipt) · secondary CTA "Push to Team" → TeamPickerSheet

### TeamPickerSheet
"Push to Team" / "Select a member to send sale info via WhatsApp" · member cards (role-colored avatar, name + role pill, contact) + "Send" → "Sent ✓" (POST /api/whatsapp/send). Empty: "No team members yet. Go to Settings → Team to add members."

### Teams segment
1. Roster — empty "No team members yet. / Add a driver, admin, or sales agent so Lagbot can route customers." TeamRow: role-colored avatar initials, name, role pill + WhatsApp number, trash (confirm "Remove from team?"). CTA "Add team member" → sheet (NAME · ROLE chips ×5: deliveryDriver/salesAgent/manager/teamLead/employee · WHATSAPP CONTACT "+234 800 000 0000" · "International format works best" · SAVE MEMBER / Cancel)
2. Routing rules — empty "No routing rules yet. / Add one so Lagbot pushes customer details to the right role automatically." RuleRow sentence-style: "When" + event chip · verb + role/person pill · quoted template preview · right: Active/Paused chip (tap toggles) + X delete. Tap row → RuleEditorSheet. "+ New rule". Footnote "Tap a rule to edit it. The chosen role confirms the handoff on WhatsApp; Lagbot relays their reply back to your customer."
3. Connectors — inDrive ("Driver dispatch · negotiated fares") · Glovo ("Same-day courier · Lagos + Abuja") · Bolt ("Driver dispatch · curb-to-curb") — each "Connect" → "Coming soon" alert. Footnote "Once connected, a partner can be the target of a routing rule instead of a person."

### RuleEditorSheet
"WHEN THIS HAPPENS" — 8 event chips: Order ready for delivery · Customer paid · Customer requests refund · Customer escalation · Quote requested · Stock running low · New customer enquiry · After-hours message
"ROUTE TO ROLE" — 5 role chips, optional "OR SPECIFIC PERSON" member chips
"MESSAGE LAGBOT SENDS" — textarea + placeholder chips {customer} {address} {time} {amount} {order} {team_member} · "SAVE RULE" / Cancel

## ANALYTICS (hidden tab, from Dashboard link)
Back · "Analytics" / "Performance insights & metrics" · period pills 7D 1M 2M 6M
1. RESPONSE TIME TREND — bar chart (daily ≤30d / weekly / monthly buckets)
2. Average Response Time card (tappable → detail) — "Xm Ys" big + Fastest (green) / Slowest (amber)
3. Two-up: AI Accuracy ("87%") | Satisfaction ("4.2/5" + "N ratings" or "No ratings yet")
4. Manual Overrides — count + "X.X% of conversations"
5. Most Active (tappable → detail) — top 3 rows "#1 name · X msgs" + "+X more customers"
- Empty: "No Data Yet / Analytics will populate once you start receiving WhatsApp messages and sales"
Detail views: Response Times ("slowest first", Avg/Fastest/Slowest summary, rows w/ time color green≤5s amber≤15s red>15s + model badge) · Top Customers (ranked rows, msgs badge, "Last active [date]")

## SKILLS (hidden tab)
Back · cycling eyebrow (Configure/Learn/Teach/Train/Tune/Calibrate/Refine/Shape/Adjust/Set up/Personalize/Polish) · "Skills" / "Choose what Lagbot does for you."
1. Active hero — "ACTIVE SKILLS" + big "X / 3" + orange progress + "Activate up to X more." / "Maximum activated. Deactivate one to enable another."
2. "AVAILABLE SKILLS" — rows: status dot+ACTIVE/INACTIVE · "20 tokens / day" · 92px icon stage · name + description · iOS switch (disabled at max)
3. Locked rows — "LOCKED" or orange "EXCLUSIVE" + "ONE-TIME" badge (rare) · ₦ price ("₦50,000 / one-time unlock" on rare) · "UPGRADE" outline or "UNLOCK" filled button (purchase flow NOT live)

## ADMINS
File is an 11-line redirect → /(tabs)/sales. Canonical Teams UI lives in Sales ▸ Teams. Route kept only so old deep links resolve.
