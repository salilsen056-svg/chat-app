# Hello Chat — iPhone-এ চালানো

এই iOS version-এ আপনার live Hello Chat একটি React Native WebView-এর মধ্যে চলে।
Chat, group text messages, status, media, DP এবং web calling একই server ব্যবহার করে।
Camera/microphone/gallery purpose strings এবং authenticated download → Share / Save to Files যোগ করা হয়েছে।

## এই Mac-এ Xcode দিয়ে চালান
1. iPhone USB cable দিয়ে Mac-এ যুক্ত করুন এবং ফোনে Trust দিন।
2. Xcode → Settings → Accounts-এ নিজের Apple Account দিয়ে sign in করুন।
3. ios/HelloChat.xcworkspace খুলুন। .xcodeproj নয়।
4. HelloChat target → Signing & Capabilities → Automatically manage signing চালু রেখে নিজের Personal Team বেছে নিন।
5. Xcode-এর destination-এ নিজের iPhone বেছে Run (▶) করুন।
6. iPhone-এ প্রয়োজন হলে Settings → Privacy & Security → Developer Mode চালু করুন।
7. প্রয়োজন হলে Settings → General → VPN & Device Management-এ নিজের developer profile trust করুন।

Run scheme Release configuration ব্যবহার করে; JavaScript bundle app-এর ভিতরে থাকে। Metro server ছাড়াই ফোনে চলবে।
Install করার পরে আগের account দিয়ে login করুন। Camera/microphone চাইলে প্রয়োজনমতো Allow দিন।

Apple Personal Team-এর provisioning profile 7 দিন পরে expire হয়। তখন Xcode থেকে আবার Run করুন।
Source: https://developer.apple.com/help/account/basics/about-your-developer-account

## অন্য Mac-এ setup
Xcode ও Node 22.11+ লাগবে। Ruby 3.3+ এবং CocoaPods 1.17.0 ব্যবহার করুন।
```sh
npm ci
bundle install
cd ios
bundle exec pod install
```
তারপর HelloChat.xcworkspace খুলুন এবং উপরের signing steps অনুসরণ করুন।

## বৈশিষ্ট্য ও সীমা
- iOS 15.1+; app ID com.salilsen.hellochat।
- Internet প্রয়োজন। App background/বন্ধ থাকলে push notifications ও native incoming-call service এই version-এ নেই।
- Downloaded media ও chat export native Share sheet থেকে Save to Files করা যায়।
- iPhone signing-এর জন্য নিজের Apple Account ব্যবহার করতে হবে। কোনো signing credential source-এ রাখা হয়নি।
- Build validation-এর জন্য unsigned iPhone release build ব্যবহার করা হয়। Unsigned .app বা .ipa সরাসরি iPhone-এ install করা যায় না।
- দুই ফোনে camera/audio/video call বাস্তবে পরীক্ষা করা বাকি।

## Build check
```sh
xcodebuild -workspace ios/HelloChat.xcworkspace -scheme HelloChat \
  -configuration Release -destination 'generic/platform=iOS' \
  -derivedDataPath build/ios CODE_SIGNING_ALLOWED=NO build
```
