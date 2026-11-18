# Feishu work-task visibility investigation

Status: unresolved. Native archive remains a backup only; it is not enabled.
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
| Native archive | Client declares archive operations and its recent-list request excludes archived tasks. | Backup only; not exercised or enabled in this investigation. |

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

The runtime does not call these experimental mutation routes. It continues to
create ordinary work tasks; their visibility limitation remains documented.
Do not introduce deletion, silently archive tasks, patch the user's native UI,
or substitute consumer-model billing to claim that this requirement is complete.

## Remaining evidence needed

A supported no-history/visibility contract for enterprise work-model inference,
or a native work-sidebar flow that demonstrably hides a task without deletion
or archive. Validate both actual generation and fresh sidebar behavior before
integrating it. Any future archive backup must accurately disclose retained
cloud history and remain separate from a true-hiding claim.
