import React, {useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Alert, BackHandler, Linking, NativeModules, Platform, Pressable, StatusBar, StyleSheet, Text, View} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import {WebView} from 'react-native-webview';
import {navigationAction, CHAT_URL} from './src/navigation';

const SOURCE = {uri: CHAT_URL};
const BACK_SCRIPT = `(() => {
 const dialog = document.querySelector('dialog[open]');
 const root = dialog || document;
 const button = root.querySelector('[aria-label="Cancel message selection"], [aria-label="Close groups"], [aria-label="Close capture"], [aria-label="Close"], .photo-close, .media-dialog-header button')
   || (!dialog && document.querySelector('.has-peer [aria-label="Back to people"]'));
 if (button) { button.click(); return; }
 window.ReactNativeWebView.postMessage('android:exit');
})(); true;`;

function ChatApp() {
 const web = useRef<WebView<object>>(null);
 const canGoBack = useRef(false);
 const [downloading, setDownloading] = useState(false);
 const [error, setError] = useState(false), [loading, setLoading] = useState(true), [instance, setInstance] = useState(0);
 useEffect(() => {
  if (Platform.OS !== 'android') { return; }
  const listener = BackHandler.addEventListener('hardwareBackPress', () => {
   if (error) { askExit(); }
   else if (canGoBack.current) { web.current?.goBack(); }
   else { web.current?.injectJavaScript(BACK_SCRIPT); }
   return true;
  });
  return () => listener.remove();
 }, [error]);
 useEffect(() => {
  if (!loading) { return; }
  const timeout = setTimeout(() => {setError(true); setLoading(false);}, 60000);
  return () => clearTimeout(timeout);
 }, [loading, instance]);
 async function shareDownload(url: string) {
  if (downloading || navigationAction(url) !== 'internal') { return; }
  setDownloading(true);
  try {
   if (!NativeModules.HelloChatDownloads) { throw new Error('The iOS download module is not available. Rebuild the app.'); }
   await NativeModules.HelloChatDownloads.shareDownload(url);
  } catch (e) { Alert.alert('Unable to save file', e instanceof Error ? e.message : 'Please try again.'); }
  finally { setDownloading(false); }
 }
 function navigate(url: string) {
  const action = navigationAction(url);
  if (action === 'internal') { return true; }
  if (action === 'external') { Linking.openURL(url).catch(() => Alert.alert('Unable to open link', 'No compatible app is available.')); }
  return false;
 }
 return <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']}>
  <StatusBar barStyle="dark-content" />
  {error ? <View style={styles.center}>
   <Text style={styles.logo}>hello ✳</Text><Text style={styles.title}>Let’s reconnect</Text>
   <Text style={styles.description}>Check your internet connection, then try again. The server may take a moment to wake up.</Text>
   <Pressable accessibilityRole="button" style={styles.retry} onPress={() => {setError(false); setLoading(true); setInstance(v => v + 1);}}><Text style={styles.retryText}>Try again</Text></Pressable>
  </View> : <View style={styles.content}>
   <WebView<object> ref={web} key={instance} source={SOURCE} style={styles.web}
    javaScriptEnabled domStorageEnabled sharedCookiesEnabled
    thirdPartyCookiesEnabled={false} mixedContentMode="never"
    allowFileAccess={false} allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false}
    mediaPlaybackRequiresUserAction={false} allowsInlineMediaPlayback allowsFullscreenVideo
    mediaCapturePermissionGrantType="grantIfSameHostElseDeny"
    geolocationEnabled={false} webviewDebuggingEnabled={false}
    originWhitelist={['*']} onShouldStartLoadWithRequest={request => navigate(request.url)}
    onOpenWindow={event => {navigate(event.nativeEvent.targetUrl);}}
    onNavigationStateChange={state => {canGoBack.current = state.canGoBack;}}
    onLoadEnd={() => setLoading(false)} onError={() => {setError(true); setLoading(false);}}
    onHttpError={event => {if (event.nativeEvent.url === CHAT_URL && event.nativeEvent.statusCode >= 400) {setError(true);}}}
    onRenderProcessGone={() => {setError(true); setLoading(false);}}
    onContentProcessDidTerminate={() => {setError(true); setLoading(false);}}
    onFileDownload={Platform.OS === 'ios' ? event => {void shareDownload(event.nativeEvent.downloadUrl);} : undefined}
    automaticallyAdjustContentInsets={false} contentInsetAdjustmentBehavior="never"
    onMessage={event => {if (Platform.OS === 'android' && navigationAction(event.nativeEvent.url) === 'internal' && event.nativeEvent.data === 'android:exit') {askExit();}}}
    downloadingMessage="Saving to Downloads…" lackPermissionToDownloadMessage="Allow file downloads in Android settings."
   />
   {(loading || downloading) && <View style={styles.loading} pointerEvents="none"><ActivityIndicator color="#008069" /><Text style={styles.loadingText}>{downloading ? 'Save or share your download…' : 'Opening Hello Chat…'}</Text></View>}
  </View>}
 </SafeAreaView>;
}
function askExit() { Alert.alert('Close Hello Chat?', 'You can return to your conversations anytime.', [
 {text: 'Stay', style: 'cancel'}, {text: 'Close', onPress: () => BackHandler.exitApp()},
]); }
export default function App() {return <SafeAreaProvider><ChatApp /></SafeAreaProvider>;}
const styles = StyleSheet.create({
 screen: {flex: 1, backgroundColor: '#ffffff'}, content: {flex: 1}, web: {flex: 1, backgroundColor: '#ffffff'},
 center: {flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: '#f4f8f5'},
 logo: {fontSize: 44, fontWeight: '700', color: '#008069', marginBottom: 36}, title: {fontSize: 24, fontWeight: '600', color: '#111b21'},
 description: {fontSize: 15, lineHeight: 23, textAlign: 'center', color: '#667781', marginVertical: 18},
 retry: {backgroundColor: '#008069', paddingVertical: 14, paddingHorizontal: 32, borderRadius: 24}, retryText: {color: '#fff', fontWeight: '700'},
 loading: {position: 'absolute', top: 0, left: 0, right: 0, padding: 12, backgroundColor: '#f4f8f5', flexDirection: 'row', gap: 10, justifyContent: 'center'},
 loadingText: {color: '#285b4b', fontSize: 13},
});
