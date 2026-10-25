#import <React/RCTBridgeModule.h>
#import <UIKit/UIKit.h>
#import <WebKit/WebKit.h>

static BOOL IsChatURL(NSURL *url) {
  return [url.scheme.lowercaseString isEqualToString:@"https"] &&
    [url.host.lowercaseString isEqualToString:@"salil-hello-chat.onrender.com"] &&
    (url.port == nil || url.port.integerValue == 443) && url.user == nil && url.password == nil;
}

@interface HelloChatDownloads : NSObject <RCTBridgeModule, NSURLSessionTaskDelegate>
@property(nonatomic, assign) BOOL busy;
@end

@implementation HelloChatDownloads
RCT_EXPORT_MODULE();
+ (BOOL)requiresMainQueueSetup { return YES; }
- (dispatch_queue_t)methodQueue { return dispatch_get_main_queue(); }

// Never forward the authenticated cookie to a redirect on another origin.
- (void)URLSession:(NSURLSession *)session task:(NSURLSessionTask *)task
  willPerformHTTPRedirection:(NSHTTPURLResponse *)response newRequest:(NSURLRequest *)request
  completionHandler:(void (^)(NSURLRequest *))completionHandler {
  completionHandler(IsChatURL(request.URL) ? request : nil);
}

RCT_EXPORT_METHOD(shareDownload:(NSString *)value
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  NSURL *url = [NSURL URLWithString:value];
  if (!IsChatURL(url)) { reject(@"INVALID_URL", @"Only Hello Chat downloads are allowed.", nil); return; }
  if (self.busy) { reject(@"BUSY", @"A download is already being prepared.", nil); return; }
  self.busy = YES;
  // Clear only old temporary downloads; Files/Share copies are preserved.
  NSURL *base = [NSURL fileURLWithPath:[NSTemporaryDirectory() stringByAppendingPathComponent:@"HelloChatDownloads"] isDirectory:YES];
  NSFileManager *fm = NSFileManager.defaultManager;
  [fm createDirectoryAtURL:base withIntermediateDirectories:YES attributes:nil error:NULL];
  for (NSURL *directory in [fm contentsOfDirectoryAtURL:base includingPropertiesForKeys:@[NSURLContentModificationDateKey] options:0 error:NULL]) {
    NSDate *date; [directory getResourceValue:&date forKey:NSURLContentModificationDateKey error:NULL];
    if (date && [date timeIntervalSinceNow] < -86400) { [fm removeItemAtURL:directory error:NULL]; }
  }
  [WKWebsiteDataStore.defaultDataStore.httpCookieStore getAllCookies:^(NSArray<NSHTTPCookie *> *cookies) {
    NSMutableArray *matching = [NSMutableArray array];
    for (NSHTTPCookie *cookie in cookies) {
      NSString *domain = [cookie.domain hasPrefix:@"."] ? [cookie.domain substringFromIndex:1] : cookie.domain;
      if ([domain.lowercaseString isEqualToString:url.host.lowercaseString] &&
          (!cookie.expiresDate || cookie.expiresDate.timeIntervalSinceNow > 0) &&
          [url.path hasPrefix:cookie.path]) { [matching addObject:cookie]; }
    }
    NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:url];
    request.allHTTPHeaderFields = [NSHTTPCookie requestHeaderFieldsWithCookies:matching];
    request.timeoutInterval = 120;
    NSURLSessionConfiguration *configuration = NSURLSessionConfiguration.ephemeralSessionConfiguration;
    configuration.HTTPCookieStorage = nil;
    configuration.HTTPShouldSetCookies = NO;
    NSURLSession *session = [NSURLSession sessionWithConfiguration:configuration delegate:self delegateQueue:nil];
    NSURLSessionDownloadTask *task = [session downloadTaskWithRequest:request completionHandler:^(NSURL *temporary, NSURLResponse *response, NSError *error) {
      NSHTTPURLResponse *http = (NSHTTPURLResponse *)response;
      if (error || !temporary || !IsChatURL(response.URL) || http.statusCode != 200) {
        [session finishTasksAndInvalidate];
        dispatch_async(dispatch_get_main_queue(), ^{ self.busy = NO; reject(@"DOWNLOAD_FAILED", @"Unable to download. Check your connection and sign in again if needed.", error); });
        return;
      }
      NSString *name = response.suggestedFilename.lastPathComponent;
      if (!name.length || [name isEqualToString:@"."] || [name isEqualToString:@".."]) { name = @"Hello-Chat-attachment"; }
      NSURL *folder = [base URLByAppendingPathComponent:NSUUID.UUID.UUIDString isDirectory:YES];
      [fm createDirectoryAtURL:folder withIntermediateDirectories:YES attributes:nil error:NULL];
      NSURL *destination = [folder URLByAppendingPathComponent:name];
      NSError *fileError;
      BOOL saved = [fm moveItemAtURL:temporary toURL:destination error:&fileError];
      [session finishTasksAndInvalidate];
      dispatch_async(dispatch_get_main_queue(), ^{
        if (!saved) { self.busy = NO; reject(@"SAVE_FAILED", @"Unable to prepare this file.", fileError); return; }
        UIWindow *window;
        for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
          if ([scene isKindOfClass:UIWindowScene.class] && scene.activationState == UISceneActivationStateForegroundActive) {
            for (UIWindow *candidate in ((UIWindowScene *)scene).windows) { if (candidate.isKeyWindow) { window = candidate; break; } }
          }
        }
        UIViewController *presenter = window.rootViewController;
        while (presenter.presentedViewController) { presenter = presenter.presentedViewController; }
        if (!presenter) { self.busy = NO; [fm removeItemAtURL:folder error:NULL]; reject(@"NO_WINDOW", @"Open Hello Chat before saving this file.", nil); return; }
        UIActivityViewController *share = [[UIActivityViewController alloc] initWithActivityItems:@[destination] applicationActivities:nil];
        share.popoverPresentationController.sourceView = presenter.view;
        share.popoverPresentationController.sourceRect = CGRectMake(presenter.view.bounds.size.width / 2, presenter.view.bounds.size.height / 2, 1, 1);
        share.completionWithItemsHandler = ^(UIActivityType type, BOOL completed, NSArray *items, NSError *shareError) {
          self.busy = NO; [fm removeItemAtURL:folder error:NULL]; resolve(@(completed));
        };
        [presenter presentViewController:share animated:YES completion:nil];
      });
    }];
    [task resume];
  }];
}
@end
