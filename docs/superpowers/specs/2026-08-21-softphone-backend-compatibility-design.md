# Softphone Backend Compatibility Design

## Goal

Make the new `ModuleMonitorActiveCalls` work with both the legacy
`ModuleSoftphoneBackend` API and the new per-user API, without restoring a
global unfiltered active-calls channel in the new backend.

Compatibility is directional: the new `ModuleMonitorActiveCalls` must work
with an old backend. An old `ModuleMonitorActiveCalls` is not required to work
with the new backend.

## Current Problem

The legacy integration uses a module-wide service token and subscribes to:

- `/pbxcore/api/module-softphone-backend/v1/sub/contacts`;
- `/pbxcore/api/module-softphone-backend/v1/sub/active-calls`.

The new backend publishes filtered snapshots to per-user channels and exposes:

- `/pbxcore/api/module-softphone-backend/v1/sub/contacts`;
- `/pbxcore/api/module-softphone-backend/v1/sub/me/active-calls`.

The current Monitor frontend hard-codes the legacy active-calls URL. The new
backend also rejects the existing non-user service token for its subscriber
locations. On the inspected production station, this results in `404` for the
legacy active-calls URL and `401` for the new subscriber locations.

The frontend currently stops HTTP polling before a WebSocket connection opens.
Consequently, a rejected WebSocket can leave the UI without live updates.

## Chosen Architecture

Compatibility is negotiated by PHP capabilities, not module version strings.
The new backend introduces one internal method:

```php
ClientActionFactory::createModuleUiSession(
    string $serviceId,
    int $userId
): array
```

The method returns a restricted subscriber token together with the routes that
the caller must use. The legacy backend remains unchanged. Monitor detects the
new method with `method_exists()` and otherwise uses the legacy
`ApiController::createServiceToken()` contract.

If neither complete contract is available, Monitor uses its existing HTTP
cache endpoint and does not attempt a WebSocket connection.

## Backend Session Contract

Successful `createModuleUiSession()` response:

```json
{
  "success": true,
  "data": {
    "access_token": "jwt",
    "expires_in": 3600,
    "transport": "scoped-v2",
    "routes": {
      "contacts": "/pbxcore/api/module-softphone-backend/v1/sub/contacts",
      "active_calls": "/pbxcore/api/module-softphone-backend/v1/sub/me/active-calls"
    }
  }
}
```

The token has these claims:

```json
{
  "sub": 42,
  "type": "module_ui",
  "aud": "module-monitor-active-calls",
  "azp": "ModuleMonitorActiveCalls",
  "scope": ["contacts:read", "active-calls:read"]
}
```

The backend must reject the request when:

- `userId` is less than one;
- the referenced user does not exist;
- `serviceId` is not `ModuleMonitorActiveCalls`;
- the token signing key is unavailable.

The existing `createServiceToken()`, `publishActiveCalls()`, and
`publishUserStates()` methods keep their signatures and behavior.

## Backend Authorization

`module_ui` is a dedicated token type. It is accepted only by the Nchan
subscription admission path and is rejected by normal client REST APIs, SIP
WebSocket admission, media downloads, and call actions.

The subscriber admission check must verify:

- JWT signature and expiry;
- `type=module_ui` or an existing authenticated user access token;
- `aud=module-monitor-active-calls` for `module_ui` tokens;
- the route-specific scope;
- a positive numeric `sub` for per-user subscriptions.

For `/sub/me/active-calls`, admission returns the numeric user ID to Nginx, and
Nchan selects `active-calls-user-{userId}`. It must never fall back to the
global `active-calls` channel after an authorization failure.

The main-origin Nginx configuration must invoke the backend admission action
through a working internal FastCGI location. It must not loop an internal check
back through a public main-origin REST URL that can resolve to `404`.

The contacts channel remains the backend's existing buffered global contact
event stream. Access still requires a valid token with `contacts:read`.

## Monitor Backend Adapter

`MonitorActiveCallsMain` separates publication capability from browser-session
capability.

The browser-session selection order is:

1. If modern `ClientActionFactory::createModuleUiSession()` exists, call it
   with `ModuleMonitorActiveCalls` and the current UI user ID.
2. Otherwise, if legacy `ApiController::createServiceToken()` exists, call it
   with `ModuleMonitorActiveCalls` and add legacy transport metadata:

