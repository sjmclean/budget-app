# v1.25 Register Persistence Port

## Purpose

v1.25 moves the account register hook behind the app persistence gateway without changing current behaviour.

The app still uses the existing browser localStorage-backed register implementation, but register UI code now depends on a browser-safe port rather than directly importing the concrete register service.

## What changed

- Added `AccountRegisterPersistencePort`.
- Updated `AppPersistenceGateway.accountRegisters` to use that port.
- Updated `useAccountRegister` to call `getAppPersistenceGateway().accountRegisters`.
- Kept `browserLocalStoragePersistenceGateway.accountRegisters` mapped to the existing `accountRegisterService`.

## What did not change

- Transaction behaviour.
- Split behaviour.
- Transfer behaviour.
- Attachment metadata behaviour.
- Running balance calculations.
- Storage backend.

## Remaining register-related coupling

The register service itself still contains browser localStorage implementation details. It may also still coordinate with payee/category/account behaviour internally.

That is intentional for this release. The next step should be an internal dependency cleanup release rather than a behavioural rewrite.

## Recommended next step

v1.26 should audit and reduce service-internal coupling, especially where register or scheduled transaction services import concrete payee/account/category services directly.
