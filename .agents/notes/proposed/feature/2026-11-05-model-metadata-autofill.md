# Agent Note: Conservative model metadata autofill

Status: proposed

English | [中文](2026-11-05-model-metadata-autofill.zh.md)

## Problem

New model IDs can arrive before the bundled catalog. Provider listings sometimes declare useful metadata that discovery drops. Existing custom rows do not record whether every field was inferred or manually chosen, so automatically converting them can erase user choices.

## Proposal

Add exact, source-verified GPT Image 2.6 catalog entries and validate selected Gemini/OpenRouter metadata when adding new models. Keep missing limits and prices unknown. Curated catalog values take precedence over validated structured provider fallback; subsequent manual overrides take precedence over the catalog. Retain exact-first catalog lookup and its existing normalized fallback; never infer capabilities or limits from an unfamiliar model name.

Offer an explicitly confirmed catalog-default restoration in the model editor. It resets capabilities, input/output modalities, token limits, streaming, parameter support, reasoning and pricing together, then follows the catalog. Preserve identity, API ID, name, description, grouping, endpoints, enabled/hidden/deprecated state, notes and references. Unknown catalog values stay absent, not zero/free. A failed or unmatched restoration changes no rows. Existing models are untouched until confirmation; future manual edits remain possible.

This phase does not add a persistent provider snapshot or automatic migration of old custom rows. Provider-discovered values initialize newly added custom models as ordinary configuration, without a separate provider provenance layer. They do not refresh existing rows. Catalog-backed models continue inheriting their current baseline. Gemini supplies validated input/output limits; OpenRouter supplies declared modalities, derived capabilities and token limits. Provider pricing is not imported. The metadata source and restoration impact are visible. Publication and changing catalog update channels are outside this change.

## Alternatives considered

- Guessing 2.6 metadata from 2.5 or an ID pattern can advertise unsupported features.
- Silently attaching old custom rows to a preset changes previously empty, unselected fields.
- Per-field restoration for old custom rows requires additional provenance; the first phase instead offers a clearly described full metadata restoration.
- Relaxing remote freshness guards could replace a newer fork catalog with older upstream data.

## Acceptance criteria

- AC1 — Exact 2.6 variants expose verified image capabilities without invented limits (verification: unit)
- AC2 — Validated provider fields survive discovery and new-model creation without overwriting existing user rows (verification: unit | renderer)
- AC3 — Restoration requires confirmation, shows catalog source/unknown fields, preserves unselected identity/routing/state and begins catalog inheritance (verification: renderer | unit)
- AC4 — Failure, missing catalog, cancellation and navigation leave existing configuration intact; manual edits after restoration override the catalog (verification: renderer | unit)

## Risks

Catalog information describes model support, not an account's access or every gateway's behavior. Provider-derived custom configuration is not continuously refreshed. An explicit full restoration replaces the listed manual settings. No live paid-provider or packaged Windows acceptance is claimed by unit tests.
