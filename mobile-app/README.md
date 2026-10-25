# Hello Chat mobile
React Native Android and iOS client for https://salil-hello-chat.onrender.com/.

The mobile app displays the existing chat in a WebView, with native safe areas,
Android back handling, contextual camera/microphone permissions, and an iOS
authenticated download/share module. It uses the same account and server as the web app.

## iPhone
Start with [বাংলা iPhone install instructions](IOS-INSTALL-BN.md).
Install Node dependencies and CocoaPods, then open `ios/HelloChat.xcworkspace`.
Select your Apple Personal Team in Signing & Capabilities and run on your connected iPhone.
The Run scheme uses Release, with JavaScript bundled into the app.

## Android
```sh
npm ci
npm run android
```
Use JDK 17 and the Android SDK versions in `android/build.gradle`.
Debug signing uses Android Gradle's generated development key.

For a release APK, create a private `android/release-signing.properties`:
```properties
storeFile=/absolute/private/path/hello-chat-release.jks
storePassword=YOUR_PRIVATE_PASSWORD
keyAlias=hello-chat
keyPassword=YOUR_PRIVATE_PASSWORD
```
Keep this key for future updates. Signing files and passwords are ignored by Git.
```sh
cd android
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a
```

## Checks
```sh
npm test -- --runInBand
npx tsc --noEmit
```
Android release build/signature and an unsigned ARM64 iPhone release build were verified.
Physical-device camera, downloads and two-device calling still need testing.
Internet is required. Background push notifications / native incoming-call services are not included.

[Android 1.0 APK release](https://github.com/salilsen056-svg/chat-app/releases/tag/android-v1.0.0).
