# Dependency Inventory: test-fixture

## Direct Dependencies

| Package | Version | Manifest File |
| --- | --- | --- |
| fastapi | ==0.111.0 | requirements.txt:1 |
| pydantic | ==2.7.0 | requirements.txt:3 |
| uvicorn | ==0.30.0 | requirements.txt:2 |

## Development Dependencies

Not detected

## Internal Dependencies

| Source File | Target File | Imported Symbol | Line Reference | Type Only |
| --- | --- | --- | --- | --- |
| api/routes.py | services/user_service.py | get_users | api/routes.py:2 | no |
| main.py | api/routes.py | router | main.py:2 | no |
| services/user_service.py | models/user.py | User | services/user_service.py:1 | no |

## Circular Dependencies

Not detected

## Potentially Unused Dependencies

| Package | Version | Type | Manifest File | Status |
| --- | --- | --- | --- | --- |
| uvicorn | ==0.30.0 | direct | requirements.txt:2 | potentially unused [inferred] |

