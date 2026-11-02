# Investigation of different generation sizes

The earlier comparison did not use equivalent inputs. Read-only inspection of the app's saved research on 2 November 2026 established:

| Run | Saved scanned terms | Clusters | Seeds | Questions |
| --- | ---: | ---: | ---: | ---: |
| User reference, saved 13:04 UTC | 0 | 17 | 342 | 240 |
| Browser repeat, saved 13:16 UTC | 4,832 | 14 | 280 | 140 |
| First repository run | 4,803 | 13 | 138 | 77 |
| Repository control: 81 manual seeds, no scans | 0 | 13 | 260 | 130 |

The reference saved record has explicit empty arrays for scanned_terms, scan_results and url_extracted_terms. Its seed list matches the supplied reference CSV exactly. The form's website addresses do not establish that their scan results were included. The app does not persist manual seeds or a complete generation request, so the original request cannot be reconstructed conclusively.

## Verified defects

- Generate is disabled only for an empty topic or an ongoing generation, not for an ongoing scan. Its handler also lacks an isScanning guard. A user can generate before scan completion, sending empty or stale scannedTerms. This is a possible explanation for the reference record, not proof of the historical click sequence.
- The function prompt requests 20–50 seeds and 15–30 questions per cluster, but neither the tool schema nor server-side validation enforces these sizes. The first repository response has 9–14 seeds and 5–6 questions per cluster. Even the control has 10 questions per cluster. All are accepted as success.
- The function discards the upstream model identifier, usage and finish reason, returning only parsed results. The available response cannot establish whether an upstream output limit contributed. Direct deployed-source inspection was unavailable through the connected Supabase account.

## Interpretation

The no-scan control recovered 260 seeds versus 138 with the larger scanned input, but one sample per condition cannot isolate causality or prove normal model variation explains the remaining difference. Seed ordering also differed in the first repository run. Earlier claims of identical inputs were incorrect.

## Fixes to implement separately

Block generation during scanning, freeze and persist the full request with source provenance, validate unique keyword/question counts and report incomplete results, and retain safe model diagnostics. Use the same saved request for repeatability tests; do not recrawl on each test. No generator or frontend changes are included in this investigation commit.
