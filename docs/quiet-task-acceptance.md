# dev.4 archive and notification acceptance

Date: 2026-11-18. Scope: authenticated Windows account, DSH CLI/Web and desktop.

- REA 6.7.0 completed bounded worklet and native-notification analysis. No
  verified stateless enterprise inference or true work-sidebar hiding was found.
  This does not establish absence of an undocumented server feature.
- Doubao desktop-banner preference 145 was changed from 1 to 0 and confirmed
  by an independent server read. Feishu global notification settings were not
  changed. This is an account preference, including native Doubao tasks.
- An owned completed test task was restored into the recent chain, then archived
  out of that chain. It appeared in the archive chain, remained undeleted, and
  retained six readable messages. Mark-read returned success. Existing user
  conversations were not touched.
- The actual runtime helper also completed preference verification, archive,
  and mark-read against that owned task without issuing another generation.
- Offline suite: 29 pass, 0 fail, 1 native-keychain test skipped on this machine.
  Coverage includes ACK ownership rejection, partial batch failure, independent
  cleanup on cancellation, credential pinning, and no model request when quiet
  preference confirmation fails.
- Packed tgz installed into the isolated feishu-acceptance Profile. Web settings
  rendered archive and banner-scope descriptions, with no page errors.
- Windows desktop upgraded through its own plugin manager, enabled, and showed
  one running component plus the new policy UI. Installed package.json,
  quiet-task.js, provider.js, generate.js, client.js, and index.js hashes matched
  the authored package. Managed desktop Profile files were only read for this
  verification, never edited externally.

## Outstanding acceptance

A new generation attempt returned 710022004 (rate limited). No automatic model
retry was introduced. Full dev.4 generation-to-cleanup and absence of native
background banners are therefore not verified. Cancellation stops local receive;
the cloud task may continue, and subsequent updates might reactivate an archived
task. No deletion or experimental message-visibility mutation is used.

The public stable Release remains 0.3.1. dev.4 is an installed development build,
not a claim that every PRD requirement or platform has passed acceptance.
