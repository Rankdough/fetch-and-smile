#!/usr/bin/env python3
"""
fetch-and-smile consistency audit
Run: python3 consistency-audit.py
Checks that every committed fix is actually present in the repo files.
Add a check for every new feature or fix. Exit 0 = all good. Exit 1 = broken.
"""

import urllib.request, json, base64, sys

TOKEN_FILE = ".github-token"
try:
    with open(TOKEN_FILE) as f:
        TOKEN = f.read().strip()
except FileNotFoundError:
    # Try env variable
    import os
    TOKEN = os.environ.get("GITHUB_TOKEN", "")
    if not TOKEN:
        print("ERROR: set GITHUB_TOKEN env variable or create .github-token file")
        sys.exit(1)

BASE = "https://api.github.com/repos/Rankdough/fetch-and-smile/contents/"

def get(path):
    req = urllib.request.Request(BASE + path, headers={"Authorization": f"token {TOKEN}"})
    with urllib.request.urlopen(req) as r:
        d = json.loads(r.read())
    return base64.b64decode(d["content"]).decode()

checks = []

def check(file, label, cond):
    checks.append((file, label, bool(cond)))

print("\nfetch-and-smile consistency audit\n")

try:
    prop  = get("supabase/functions/proprietary-generate-article/index.ts")
    asm   = get("supabase/functions/_shared/proprietaryPromptAssembler.ts")
    cv    = get("src/components/ContentVerification.tsx")
    cta   = get("src/components/CTABanner.tsx")
    trust = get("src/components/TrustSignalBox.tsx")
    eeat  = get("src/utils/buildEeatContent.ts")
    lib   = get("src/components/ImageLibraryBrowser.tsx")
    cq    = get("src/components/keyword-research/ContentQueue.tsx")
    kc    = get("src/components/keyword-research/KeywordClustering.tsx")
except Exception as e:
    print(f"ERROR fetching files: {e}")
    sys.exit(1)

# ── proprietary-generate-article ──────────────────────────────────────────
check("prop", "stripContextFileLeaks defined",        "function stripContextFileLeaks(" in prop)
check("prop", "stripContextFileLeaks called",         "stripContextFileLeaks(stitched)" in prop)
check("prop", "injectReferences always replaces",     "stripped = markdown.replace" in prop)
check("prop", "extractContextFileReferences exists",  "function extractContextFileReferences(" in prop)
check("prop", "NaN guard on budgetCeil",              "Number.isFinite(input.sectionBudgetWords)" in prop)
check("prop", "no escaped backtick in regex",         "\\\\`" not in prop.split("function extractContextFileReferences")[1][:3000])
check("prop", "pathKey uses concatenation",           "\\\\${u.hostname" not in prop)
check("prop", "trim ceiling 1.25x",                   "sectionBudgetWords * 1.25" in prop)
check("prop", "decimal protection in finalThoughts",  "DECIMAL_FT" in prop)
check("prop", "tone 422 on profile not found",        "Tone profile not found" in prop)
check("prop", "quick tips bold header strip",         "remaining leading bold" in prop)

# ── assembler ─────────────────────────────────────────────────────────────
check("asm", "buildAtomicBodyStructureRule defined",  "function buildAtomicBodyStructureRule(" in asm)
check("asm", "buildAtomicBodyStructureRule called",   "buildAtomicBodyStructureRule(input.sectionBudgetWords" in asm)
check("asm", "sectionBudgetWords in interface",       "sectionBudgetWords?: number" in asm)
check("asm", "opening rule requires direct answer",   "Directly answer" in asm)
check("asm", "no stale ATOMIC push",                  "ruleBlocks.push(ATOMIC_BODY_STRUCTURE_RULE)" not in asm)
check("asm", "FAQ meta-questions prohibited",         "FORBIDDEN QUESTION TYPES" in asm)
check("asm", "tone: academic drift examples",         "NOT: \"the takeoff angle" in asm)

# ── frontend components ───────────────────────────────────────────────────
check("ContentVerification", "80% threshold = pass",  'wordCountPercentage >= 80 ? "passed"' in cv)
check("ContentVerification", "fixable only <80",      "fixable: wordCountPercentage < 80" in cv)
check("ContentVerification", "accurate no-tone msg",  "select one and regenerate" in cv)

check("CTABanner", "React description guarded",       "description?.trim() &&" in cta)
check("CTABanner", "HTML export description guarded", "description.trim() ?" in cta)

check("TrustSignalBox", "prose class removed",        "prose prose-sm" not in trust)
check("TrustSignalBox", "hr stripped in export",      "<hr" in trust)
check("buildEeatContent", "--- divider removed",      '"---"' not in eeat)

check("ImageLibraryBrowser", "h-[82vh] fixed height", "h-[82vh]" in lib)
check("ImageLibraryBrowser", "min-h-0 on grid",       "min-h-0" in lib)
check("ImageLibraryBrowser", "folder pills",          "activeFolder" in lib)

check("ContentQueue", "onRegenerateIdea prop",        "onRegenerateIdea" in cq)
check("ContentQueue", "regeneratingIdea state",       "regeneratingIdea" in cq)
check("ContentQueue", "RefreshCw imported",           "RefreshCw" in cq)

check("KeywordClustering", "doneIdeas state",         "doneIdeas" in kc)
check("KeywordClustering", "doneIdeas synced",        "Object.keys(next.done" in kc)
check("KeywordClustering", "isDone in card",          "isDone" in kc)
check("KeywordClustering", "deletingSilo state",      "deletingSilo" in kc)
check("KeywordClustering", "onRegenerateIdea",        "onRegenerateIdea={async" in kc)

# ── Results ───────────────────────────────────────────────────────────────
failures = [(f, l) for f, l, ok in checks if not ok]
passes   = [(f, l) for f, l, ok in checks if ok]

for f, l in passes:
    print(f"  ✓  [{f}] {l}")

if failures:
    print()
    for f, l in failures:
        print(f"  ✗  [{f}] {l}  ← BROKEN")

print(f"\n{'─'*50}")
print(f"Results: {len(passes)} passed, {len(failures)} failed")

if failures:
    print("\nFix the above before deploying.")
    sys.exit(1)

print("\nAll checks passed ✓  Safe to deploy.")
