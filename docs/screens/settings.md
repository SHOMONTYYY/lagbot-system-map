# Settings — code-true component inventory (hub + 9 sub-sections)
> Generated from app code @ aef6e84 (2026-06-11). Deep links: ?to=profile|persona|business-info|bank-details|whatsapp-connect|notifications|usage|privacy|blocked-contacts (+ ?returnTo=path).

## HUB
Back · "Settings" title
1. Account hero (dark) — avatar initials · "Signed in as" + firstName (+ businessName if different, else "Tap to edit profile") → profile
2. CONNECTORS card — WhatsApp row ("Connected and routing messages" green dot + "Disconnect" link | "Not connected" red dot, attention tint, → whatsapp-connect) · Bank Details row ("{bank} · ****{last4}" green | "Add your payout account" attention, → bank-details)
3. PREFERENCES card — Lagbot Persona ("Customise how the AI sounds") · Business Info ("What Lagbot knows about you — and your hours")
4. APP card — Appearance switch ("Dark mode"/"Light mode", local only) · Tokens ("Usage, daily allowance and store") · Notifications ("Push alerts for paused chats") · Privacy & Security ("Password and account") · Blocked Contacts ("Numbers Lagbot won't reply to")
5. "Sign out" danger pill → confirm MODAL "Sign Out? / Are you sure you want to sign out?" Cancel | Sign Out

## PROFILE
"Profile Settings" / "Manage your account information" · Profile Picture (initials only — upload not implemented) · "Your Name" · "Email Address" READ-ONLY (verification flow doesn't exist) · "Phone Number" +234 · "Business Address" · Save Changes/Cancel → business.update + config upsert + auth.updateUser + POST /api/settings/refresh → "Saved / Profile updated."

## LAGBOT PERSONA
"Assistant" / "Lagbot Persona" / "Shape how Lagbot sounds when it replies to your customers"
1. Business Name (dark card) — input "e.g. Nikea Prime Solutions" + circular ✓ confirm (turns green when saved)
2. Conversation Tone — 3 illustrated ToneOptions: Friendly ("Warm, casual, on first-name terms — like chatting with a helpful neighbour.") · Professional ("Polite, structured, polished — the way a service rep would reply on email.") · Sales-Focused ("Persuasive, momentum-building — leans into closing the deal.")
3. Customer Preview — live animated preview of greeting as customer sees it
4. Greeting Message — textarea "e.g. Hi there 👋 Welcome to [your business]. How can I help you today?" + AI suggestion chips (tone-specific, tap inserts)
5. Save Changes → "Saved ✓" state · all saves hit /api/settings/refresh

## BUSINESS INFO
"Business" / "Business Info" / "What Lagbot knows about you — and when you're open."
1. Dark hero — Brain icon, "This is Lagbot's brain" / "Everything here trains how Lagbot answers your customers."
2. Basics — Assistant name ("Nova") · Industry ("e.g. Fashion retail") · Location ("e.g. Lagos, Nigeria")
3. About Your Business — textarea (placeholder full example: delivery, returns) + 4 tips chips (what you sell · location + delivery/pickup · return policy · anything else)
4. Operating Hours — per-day rows Mon–Sun ("09:00 AM → 05:00 PM" editable, Open/Closed pill toggle, today highlighted, live "Open now" pill)
5. Save → "Saved / Your AI will use this info in all future replies."

## BANK DETAILS
"Wallet" / "Bank Details" / "Your payout destination. Customer payments collect in your Lagbot wallet, then withdraw here whenever you cash out."
1. Dark hero — Landmark icon, "Withdrawals only" / "Customers don't pay here. This is the bank account your Lagbot wallet pays out to."
2. BANK NAME ("e.g. Access Bank") · ACCOUNT NUMBER (numeric, max 10, "e.g. 0123456789") · ACCOUNT NAME ("e.g. Chioma Okafor")
3. Trust tile — "Stored encrypted. Sent exactly as entered, double check before saving."
4. "Save bank details" → config upsert + refresh; honours returnTo (e.g. back to Wallet) else "Saved / Nova will now share these details when customers ask how to pay."

## WHATSAPP CONNECT
"Connectors" / "WhatsApp" / "Pair your number so customers can chat your business and Lagbot can reply for you."
1. Dark hero — WhatsApp-green MessageCircle, "One number, every customer" / "Conversations route straight to Lagbot's AI. You stay in the loop."
2. "WhatsApp number" input ("2348001234567 (with country code)") + hint "Country code, no + sign. E.g. Nigeria is 234."
3. Pairing code reveal — slot-machine animated cells, Copy button, "Expires in {N}s" orange (red at 0: "Expired — request a new code"); polls status 3s ×40
4. "Get pairing code"/"Get new code" → POST /api/whatsapp/pairing-code → on connect: "Connected! WhatsApp is now linked. AI will respond to messages automatically."
5. Trust tile — "Codes expire after 160 seconds. Open WhatsApp → Settings → Linked Devices → Link with phone number."

## NOTIFICATIONS
"Push Notifications" toggle card — "Receive alerts when Nova is paused or a chat is in manual mode." Off → clears push_token.

## TOKENS / USAGE
"Tokens" / "Usage, daily allowance and store"
1. Balance hero (dark) — "AVAILABLE" + big count + "Every AI reply spends tokens. Your free allowance refills daily."
2. Free tokens meter — "Free tokens today" + "{used} / {perDay} used" + orange bar + "Refills in {N}h"
3. Balance breakdown — Free left today · Rolled over (if >0) · Bonus · Purchased
4. Token store — 3 packs: STARTER 5,000 ₦4,000 · GROWTH 25,000 ₦18,750 · SCALE 100,000 ₦70,000
5. Footnote "Purchased tokens never expire. Payments are handled securely by Paystack."
6. Payment sheet (MODAL — opens only after tapping a pack; NOT inline on this page) — "{pack} pack" + summary + Pay with: Card ("Debit or credit card") | Bank transfer ("Pay from your bank app") + "Continue to Paystack" → api.initTokenPurchase → opens authorizationUrl → on return refreshTokens + "Almost there…" · on error "Checkout not connected yet — The payment service for token packs has not gone live yet…" (BACKEND ROUTE MISSING)

## PRIVACY & SECURITY
"Manage your password here" · Current Password · New Password ("At least 6 characters") · Confirm New Password · Save → auth.updateUser → "Password updated"
DANGER ZONE — "Delete Account" red ("This action is permanent and cannot be undone") → confirm → ⚠ deletes businesses row DIRECTLY from the phone + signOut. Does NOT call POST /api/account/delete (the App-Store-compliant route that removes the Evolution instance + auth user). KNOWN GAP.

## BLOCKED CONTACTS
"Privacy" / "Blocked Contacts" / "Lagbot won't reply to anyone on this list…" · empty "No one blocked yet / Tap 'Add contact' below…" · rows: avatar + looked-up name + phone + "Unblock" chip · "Add contact to block list" → picker modal (search, RECENT CONVERSATIONS + DEVICE CONTACTS sections, multi-select, "Done (N)"); permission denied: "Contact access was denied. Only people who have messaged you appear here."
