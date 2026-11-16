# Project Overview: test-fixture

## Purpose

Not detected

## Languages

| Language | Files | Lines | Percentage |
| --- | --- | --- | --- |
| Python | 4 | 30 | 88.2% |
| txt | 1 | 4 | 11.8% |

## Frameworks

| Framework | Version | Confidence | Source |
| --- | --- | --- | --- |
| FastAPI | ==0.111.0 | [static] | api/routes.py:1, api/routes.py:4, main.py:1, main.py:4, requirements.txt:1 |

## Directory Structure

| Directory | Files | Lines |
| --- | --- | --- |
| ./ (root) | 2 | 14 |
| api/ | 1 | 9 |
| models/ | 1 | 6 |
| services/ | 1 | 5 |

## Entry Points

| Entry Point | Type | File Reference | Confidence |
| --- | --- | --- | --- |
| FastAPI Application Factory / Instance | app_factory | main.py:4 | [static] |
| Python __main__ Entry | main_block | main.py:7 | [static] |

## Major Modules

| Module | Root Directory | Layer | Files | Cohesion |
| --- | --- | --- | --- | --- |
| api | api | backend | 1 | 0.00 |
| models | models | data | 1 | 1.00 |
| services | services | backend | 1 | 0.00 |

## External Dependencies

| Package | Version | Type | Manifest |
| --- | --- | --- | --- |
| fastapi | ==0.111.0 | direct | requirements.txt:1 |
| pydantic | ==2.7.0 | direct | requirements.txt:3 |
| uvicorn | ==0.30.0 | direct | requirements.txt:2 |

