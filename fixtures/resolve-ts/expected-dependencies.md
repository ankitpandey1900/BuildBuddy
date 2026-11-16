# Dependency Inventory: test-fixture

## Direct Dependencies

| Package | Version | Manifest File |
| --- | --- | --- |
| react | ^18.2.0 | package.json:5 |

## Development Dependencies

| Package | Version | Manifest File |
| --- | --- | --- |
| vitest | ^1.0.0 | package.json:8 |

## Internal Dependencies

| Source File | Target File | Imported Symbol | Line Reference | Type Only |
| --- | --- | --- | --- | --- |
| src/barrel.ts | src/components/button.ts |  | src/barrel.ts:1 | no |
| src/cycle_a.ts | src/cycle_b.ts | b | src/cycle_a.ts:1 | no |
| src/cycle_b.ts | src/cycle_a.ts | a | src/cycle_b.ts:1 | no |
| src/index.ts | src/barrel.ts | Button | src/index.ts:2 | no |
| src/index.ts | src/utils/index.ts | formatData | src/index.ts:3 | no |
| src/index.ts | src/components/button.ts | Button | src/index.ts:4 | no |
| src/index.ts | src/cycle_a.ts | a | src/index.ts:5 | no |

## Circular Dependencies

| Finding | Cycle Description | Severity | Confidence |
| --- | --- | --- | --- |
| Circular cycle detected | src/cycle_a.ts <-> src/cycle_b.ts | medium | [confirmed] |

## Potentially Unused Dependencies

| Package | Version | Type | Manifest File | Confidence |
| --- | --- | --- | --- | --- |
| vitest | ^1.0.0 | dev | package.json:8 | [heuristic] |

