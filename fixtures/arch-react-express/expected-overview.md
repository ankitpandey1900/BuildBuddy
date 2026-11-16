# Project Overview: test-fixture

## Purpose

Not detected

## Languages

| Language | Files | Lines | Percentage |
| --- | --- | --- | --- |
| TypeScript (TSX) | 2 | 23 | 36.5% |
| TypeScript | 2 | 21 | 33.3% |
| JSON | 1 | 19 | 30.2% |

## Frameworks

| Framework | Version | Confidence | Source |
| --- | --- | --- | --- |
| Express | ^4.19.2 | [static] | package.json:10, src/server/index.ts:1, src/server/index.ts:3 |
| React | ^18.3.1 | [static] | package.json:11, package.json:12, src/client/App.tsx:1, src/client/App.tsx:4, src/client/main.tsx:1, src/client/main.tsx:2, src/client/main.tsx:7 |

## Directory Structure

| Directory | Files | Lines |
| --- | --- | --- |
| ./ (root) | 2 | 27 |
| src/ | 3 | 36 |

## Entry Points

| Entry Point | Type | File Reference | Confidence |
| --- | --- | --- | --- |
| package.json main | main | package.json:4 | [static] |
| package.json script: start | script | package.json:6 | [static] |
| package.json script: dev | script | package.json:7 | [static] |
| React DOM Root Entry | framework_entry | src/client/main.tsx:7 | [static] |
| Express HTTP Server Entry | framework_entry | src/server/index.ts:10 | [static] |

## Major Modules

| Module | Root Directory | Layer | Files | Cohesion |
| --- | --- | --- | --- | --- |
| src::client | src/client | frontend | 2 | 1.00 |
| src::server | src/server | backend | 1 | 1.00 |

## External Dependencies

| Package | Version | Type | Manifest |
| --- | --- | --- | --- |
| express | ^4.19.2 | direct | package.json:10 |
| react | ^18.3.1 | direct | package.json:11 |
| react-dom | ^18.3.1 | direct | package.json:12 |

