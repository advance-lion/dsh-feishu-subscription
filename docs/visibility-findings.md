# Feishu work-task visibility investigation

Status: no verified true hiding. Native archive fallback is enabled in dev.4
following the user's explicit choice, with mark-read and a Doubao desktop-banner
preference check before generation.
Findings below are observations of an authenticated test account on 2026-11-18,
not a claim about every server version or tenant. No deletion operation is part
of the plugin runtime.

## Acceptance criterion

A DSH-created request must remain usable with the selected enterprise model,
while its task is absent from the normal Feishu work sidebar. A successful API
status, hidden message text, or a model reply alone is insufficient. Existing
user conversations must never be targets.

## Observed candidates

| Candidate | Observation | Production decision |
| --- | --- | --- |
| `need_create_conversation=false` on a work request | Generation succeeds, but ACK contains a conversation and the list contains it. | Not a hiding mechanism. |
| `message_storage_type=TOOL_MESSAGE(1)` on the existing work request | Server rejects it with `moa param check failed`. | Not enabled. |
| SDK-style once request without a local conversation or work scheduler | Server returns `710020202 / common invalid param`, no ACK or generation. | Not a verified enterprise stateless path. |
| Native `OPERATE_CONVERSATION(1120)`, `HIDE(5)` | Status becomes `HIDDEN(6)`, but a fresh work recent-chain query still returns the task; native sidebar acceptance failed. | Do not label this as working hiding. |
| Native `BATCH_OPERATE_CONVERSATION(1125)`, `HIDE(5)` | Server returns `712010703`, downstream call failure. No position/list change. | Unsupported by this observation; cause not established. |
| Message status `INVISIBLE(1)` | Request succeeds but the task remains in the recent chain. Restoring `AVAILABLE(0)` returns success yet message readback stays empty. | Not a safe reversible production mechanism. |
| Message tag `HideInConvList(10)` | Present in returned message schema, absent from the chat query message schema. A subsequent mutation probe failed its baseline guard, so no tag was written. | No verified writable contract. |
| Native archive | An owned completed test task was unarchived into Recents, archived out of Recents, present in the archive, and retained 6 readable messages. | Enabled fallback in dev.4; not a no-history claim. |
| Doubao desktop banner preference `145` | Pull returned `1`; sync to `0` and a separate pull confirmed persistence. | Checked before generation; failure prevents a model request. Account-wide within Doubao. |

## Scope and safeguards

Mutation probes targeted only a conversation created by this investigation. Its
ACK/local-conversation identity was retained in encrypted local evidence and
checked against server metadata. No existing user conversation was modified,
deleted, or archived. The owned probe's `source_conversation_id` is `0`, so no
separate parent conversation was found to explain the sidebar behavior.

The message-visibility probe is **not fully restored**: its two synthetic test
messages remain absent from message readback even after the successful restore
response. The conversation's HIDE state was restored and its legacy conversation
record remains undeleted. The underlying message storage state has not been
established. Do not infer recovery from a success code or reuse this damaged
baseline for further mutation tests.

The runtime does not call the experimental HIDE/message-visibility routes.
It archives only the new ID from a matching request-local ACK. Cleanup uses the
original credential snapshot and an independent bounded signal on success,
error, cancellation, or generator return. Partial batch failures are not success;
mark-read is still attempted. No deletion endpoint is used. Running tasks may
appear briefly; canceled cloud tasks may continue and later updates could
reactivate them.

## REA and notification verification (2026-11-18)

REA 6.7.0 `analyze-javascript-application` successfully analyzed the bundled
worklet main.js and three native notification modules with explicit node/time
bounds. The initial broader run timed out; only subsequent successful bounded
runs count as analysis evidence. Static analysis cannot establish the absence of
an undocumented server feature; no verified no-history contract was found.

Native notification source declares InPCBannerSwitch=145. The supported
`/alice/user/config/pull` and `/alice/user/config/sync` routes persisted 0 for
the authenticated account. No global Feishu notification settings were changed.
This preference also affects Doubao tasks started outside DSH. Preference 154
was absent in readback and is not written.

Real archive verification uses command 1125 / operation 8, per-task success,
independent recent/archive queries, and retained message readback. Read status
uses command 2100. The damaged visibility probe was not used as a valid archive
baseline. A new generation probe returned rate limit 710022004; no retry was
made. End-to-end dev.4 model cleanup and complete absence of native background
notification banners remain unverified.

## Remaining evidence needed

A supported no-history/visibility contract for enterprise work-model inference,
or a native work-sidebar flow that demonstrably hides a task without deletion
or archive. Validate both actual generation and fresh sidebar behavior before
integrating it. Any future archive backup must accurately disclose retained
cloud history and remain separate from a true-hiding claim.