```json
{
  "transport": "legacy-v1",
  "routes": {
    "contacts": "/pbxcore/api/module-softphone-backend/v1/sub/contacts",
    "active_calls": "/pbxcore/api/module-softphone-backend/v1/sub/active-calls"
  }
}
```

3. Otherwise return `transport=polling` without tokens or WebSocket routes.

The worker publication selection remains modern `ClientActionFactory` first,
then legacy `ApiController`. A browser-session failure must not stop
`WorkerActiveCalls`, AMI processing, cache updates, or call actions.

## Controller and User Identity

`ModuleMonitorActiveCallsController::backandEnableAction()` obtains the current
user ID through the existing `getUserData()` path and passes it to the adapter.
The browser cannot supply or override this ID.

The endpoint returns the backend session result without logging either token.
When the backend is unavailable or incompatible, it returns a successful local
transport decision with `transport=polling`; this is a supported degraded mode,
not a worker failure.

## Frontend Transport State

The frontend reads transport and route values from `backandEnable`; it does not
hard-code the active-calls route.

HTTP polling behavior:

- starts during page initialization;
- continues while WebSocket is connecting;
- stops only in active-calls `onopen`;
- restarts immediately in active-calls `onerror` or `onclose`;
- remains the only transport in `polling` mode.

WebSocket reconnection uses the existing bounded exponential backoff. An
authorization or connection failure never causes a downgrade from a scoped
route to the legacy global route. The selected API generation comes only from
the server-side capability decision.

Token renewal calls Monitor's authenticated `backandEnable` endpoint again.
The frontend no longer calls the backend's `/auth/refresh` route directly.
This keeps renewal compatible with both backend generations and avoids exposing
another backend REST dependency on the main origin.

The contacts WebSocket is optional. When it is unavailable, existing contact
names remain in IndexedDB for the current two-hour TTL, after which the UI shows
phone numbers. Internal extension names continue to come from PBX models and do
not depend on the backend.

## Compatibility Matrix

| Monitor | Backend | Transport |
|---|---|---|
| New | New backend with `createModuleUiSession()` | Scoped contacts and per-user active-calls WebSockets |
| New | Legacy backend with `ApiController` | Legacy contacts and global active-calls WebSockets |
| New | Transitional or incompatible backend | HTTP polling; no invalid WebSocket attempts |
| Old | New backend | Not guaranteed |

## Error Handling

- Token or session creation exceptions are caught at the adapter boundary.
- No JWT is written to module, PHP, or browser console logs.
- Failed active-calls WebSockets restore polling before scheduling reconnect.
- Failed contacts WebSockets do not affect active-call delivery.
- Publishing exceptions remain isolated from the AMI event loop.
- Backend absence never changes module enabled state.

## Testing

Backend automated tests cover:

- valid `module_ui` token creation for an existing user;
- rejection of invalid users and callers;
- rejection of `module_ui` tokens by normal REST, SIP, media, and call actions;
- acceptance by contacts and per-user active-calls admission;
- correct `active-calls-user-{userId}` channel selection;
- unchanged legacy public method behavior;
- generated Nginx internal FastCGI admission configuration.

Monitor automated tests cover:

- modern capability selection and scoped routes;
- legacy `ApiController` selection and legacy routes;
- transitional backend selection of polling;
- unchanged modern and legacy publication delegation;
- polling until WebSocket `onopen`;
- polling restoration on `onerror` and `onclose`;
- server-provided route use;
- token renewal through `backandEnable`.

Production smoke tests cover:

- HTTP `101` for `/sub/contacts` with a scoped token;
- HTTP `101` for `/sub/me/active-calls` with the same user's scoped token;
- rejection of the legacy global route by the new backend;
- active-call updates over WebSocket;
- contact-name updates;
- stable HTTP polling when the backend is disabled;
- stable WorkerActiveCalls and WorkerAmiActions PIDs throughout the test.

## Deployment and Rollback

Deploy the backend first. Its existing PHP methods remain unchanged, so the
deployment does not remove legacy consumers. Deploy Monitor second; it detects
the new method and switches to scoped transport.

If only Monitor is upgraded on a system with an old backend, it selects
`legacy-v1`. If Monitor sees a partially upgraded backend, it stays on polling.

Rollback of Monitor restores the previous frontend behavior without requiring
a backend rollback. Rollback of the backend while the new Monitor remains
installed causes the adapter to select legacy mode or polling according to the
available API.
