/**
 * Store listings for the FiestaBoard phone apps. The ONLY place they live.
 *
 * REPLACE_ME: neither app is published yet, so the App Store address is a
 * placeholder. While a URL still contains "REPLACE_ME", its button shows as
 * "coming soon" and links nowhere. When the app is live, paste the listing's
 * address from App Store Connect › App Information › "View on App Store"
 * (https://apps.apple.com/app/id<number>).
 *
 * The Google Play address is built from the Android app's applicationId
 * (com.fiestaboard.android, app/build.gradle.kts). It works once the app is
 * published on Play.
 */
export const STORES = {
  appStore: "https://apps.apple.com/app/idREPLACE_ME",
  googlePlay: "https://play.google.com/store/apps/details?id=com.fiestaboard.android",
} as const;

/** Whether a store address is a real listing rather than a placeholder. */
export function isPublished(url: string): boolean {
  return !url.includes("REPLACE_ME");
}
