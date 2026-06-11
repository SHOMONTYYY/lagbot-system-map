# Welcome + Auth + Onboarding — code-true component inventory & flow
> Generated from app code @ aef6e84 (2026-06-11).

## FLOW
splash (video + session check) → authenticated? /(tabs) : /(welcome)
welcome → Get Started → signup → Next → verify?email= → Verify → /(onboarding)
welcome/login/signup → Google/Apple OAuth → /(onboarding)
login → Log In → /(tabs); Forgot password? → reset email (WIRED — works now)
onboarding: index (intro) → setup wizard steps 0-5 (name → type → tone → connect-WA landing → phone → pairing) → auto to /(tabs) when WhatsApp links, or skip at steps 3-5 ("I'll connect WhatsApp later" → /(tabs))
secondary chain: add-product (2/4) → configure-nova (3/4) → activate-skill (4/4) → complete → /(tabs). Each skippable.
whatsapp-info reachable from setup step 3 "Learn More" (re-enterable post-onboarding).

## WELCOME
Auto-advancing 3-slide carousel (4s) + dots · animated title e.g. "Your 24/7 WhatsApp assistant" + subtitle · "Get Started" → signup · Google + Apple icon buttons → OAuth → onboarding · "Already have an account? Log in" · terms line "By clicking on Get Started, you agree to Lagbot Terms and Conditions and Privacy Policy"

## LOGIN
Back · "Log In" / "Enter your details to continue." · error banner ("Invalid email or password.") / info banner ("Reset link sent to your email.") · Email ("youremail@gmail.com") · Password (eye toggle) · "Forgot password?" → sends Supabase reset (shows "Sending reset link…") · "Log In"/"Signing in…" → /(tabs) · "Or Continue With" · GOOGLE / APPLE rows

## SIGNUP
Back · "Create your Account" / "Enter the correct details to continue." · error ("That email already has an account — try logging in instead.") · First Name · Last Name · Email · Password + live checklist "6 chars · 1 uppercase · 1 number/symbol" (green when met) · "Next"/"Creating…" → verify · social row

## VERIFY (email OTP)
Back · "Enter the 6-digit code" / "Sent to yout****@gmail.com" · "Change Email" → bottom sheet (New Email Address input · Save · Cancel) · error ("Invalid code…" / "That code expired — tap Resend…") · 6 OTP boxes (auto-advance, backspace nav, paste-aware) · "Resend code in 45s" → "Didn't get it? Resend code" · "Verify"/"Verifying…" → /(onboarding)

## ONBOARDING INTRO /(onboarding)/index
Illustration · "Let's set up your Lagbot profile!" · "We'll ask you a few questions to build a personalized Assistant." · "Let's go" → setup?step=0

## SETUP WIZARD (steps 0-5; StepIndicator shows 4 pills)
- STEP 0 Name: "What is the name of your business?" + centered input → persists business_name → step 1
- STEP 1 Type: "What type of business do you run?" / "This helps Lagbot understand your business better" · cards Retail Shop / Food & Beverages / Fashion & Beauty / Services / Others — select auto-saves industry, auto-advances (220ms)
- STEP 2 Tone: "How should Lagbot talk to customers?" · Friendly ("Warm & Casual") / Professional ("Polite & Formal") / Sales-Focused ("Persuasive and Energetic") — auto-saves tone, auto-advances
- STEP 3 Connect WA landing: image · "Connect your WhatsApp" · "Lagbot will read and reply to your incoming messages automatically. Learn More" (→ whatsapp-info) · microcopy "You can pause anytime · Your data is secure" · "No spam, ever" · CTA "Connect WhatsApp" → step 4 · skip link → /(tabs)
- STEP 4 Phone: "Enter your Business Phone Number" · +234 box (tap → toast "We're only available in Nigeria for now.") + 11-digit input "XXX XXXX XXXX" · "Continue" → saves phone_number → step 5 · skip link
- STEP 5 Pairing (no button): "Open WhatsApp & enter this code" · masked-phone instructions (WhatsApp → Settings → Linked Devices → Link with phone number instead) · "Change number" → step 4 · code display XXXX-XXXX + copy (check 2.5s) · status: "Requesting code…" / spinner "Expires in MM:SS · Waiting for WhatsApp…" / "Code expired — request a new one" · helper "Keep this screen open… We'll move on automatically once the link succeeds." · auto-requests pairing code on mount (160s countdown, polls status 3s ×60) · connected → finishOnboarding() → /(tabs) · skip link

## WHATSAPP-INFO
Back · "How Lagbot connects to WhatsApp" / "A short, honest look at what happens when you tap Connect." · 4 sections: "A linked-device session" · "What Lagbot reads" · "Where your messages live" · "You stay in control" · footnote "Lagbot is independent and not affiliated with or endorsed by WhatsApp or Meta."

## ADD-PRODUCT (Step 2 of 4, OnboardingStep wrapper w/ progress bar + skip)
"Add products" / "Add at least one product so Nova can answer pricing and availability questions." · added list (check rows) · form: "Product name *" ("e.g. Blue Ankara dress") · "Price (₦) *" ("e.g. 15000") | "Stock qty *" ("e.g. 10") · "Category (optional)" ("e.g. Dresses (defaults to General)") · "Add Product"/"Saving…" (repeats) · "N product(s) added" + "Continue →" → configure-nova · "Skip this step"

## CONFIGURE-NOVA (Step 3 of 4)
"Configure Nova" / "Tell Nova about your business so it can give accurate answers to customers." · "AI name" ("Nova") + hint "This is the name your customers will see (e.g. Nova, Aria, Jade)." · "Business instructions" textarea ("e.g. We sell women's fashion in Lagos. Delivery is free over ₦10,000…") + hint "The more context you give, the smarter Nova's replies will be." · "Save & Continue" → activate-skill · skip

## ACTIVATE-SKILL (Step 4 of 4)
"Activate a skill" / "Skills extend what Nova can do — like taking orders or tracking inventory." · warning at max "Max 3 skills active — deactivate one to swap" · skill cards (name + 2-line description + circle/check toggle, spinner while toggling) · "Continue with N skill(s)" / "Continue →" → complete · skip

## COMPLETE
Big green check · "You're all set!" / "Nova is ready to start answering your customers." · summary card: WhatsApp connected/skipped · N products added/skipped · Nova configured/Using defaults · N skills activated/Skipped · "Go to Dashboard →" → /(tabs)
