# Agent Note: cherry-studio-kcfix image workbench

Status: proposed

English | [中文](2026-11-04-kc-image-workbench.zh.md)

## Problem

The private fork is named cherry-studio-kcfix. The user no longer requires simultaneous installation or coexistence verification; usually only one version will be installed. Existing user data must not be modified during development. The current application shares the upstream application ID, protocol registration, boot configuration home, and update channels. Its image history stores prompts and files, but does not persist enough edit lineage or execution settings to reproduce a branch.

## Proposal

Use cherry-studio-kcfix as the application name. This is a private, unpublished fork; simultaneous installation, separate installer identity, alternate protocol registration and dedicated coexistence tests are out of scope. Development runs must use an explicit CS_DEV_PROFILE_ROOT and must not read or alter the user's existing profile. Before any packaged run, document the effective userData, BootConfig and logs paths and the risk of sharing an upstream profile. Do not automatically copy, migrate or delete a user profile as part of this development task. Disable upstream automatic update installation so it cannot replace the private fork. Preserve existing provider OAuth callbacks and internal file URLs.

Remove Cherry-owned account, subscription, billing, cloud-provider and cloud-service entry points, including startup requests behind those surfaces. Retain third-party provider API keys, provider OAuth, local profile settings, and unrelated local features. Trace every CherryCloudService consumer before changing service registration. Do not remove generic OAuth infrastructure or treat the CN edition as a substitute for isolation.

Extend the existing painting page and canonical generation pipeline. Show lineage thumbnails on the left, the current image and optional parent/current comparison in the center, separate original-prompt record and current edit instruction at the bottom, and model, size, quality and reference slots on the right. Selecting any historical output selects that exact image as the next input. Editing creates a child without changing its parent; selecting an older image can create a separate branch. Original prompt is metadata only and is never implicitly appended to the edit instruction.

Persist an append-only execution receipt using the existing SQLite/DataApi and FileEntry systems, with new forward-only migrations. Record parent painting and parent output file IDs, selected model/provider, original prompt, current instruction, requested and effective size/quality when known, reference image IDs, execution mode, and actual adapter/operation identity. Capture effective interface information at the main-process request boundary, rather than guessing from a model name. Store allowlisted metadata only: never tokens, headers, raw request objects, credential-bearing URLs, or provider secrets. Unknown effective values remain explicitly unknown. Existing paintings remain readable without fabricated lineage.

Annotation is a separately verifiable increment: retain immutable source bytes and vector overlay data; create a distinct derived image only on explicit apply. Clearly label source, annotation preview and rendered annotated input. Never silently send an overlay that was only displayed, or discard it when the user explicitly applied it.

Implement in dependency order: name and safe development profile; Cherry-owned entry-point removal; persistence and request receipts; canvas and branching; optional annotations. No push, merge, release or installer publication is included. This proposed spec is not approved and no implementation is claimed.

## Alternatives considered

- A full coexistence redesign is excluded by the latest user instruction. Changing only the name is not proof of data isolation; report the actual paths instead.
- Removing all login or OAuth code breaks the explicitly retained third-party providers.
- A localStorage-only canvas loses durable history and bypasses the existing database/file lifecycle.
- Reusing the original prompt for every edit changes the user's instruction and is excluded.

## Acceptance criteria

- AC1 — The application is named cherry-studio-kcfix; documentation states actual packaged data paths and profile-sharing risks, with no coexistence claim or dedicated coexistence testing. (verification: unit and docs gate)
- AC2 — Development launch uses an explicit isolated profile without reading or altering the user's existing data; no upstream update installation is offered. (verification: unit and Electron)
- AC3 — Cherry account/subscription/cloud entry points and their startup network requests are absent, while third-party API-key and OAuth setup still work. (verification: renderer and Electron)
- AC4 — Selecting an output from any prior node sends that exact file with only the current edit instruction; the original prompt remains a visible record and is excluded from edit request text. (verification: renderer and unit)
- AC5 — Two edits from the same historical image create distinct child nodes, survive restart, and leave their parent and other branches unchanged. (verification: database and Electron)
- AC6 — The canvas exposes lineage, current image, parent/current comparison, original prompt, instruction, model, size, quality and reference slots, with capability-aware validation. (verification: renderer and Electron)
- AC7 — Persisted receipts identify the parent output and actual execution interface and record model, prompt, instruction, size and quality without credentials or secret-bearing URLs. (verification: unit and database)
- AC8 — Existing populated databases migrate forward without dropping data; older paintings remain viewable and missing lineage is not invented. (verification: database)
- AC9 — Cancellation, failure, repeated submit and selection changes cannot attach an output to the wrong parent or duplicate a completed receipt. (verification: renderer and database)
- AC10 — If annotations ship, original bytes remain unchanged and a labeled derived image is sent only after explicit apply; otherwise the feature is reported as deferred. (verification: renderer and Electron)

## Risks

Provider capabilities and OAuth callback restrictions may constrain the supported editing models. Packaged coexistence and public distribution are not acceptance requirements. Real-provider execution needs configured credentials and permission for any paid request. No packaged runtime or installer verification is claimed unless actually performed. The current repository requires explicit human approval of the spec before substantial implementation; approval and publication are separate decisions.
