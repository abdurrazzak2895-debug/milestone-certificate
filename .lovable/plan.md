# Phone OTP চালু করার পরিকল্পনা

## নিশ্চিত সমস্যা
Auth লগে `phone_provider_disabled` / “Unsupported phone provider” পাওয়া গেছে। তাই অ্যাপের OTP পাঠানোর কোড নয়—Lovable Cloud-এ কোনো SMS provider সংযুক্ত না থাকাই ব্যর্থতার কারণ।

## করণীয়
1. একটি supported SMS provider account তৈরি করা হবে (যেমন Twilio) এবং SMS পাঠানোর উপযোগী number/service নেওয়া হবে। এই third-party service সাধারণত paid এবং বাংলাদেশে SMS delivery অনুমোদন/verification চাইতে পারে।
2. Provider থেকে প্রয়োজনীয় credentials সংগ্রহ করে **Cloud → Users → Auth Settings → Phone settings**-এ SMS provider চালু ও credentials সংযুক্ত করা হবে। গোপন credentials চ্যাট বা source code-এ রাখা হবে না।
3. SMS template-এ OTP placeholder হিসেবে `{{ .Code }}` রাখা হবে।
4. Login screen-এ provider-সংক্রান্ত ব্যর্থতার জন্য বর্তমান অস্পষ্ট বার্তার বদলে স্পষ্ট বাংলা error দেখানো হবে; security-sensitive তথ্য দেখানো হবে না।
5. একটি বাস্তব বাংলাদেশি নম্বরে Send OTP, resend timer, OTP verification এবং সফল login—পুরো flow পরীক্ষা করা হবে।

## বর্তমান বাধা
আপনার এখন কোনো SMS provider account নেই। Account ও credentials ছাড়া প্রকৃত SMS OTP পাঠানো সম্ভব নয়। Provider প্রস্তুত হলে বাকি configuration ও app-side error handling সম্পন্ন করা যাবে।
