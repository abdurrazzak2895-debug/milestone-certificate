# BulkSMSBD দিয়ে মোবাইল OTP লগইন

## সমস্যা
লগে `phone_provider_disabled` দেখা যাচ্ছে, কারণ Lovable Cloud-এর নিজস্ব phone login-এ BulkSMSBD সরাসরি সংযুক্ত করা যায় না। তাই অ্যাপ নিজেই BulkSMSBD দিয়ে OTP পাঠাবে ও যাচাই করবে।

## যা করা হবে
1. **API key নিরাপদে সেভ** — আপনার নিশ্চিত করা key (API URL-এ থাকা key-টি) `BULKSMSBD_API_KEY` নামে এবং Sender ID `BULKSMSBD_SENDER_ID` নামে নিরাপদে সেভ করা হবে; কোডে রাখা হবে না। চ্যাটে key প্রকাশিত হয়েছে, তাই পরে BulkSMSBD থেকে নতুন key নেওয়া ভালো।
2. **OTP পাঠানো** — "OTP পাঠান" চাপলে সার্ভার একটি ৬ সংখ্যার কোড তৈরি করে `880XXXXXXXXXX` নম্বরে BulkSMSBD দিয়ে বাংলা বার্তা পাঠাবে।
3. **নিরাপদ সংরক্ষণ** — কোড hash করে ৫ মিনিটের মেয়াদসহ ডাটাবেসে রাখা হবে; সর্বোচ্চ ৫ বার ভুল চেষ্টা, প্রতি নম্বরে ৬০ সেকেন্ডে একবার পাঠানো যাবে।
4. **যাচাই ও লগইন** — কোড সঠিক হলে ওই মোবাইল নম্বরের অ্যাকাউন্ট (না থাকলে নতুন) দিয়ে লগইন সেশন তৈরি হয়ে ড্যাশবোর্ডে যাবে। অতিরিক্ত প্রোফাইল তথ্য নেওয়া হবে না।
5. **স্পষ্ট বার্তা** — SMS ব্যর্থ, ভুল কোড, মেয়াদ শেষ, বেশি চেষ্টা—প্রতিটির জন্য আলাদা বাংলা বার্তা।
6. লগইন পেজের ডিজাইন ও স্লাইডশো অপরিবর্তিত থাকবে।

## আপনার কাছ থেকে প্রয়োজন
- BulkSMSBD-তে অনুমোদিত **Sender ID** (না থাকলে খালি রাখা যাবে, তবে কিছু অপারেটরে বার্তা না-ও যেতে পারে)।
- অ্যাকাউন্টে যথেষ্ট SMS ব্যালান্স।

## Technical details
- Table `phone_otps` (phone, code_hash, expires_at, attempts, last_sent_at); RLS on, no client policies — only server access.
- Server functions in `src/lib/phone-otp.functions.ts`: `sendPhoneOtp` (GET `http://bulksmsbd.net/api/smsapi` with key from `process.env`, checks response code 202) and `verifyPhoneOtp`.
- On success: admin client finds/creates user with phone `880…` (phone_confirm), then `auth.admin.generateLink({ type: "magiclink" })` on a synthetic internal email; returns `hashed_token`; client calls `supabase.auth.verifyOtp({ token_hash, type: "magiclink" })` to establish the session.
- `src/routes/auth.tsx` swaps `signInWithOtp`/`verifyOtp(sms)` for these server functions.
- Update the AGENTS.md auth rule to note the custom BulkSMSBD OTP path.
