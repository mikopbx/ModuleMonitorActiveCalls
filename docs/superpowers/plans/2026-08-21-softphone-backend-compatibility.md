# Softphone Backend Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the new ModuleMonitorActiveCalls use scoped per-user WebSockets with the new ModuleSoftphoneBackend while retaining complete support for the legacy backend API.

**Architecture:** ModuleSoftphoneBackend issues a restricted `module_ui` JWT and validates it only for Nchan subscriptions. ModuleMonitorActiveCalls negotiates the backend generation by method capability, receives server-selected routes, and keeps HTTP polling active until a WebSocket is actually open. The legacy `ApiController` and its global active-calls route remain supported only when that legacy class is present.

**Tech Stack:** PHP 7.4+/8.x, Phalcon 4/5, HS256 JWT, Nginx/OpenResty Lua, Nchan, vanilla JavaScript/Vue 2, Node.js VM tests, Babel.

**Spec:** `docs/superpowers/specs/2026-08-21-softphone-backend-compatibility-design.md`

## Global Constraints

- Compatibility is directional: new ModuleMonitorActiveCalls must work with old ModuleSoftphoneBackend; old Monitor with new backend is not guaranteed.
- Do not reintroduce a global unfiltered active-calls channel in the new backend.
- Keep `ClientActionFactory::createServiceToken()`, `publishActiveCalls()`, and `publishUserStates()` unchanged.
- `module_ui` tokens must not authorize normal REST, SIP, media, recording, or call-action APIs.
- The browser must never choose legacy transport after a scoped authorization failure.
- HTTP polling stops only after active-calls WebSocket `onopen` and resumes on `onerror` or `onclose`.
- Backend PHP must remain compatible with PHP 7.4 and Phalcon 4/5; do not use PHP 8-only syntax.
- Do not log access tokens, refresh tokens, signing secrets, or WebSocket authorization query strings.
- Preserve unrelated dirty files in ModuleMonitorActiveCalls, especially `.DS_Store` files and the existing WorkerAmiActions/WorkerActiveCalls work.
- Backend repository: `/Volumes/DevDisk/apor/Developement/Softphone/ModuleSoftphoneBackend` on `develop`.
- Monitor repository: `/Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls` on `develop`.

---

### Task 1: Issue restricted module UI tokens in ModuleSoftphoneBackend

**Files:**
- Create: `ModuleSoftphoneBackend/Lib/ClientAPI/ModuleUiSessionService.php`
- Modify: `ModuleSoftphoneBackend/Lib/JwtTokenManager.php`
- Modify: `ModuleSoftphoneBackend/Lib/ClientAPI/ClientActionFactory.php`
- Create: `ModuleSoftphoneBackend/tests/Unit/ModuleUiSessionServiceTest.php`
- Modify: `ModuleSoftphoneBackend/tests/Unit/JwtSecurityTest.php`

**Interfaces:**
- Consumes: `JwtTokenManager`, `SoftphoneBackendConf::getSecretKeyPath()`, `MikoPBX\Common\Models\Users::findFirstById()`.
- Produces: `JwtTokenManager::createModuleUiToken(array $payload): string` and `ClientActionFactory::createModuleUiSession(string $serviceId, int $userId): array`.

- [ ] **Step 1: Write the failing JWT type test**

Extend `tests/Unit/JwtSecurityTest.php` with assertions that a generated module UI token validates and contains the restricted claims:

```php
$moduleUi = $manager->validateToken($manager->createModuleUiToken([
    'sub' => 42,
    'azp' => 'ModuleMonitorActiveCalls',
    'scope' => ['contacts:read', 'active-calls:read'],
]));
jwtSecurityAssert(is_array($moduleUi), 'Generated module UI token failed strict validation');
jwtSecurityAssert(($moduleUi['type'] ?? '') === 'module_ui', 'Module UI token type changed');
jwtSecurityAssert(($moduleUi['aud'] ?? '') === 'module-monitor-active-calls', 'Module UI audience changed');
```

- [ ] **Step 2: Run the JWT test and verify RED**

Run:

```bash
php -n tests/Unit/JwtSecurityTest.php
```

Expected: failure because `JwtTokenManager::createModuleUiToken()` does not exist.

- [ ] **Step 3: Add the minimal JWT issuer**

Add this public method to `Lib/JwtTokenManager.php`, using the same `sid`, `jti`, `iat`, and `exp` rules as access tokens:

```php
public function createModuleUiToken(array $payload): string
{
    $payload['sid'] = $this->normalizeSessionId($payload['sid'] ?? null);
    $payload['jti'] = bin2hex(random_bytes(16));
    $payload['iat'] = time();
    $payload['exp'] = time() + $this->accessTokenExpiry;
    $payload['type'] = 'module_ui';
    $payload['aud'] = 'module-monitor-active-calls';
    return $this->encodeToken($payload);
}
```

Add `module_ui` to the exact allowed-type list in `hasValidRequiredClaims()`.

- [ ] **Step 4: Run the JWT test and verify GREEN**

Run:

```bash
php -n tests/Unit/JwtSecurityTest.php
```

Expected: `JwtSecurityTest: OK`.

- [ ] **Step 5: Write the failing session-service test**

Create `tests/Unit/ModuleUiSessionServiceTest.php`. Require `JwtTokenManager.php` and the new service file, inject a user-existence closure, and assert all four contracts:

```php
$tokens = new JwtTokenManager(str_repeat('m', 64));
$service = new ModuleUiSessionService($tokens, static function (int $userId): bool {
    return $userId === 42;
});
$result = $service->create('ModuleMonitorActiveCalls', 42);
$claims = $tokens->validateToken($result['data']['access_token'] ?? '');
moduleUiAssert(($result['success'] ?? false) === true, 'Valid session was rejected');
moduleUiAssert(($claims['sub'] ?? null) === 42, 'Session subject is not the UI user');
moduleUiAssert(($claims['azp'] ?? '') === 'ModuleMonitorActiveCalls', 'Authorized party changed');
moduleUiAssert(($claims['scope'] ?? []) === ['contacts:read', 'active-calls:read'], 'Scope changed');
moduleUiAssert(($result['data']['transport'] ?? '') === 'scoped-v2', 'Transport changed');
moduleUiAssert(($result['data']['routes']['active_calls'] ?? '') === '/pbxcore/api/module-softphone-backend/v1/sub/me/active-calls', 'Scoped route changed');
moduleUiAssert($service->create('UnknownModule', 42)['success'] === false, 'Unknown module was accepted');
moduleUiAssert($service->create('ModuleMonitorActiveCalls', 0)['success'] === false, 'Invalid user ID was accepted');
moduleUiAssert($service->create('ModuleMonitorActiveCalls', 99)['success'] === false, 'Missing user was accepted');
```

- [ ] **Step 6: Run the session-service test and verify RED**

Run:

```bash
php -n tests/Unit/ModuleUiSessionServiceTest.php
```

Expected: failure because `ModuleUiSessionService.php` does not exist.

- [ ] **Step 7: Implement ModuleUiSessionService**

Create a PHP 7.4-compatible final class with this constructor and method:

```php
public function __construct(JwtTokenManager $tokens, callable $userExists)
public function create(string $serviceId, int $userId): array
```

Return `['success' => false, 'data' => []]` for invalid service/user inputs. For a valid input, issue one access token with numeric `sub`, `azp=ModuleMonitorActiveCalls`, and the exact two scopes, then return:

```php
return [
    'success' => true,
    'data' => [
        'access_token' => $token,
        'expires_in' => 3600,
        'transport' => 'scoped-v2',
        'routes' => [
            'contacts' => '/pbxcore/api/module-softphone-backend/v1/sub/contacts',
            'active_calls' => '/pbxcore/api/module-softphone-backend/v1/sub/me/active-calls',
        ],
    ],
];
```

- [ ] **Step 8: Expose the static factory method**

Add `ClientActionFactory::createModuleUiSession(string $serviceId, int $userId): array`. It must load the existing signing key, instantiate `ModuleUiSessionService`, and use:

```php
static function (int $candidateUserId): bool {
    return Users::findFirstById($candidateUserId) !== null;
}
```

Catch `Throwable` and return the same failure envelope without logging secrets. Do not modify `createServiceToken()`.

- [ ] **Step 9: Run token/session tests and lint**

Run:

```bash
php -n tests/Unit/JwtSecurityTest.php
php -n tests/Unit/ModuleUiSessionServiceTest.php
php -l Lib/JwtTokenManager.php
php -l Lib/ClientAPI/ModuleUiSessionService.php
php -l Lib/ClientAPI/ClientActionFactory.php
```

Expected: both tests report `OK`; all three files report no syntax errors.

- [ ] **Step 10: Commit Task 1 in the backend repository**

```bash
git add Lib/JwtTokenManager.php Lib/ClientAPI/ModuleUiSessionService.php Lib/ClientAPI/ClientActionFactory.php tests/Unit/JwtSecurityTest.php tests/Unit/ModuleUiSessionServiceTest.php
git commit -m "feat: issue scoped monitor UI sessions"
```

---

### Task 2: Add subscription-only authorization

**Files:**
- Create: `ModuleSoftphoneBackend/Lib/ClientAPI/Actions/Admission/SubscriptionAccessAction.php`
- Modify: `ModuleSoftphoneBackend/Lib/ClientAPI/ClientActionFactory.php`
- Modify: `ModuleSoftphoneBackend/Lib/ClientAPI/ClientActionRegistry.php`
- Modify: `ModuleSoftphoneBackend/tests/fixtures/client-api-v1-routes.php`
- Modify: `ModuleSoftphoneBackend/tests/Unit/ClientAdmissionActionsTest.php`
- Modify: `ModuleSoftphoneBackend/tests/Unit/ClientActionRegistryTest.php`
- Modify: `ModuleSoftphoneBackend/tests/Unit/ClientApiV1RouteContractTest.php`
- Modify: `ModuleSoftphoneBackend/tests/Unit/ClientActionsContractSourceTest.php`

**Interfaces:**
- Consumes: `ClientAuthenticationService::requireToken()` and the `module_ui` claims produced by Task 1.
- Produces: internal `GET /check-subscription-access?scope={scope}` handled by `checkSubscriptionAccessAction`.

- [ ] **Step 1: Write failing admission behavior tests**

Extend `ClientAdmissionActionsTest.php` to require `SubscriptionAccessAction.php` and test:

```php
$moduleAuth = new ClientAuthenticationService(static function (string $token): array {
    return [
        'sub' => 7,
        'username' => '201',
        'type' => 'module_ui',
        'aud' => 'module-monitor-active-calls',
        'azp' => 'ModuleMonitorActiveCalls',
        'scope' => ['contacts:read', 'active-calls:read'],
    ];
});
$request = new ClientRequest('GET', '/check-subscription-access', ['scope' => 'active-calls:read'], ['Authorization' => 'Bearer token'], '', '127.0.0.1');
$response = (new SubscriptionAccessAction($moduleAuth))->handle($request);
admissionAssert(($response->headers()['X-Softphone-User-Id'] ?? '') === '7', 'Module UI subscription was rejected');
```

Add rejection cases for missing scope, `users-state:read`, wrong `aud`, wrong `azp`, and `type=refresh`. Add an acceptance case for a normal `type=access` token so existing softphone subscribers remain supported.

- [ ] **Step 2: Run admission test and verify RED**

Run:

```bash
php -n tests/Unit/ClientAdmissionActionsTest.php
```

Expected: failure because `SubscriptionAccessAction.php` does not exist.

- [ ] **Step 3: Implement SubscriptionAccessAction**

Implement `ClientActionInterface` with an injectable `ClientAuthenticationService`. Read the requested scope from `ClientRequest::query('scope')`, restrict it to:

```php
['contacts:read', 'active-calls:read', 'users-state:read']
```

Allow normal `access` tokens. Allow `module_ui` only when `aud`, `azp`, and the requested scope match the Task 1 contract. Return JSON success plus `X-Softphone-User-Id`. Throw `ClientApiException('Unauthorized', 401)` for invalid tokens and `ClientApiException('Forbidden', 403)` for invalid scope/claims.

- [ ] **Step 4: Register and compose the internal action**

Add this exact registry entry:

```php
['GET', '/check-subscription-access', 'checkSubscriptionAccessAction']
```

Add the corresponding route fixture with `authentication=internal_subscription`, import the action in `ClientActionFactory`, add a public controller bridge method, and add this resolver case:

```php
case 'checkSubscriptionAccessAction':
    return new SubscriptionAccessAction();
```

Update the frozen route count from 25 to 26 and add the new action to `ClientActionsContractSourceTest.php`.

- [ ] **Step 5: Run admission and routing tests**

Run:

```bash
php -n tests/Unit/ClientAdmissionActionsTest.php
php -n tests/Unit/ClientActionRegistryTest.php
php -n tests/Unit/ClientApiV1RouteContractTest.php
php -n tests/Unit/ClientActionsContractSourceTest.php
```

Expected: every test reports `OK`.

- [ ] **Step 6: Prove restricted tokens cannot enter existing APIs**

Extend `ClientAuthenticationServiceTest.php` and `ProtectedEndpointTokenTypeSourceTest.php` so `requireAccessToken()`, `requireRefreshToken()`, `requireSipTicket()`, media access, recordings, and call actions reject `type=module_ui`. Run:

```bash
php -n tests/Unit/ClientAuthenticationServiceTest.php
php -n tests/Unit/ProtectedEndpointTokenTypeSourceTest.php
php -n tests/Unit/ClientRecordingActionTest.php
php -n tests/Unit/ClientCallActionsTest.php
```

Expected: all report `OK`.

- [ ] **Step 7: Commit Task 2 in the backend repository**

```bash
git add Lib/ClientAPI/Actions/Admission/SubscriptionAccessAction.php Lib/ClientAPI/ClientActionFactory.php Lib/ClientAPI/ClientActionRegistry.php tests/fixtures/client-api-v1-routes.php tests/Unit/ClientAdmissionActionsTest.php tests/Unit/ClientActionRegistryTest.php tests/Unit/ClientApiV1RouteContractTest.php tests/Unit/ClientActionsContractSourceTest.php tests/Unit/ClientAuthenticationServiceTest.php tests/Unit/ProtectedEndpointTokenTypeSourceTest.php
git commit -m "feat: authorize module UI subscriptions"
```

---

### Task 3: Route Nchan admission through isolated FastCGI

**Files:**
- Modify: `ModuleSoftphoneBackend/Lib/SoftphoneBackendConf.php`
- Create: `ModuleSoftphoneBackend/tests/Unit/ModuleUiNchanSourceTest.php`
- Modify: `ModuleSoftphoneBackend/tests/Unit/ClientApiFastCgiNginxSourceTest.php`
- Modify: `ModuleSoftphoneBackend/tests/Unit/PersonalNchanChannelSourceTest.php`

**Interfaces:**
- Consumes: `GET /check-subscription-access` from Task 2.
- Produces: Nginx internal `/internal/check-subscription-access` and route-specific scope forwarding.

- [ ] **Step 1: Write the failing Nginx contract test**

Create `ModuleUiNchanSourceTest.php` to read `SoftphoneBackendConf.php` and assert all of these source contracts:

```php
$required = [
    '/internal/check-subscription-access',
    '/check-subscription-access',
    'contacts:read',
    'active-calls:read',
    'fastcgi_pass unix:/var/run/php-fpm.sock',
    '/public/client-api-v1.php',
    'fastcgi_param HTTP_AUTHORIZATION "Bearer $arg_token"',
    'active-calls-user-',
];
```

Also reject a `proxy_pass http://127.0.0.1/pbxcore/api/module-softphone-backend/v1/check-media-access` contract inside the main-origin internal admission location.

- [ ] **Step 2: Run Nginx contract test and verify RED**

Run:

```bash
php -n tests/Unit/ModuleUiNchanSourceTest.php
```

Expected: failure because subscription-specific FastCGI admission is absent.

- [ ] **Step 3: Change both Nchan subscriber locations**

In `createNginxLocations()` and `createNginxServers()`:

- contacts set required scope to `contacts:read`;
- `/sub/me/(users-state|active-calls)` sets required scope to `$1:read`;
- Lua captures `/internal/check-subscription-access` with both `token` and `scope` query arguments;
- per-user routes continue reading `X-Softphone-User-Id` and selecting `$1-user-$authz_user_id`;
- authorization failure exits with 401/403 and never selects a shared channel.

- [ ] **Step 4: Replace the broken main-origin loopback validator**

Generate exact internal FastCGI parameters for `/internal/check-subscription-access`:

```nginx
location = /internal/check-subscription-access {
    internal;
    fastcgi_pass unix:/var/run/php-fpm.sock;
    fastcgi_param SCRIPT_FILENAME {$script};
    fastcgi_param REQUEST_URI /pbxcore/api/module-softphone-backend/v1/check-subscription-access;
    fastcgi_param REQUEST_METHOD GET;
    fastcgi_param QUERY_STRING $query_string;
    fastcgi_param REMOTE_ADDR $remote_addr;
    fastcgi_param HTTP_AUTHORIZATION "Bearer $arg_token";
}
```

Use the same fixed front controller for the external server's internal location. Do not expose `/check-subscription-access` in the external public REST allowlist.

- [ ] **Step 5: Run Nginx and personal-channel tests**

Run:

```bash
php -n tests/Unit/ModuleUiNchanSourceTest.php
php -n tests/Unit/ClientApiFastCgiNginxSourceTest.php
php -n tests/Unit/PersonalNchanChannelSourceTest.php
php -l Lib/SoftphoneBackendConf.php
```

Expected: all tests report `OK`; lint reports no syntax errors.

- [ ] **Step 6: Run the complete backend unit suite**

Run:

```bash
for test_file in tests/Unit/*Test.php; do php -n "$test_file" || exit 1; done
```

Expected: exit code 0 and no failing test.

- [ ] **Step 7: Commit Task 3 in the backend repository**

```bash
git add Lib/SoftphoneBackendConf.php tests/Unit/ModuleUiNchanSourceTest.php tests/Unit/ClientApiFastCgiNginxSourceTest.php tests/Unit/PersonalNchanChannelSourceTest.php
git commit -m "fix: isolate Nchan subscription admission"
```

---

### Task 4: Negotiate modern, legacy, and polling transports in MonitorActiveCalls

**Files:**
- Modify: `ModuleMonitorActiveCalls/Lib/MonitorActiveCallsMain.php`
- Modify: `ModuleMonitorActiveCalls/App/Controllers/ModuleMonitorActiveCallsController.php`
- Modify: `ModuleMonitorActiveCalls/tests/MonitorActiveCallsModernBackendTest.php`
- Create: `ModuleMonitorActiveCalls/tests/MonitorActiveCallsLegacyBackendTest.php`
- Create: `ModuleMonitorActiveCalls/tests/MonitorActiveCallsTransitionalBackendTest.php`

**Interfaces:**
- Consumes: new `ClientActionFactory::createModuleUiSession()` or legacy `ApiController::createServiceToken()`.
- Produces: `MonitorActiveCallsMain::createBackendUiSession(int $userId): array` with `scoped-v2`, `legacy-v1`, or `polling` transport.

- [ ] **Step 1: Write the failing modern adapter test**

Update the modern backend stub to expose `createModuleUiSession(string $serviceId, int $userId)` and record both parameters. Assert:

```php
$session = MonitorActiveCallsMain::createBackendUiSession(42);
if (($session['data']['transport'] ?? '') !== 'scoped-v2'
    || ClientActionFactory::$serviceId !== 'ModuleMonitorActiveCalls'
    || ClientActionFactory::$userId !== 42
) {
    fwrite(STDERR, "FAIL: modern scoped session was not selected.\n");
    exit(1);
}
```

- [ ] **Step 2: Write legacy and transitional adapter tests**

`MonitorActiveCallsLegacyBackendTest.php` defines only the legacy `RestAPI\Controllers\ApiController`, returns access/refresh tokens, and asserts that Monitor adds:

```php
'transport' => 'legacy-v1',
'routes' => [
    'contacts' => '/pbxcore/api/module-softphone-backend/v1/sub/contacts',
    'active_calls' => '/pbxcore/api/module-softphone-backend/v1/sub/active-calls',
]
```

`MonitorActiveCallsTransitionalBackendTest.php` defines modern publication and `createServiceToken()` methods but no `createModuleUiSession()`. It asserts a successful local result with `transport=polling`, empty routes, and no token.

- [ ] **Step 3: Run all three tests and verify RED**

Run:

```bash
php -n tests/MonitorActiveCallsModernBackendTest.php
php -n tests/MonitorActiveCallsLegacyBackendTest.php
php -n tests/MonitorActiveCallsTransitionalBackendTest.php
```

Expected: failures because `createBackendUiSession()` does not exist.

- [ ] **Step 4: Implement separate publisher and browser-session resolution**

Keep `backendExists()` as publication availability for `WorkerActiveCalls`. Add:

```php
public static function createBackendUiSession(int $userId): array
```

Selection order:

```php
if (class_exists(ClientActionFactory::class)
    && method_exists(ClientActionFactory::class, 'createModuleUiSession')) {
    return ClientActionFactory::createModuleUiSession('ModuleMonitorActiveCalls', $userId);
}
if (class_exists(LegacyApiController::class)
    && method_exists(LegacyApiController::class, 'createServiceToken')) {
    // Preserve token fields and add legacy transport/routes under data.
}
return [
    'success' => true,
    'data' => ['transport' => 'polling', 'routes' => []],
];
```

Require that `PbxExtensionModules` reports the backend enabled before either branch. Catch backend exceptions and return polling. Keep publication delegation modern-first, legacy-second.

- [ ] **Step 5: Pass server-derived user identity from the controller**

Replace the current token action body with:

```php
[, , $userId] = $this->getUserData();
$result = MonitorActiveCallsMain::createBackendUiSession((int)$userId);
$this->view->data = $result['data'] ?? [];
$this->view->success = (bool)($result['success'] ?? false);
```

Do not accept a user ID from POST/query parameters.

- [ ] **Step 6: Run adapter tests, prior regression tests, and lint**

Run:

```bash
for test_file in tests/*Test.php; do php -n "$test_file" || exit 1; done
php -l Lib/MonitorActiveCallsMain.php
php -l App/Controllers/ModuleMonitorActiveCallsController.php
```

Expected: every test passes and both files lint cleanly.

- [ ] **Step 7: Commit Task 4 in the Monitor repository**

Stage only the adapter/controller/tests involved in this task; do not stage `.DS_Store` or unrelated worker files:

```bash
git add Lib/MonitorActiveCallsMain.php App/Controllers/ModuleMonitorActiveCallsController.php tests/MonitorActiveCallsModernBackendTest.php tests/MonitorActiveCallsLegacyBackendTest.php tests/MonitorActiveCallsTransitionalBackendTest.php tests/MonitorActiveCallsBackendUnavailableTest.php tests/fixtures/Globals.php
git commit -m "feat: negotiate softphone backend transport"
```

---

### Task 5: Make frontend WebSocket transport fail safe

**Files:**
- Create: `ModuleMonitorActiveCalls/tests/backend-transport.test.mjs`
- Modify: `ModuleMonitorActiveCalls/public/assets/js/src/module-monitor-active-calls-index.js`
- Regenerate: `ModuleMonitorActiveCalls/public/assets/js/module-monitor-active-calls-index.js`
- Regenerate: `ModuleMonitorActiveCalls/public/assets/js/module-monitor-active-calls-index.js.map`

**Interfaces:**
- Consumes: `backandEnable` data containing `transport`, `access_token`, `expires_in`, and `routes`.
- Produces: `applyBackendSession(data)`, server-selected WebSocket URLs, and polling-safe lifecycle behavior.

- [ ] **Step 1: Create a VM-based frontend regression test**

Load the source with `node:vm`, append `globalThis.__monitor = ModuleMonitorActiveCalls`, and provide stubs for `$`, `document`, `window`, `Vue`, `Form`, `Config`, `Extensions`, timers, and `WebSocket`. The fake WebSocket records its URL and exposes `onopen`, `onerror`, and `onclose` callbacks.

Assert these real behaviors:

```javascript
monitor.applyBackendSession({
  transport: 'scoped-v2',
  access_token: 'token',
  expires_in: 3600,
  routes: {
    contacts: '/pbxcore/api/module-softphone-backend/v1/sub/contacts',
    active_calls: '/pbxcore/api/module-softphone-backend/v1/sub/me/active-calls'
  }
});
assert.equal(fakeSockets[1].url.includes('/sub/me/active-calls?authorization='), true);
assert.equal(stopPollingCalls, 0, 'polling stopped before WebSocket open');
fakeSockets[1].onopen();
assert.equal(stopPollingCalls, 1, 'polling did not stop after WebSocket open');
fakeSockets[1].onclose({code: 1006, reason: 'test'});
assert.equal(startPollingCalls, 1, 'polling did not resume after WebSocket close');
```

Add a polling-mode assertion that creates no WebSocket and a legacy-mode assertion that uses `/sub/active-calls` exactly as returned by the server.

- [ ] **Step 2: Run frontend test and verify RED**

Run:

```bash
node tests/backend-transport.test.mjs
```

Expected: failure because `applyBackendSession()` and server-selected routes do not exist and polling currently stops before `onopen`.

- [ ] **Step 3: Apply the backend session response**

Add state fields `_backendTransport`, `_backendRoutes`, and `_authTokens`. Implement:

```javascript
applyBackendSession(data) {
    const transport = String(data?.transport || 'polling');
    this._backendTransport = transport;
    this._backendRoutes = data?.routes || {};
    const accessToken = data?.access_token;
    if (transport === 'polling' || !accessToken) {
        this.startPollingActiveCalls();
        return;
    }
    this.setAuthTokens(accessToken, '', Number(data?.expires_in) || 3600);
    this.connectContactsWs();
    this.connectActiveCallsWs();
}
```

Change `requestBackendEnable()` to call only `applyBackendSession(response.data || {})`. Change token renewal to call `requestBackendEnable()`; remove the direct AJAX call to `/auth/refresh`.

- [ ] **Step 4: Use only server-selected routes**

In each connect method, require a route from `_backendRoutes`, build the URL from `window.location` plus that route, and append the encoded access token. Do not retain hard-coded `/sub/active-calls` or `/sub/me/active-calls` values in connection code.

- [ ] **Step 5: Correct the polling lifecycle**

Remove `stopPollingActiveCalls()` from the start of `connectActiveCallsWs()`. Call it in `onopen`. Call `startPollingActiveCalls()` before scheduling reconnect in both `onerror` and `onclose`. Make `startPollingActiveCalls()` idempotent as it is today.

When `_backendTransport === 'polling'` or the active-calls route is absent, do not schedule WebSocket reconnects.

- [ ] **Step 6: Run frontend test and verify GREEN**

Run:

```bash
node tests/backend-transport.test.mjs
```

Expected: output `backend-transport.test.mjs: OK` and exit code 0.

- [ ] **Step 7: Regenerate browser assets with the existing Babel toolchain**

Run:

```bash
/Volumes/DevDisk/apor/Developement/MikoPBX/MikoPBXUtils/node_modules/.bin/babel public/assets/js/src/module-monitor-active-calls-index.js --out-file public/assets/js/module-monitor-active-calls-index.js --source-maps
```

Run the frontend test again after generation.

- [ ] **Step 8: Commit Task 5 in the Monitor repository**

```bash
git add tests/backend-transport.test.mjs public/assets/js/src/module-monitor-active-calls-index.js public/assets/js/module-monitor-active-calls-index.js public/assets/js/module-monitor-active-calls-index.js.map
git commit -m "fix: fall back safely from backend WebSockets"
```

---

### Task 6: Cross-repository verification

**Files:**
- Verify only; no planned production-file changes.

**Interfaces:**
- Consumes: all code from Tasks 1-5.
- Produces: fresh verification evidence for both repositories.

- [ ] **Step 1: Run the full backend unit suite**

```bash
cd /Volumes/DevDisk/apor/Developement/Softphone/ModuleSoftphoneBackend
for test_file in tests/Unit/*Test.php; do php -n "$test_file" || exit 1; done
```

Expected: exit code 0 with every unit test reporting `OK`.

- [ ] **Step 2: Run the Monitor regression suite**

```bash
cd /Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls
for test_file in tests/*Test.php; do php -n "$test_file" || exit 1; done
node tests/backend-transport.test.mjs
```

Expected: exit code 0 and no failed test.

- [ ] **Step 3: Lint all changed PHP and validate diffs**

Run `php -l` on every changed PHP file in both repositories, then:

```bash
git -C /Volumes/DevDisk/apor/Developement/Softphone/ModuleSoftphoneBackend diff --check HEAD~3..HEAD
git -C /Volumes/DevDisk/apor/Developement/MikoPBX/Extensions/ModuleMonitorActiveCalls diff --check HEAD~2..HEAD
```

Expected: all lint commands exit 0 and both `diff --check` commands produce no output.

- [ ] **Step 4: Review compatibility and security invariants**

Confirm from code and tests:

- legacy mode is selected only by the legacy `ApiController` class;
- scoped failure never switches to legacy routes;
- transitional modern backend selects polling;
- `module_ui` is rejected by `requireAccessToken()` and `requireSipTicket()`;
- no token or secret appears in logs or committed fixtures;
- backend old method signatures are unchanged;
- unrelated Monitor worker and `.DS_Store` changes remain untouched.

---

### Task 7: Production smoke test on serber@boffart.miko.ru

**Files:**
- Deploy only the reviewed changed files after explicit backups.
- Do not overwrite module databases, binaries, or unrelated configuration.

**Interfaces:**
- Consumes: verified backend and Monitor commits.
- Produces: observed WebSocket, polling, worker, and rollback evidence on the target station.

- [ ] **Step 1: Record production baseline**

Over SSH, record module enabled states, module versions, worker PIDs/start times, `/tmp/MonitorActiveCalls_worker.state`, current Nginx module-location checksum, and checksums of every target PHP/JS file. Verify production backend ancestry against local commit `c9d8dda` before copying a full file.

- [ ] **Step 2: Stage, lint, and back up backend files**

Upload changed backend files to explicit `/tmp/*.codex` paths. Run remote `php -l` on every staged PHP file. Create timestamped `.bak-codex-20260821-module-ui` copies beside each production target before overwriting it.

- [ ] **Step 3: Install backend files and regenerate Nginx configuration**

Copy only reviewed files into `ModuleSoftphoneBackend`, preserving ownership/mode. Trigger `ReloadNginxConfAction` through `WorkerModelsEvents::invokeAction()`, validate with `nginx -t`, then reload Nginx. If validation fails, restore all backend backups before any Monitor deployment.

- [ ] **Step 4: Verify scoped backend admission**

Resolve the first valid user internally and pass its numeric ID without printing the user record or token:

```php
$user = \MikoPBX\Common\Models\Users::findFirst();
$userId = $user === null ? 0 : (int)$user->id;
$session = ClientActionFactory::createModuleUiSession('ModuleMonitorActiveCalls', $userId);
```

Perform raw WebSocket handshakes and assert:

- `/sub/contacts` returns HTTP 101;
- `/sub/me/active-calls` returns HTTP 101;
- `/sub/active-calls` remains 404 on the new backend;
- a `module_ui` token receives 401/403 from normal `/profile`, media, and SIP admission.

- [ ] **Step 5: Stage, lint, back up, and install Monitor files**

Upload only changed Monitor PHP/JS files to `/tmp`, lint staged PHP, create timestamped `.bak-codex-20260821-backend-transport` backups, and copy the reviewed files into the module. Restart only ModuleMonitorActiveCalls workers through its supported service method.

- [ ] **Step 6: Verify browser transport and worker health**

Confirm the controller returns `scoped-v2` and the two server-selected routes without logging the token. Observe both worker PIDs across at least two minute watchdog boundaries, confirm fresh heartbeat, AMI `Recv-Q/Send-Q=0`, Beanstalk ping success, no new missing-class or shutdown errors, and active-calls/contact messages over WebSocket.

- [ ] **Step 7: Verify degraded polling behavior**

Without disabling production backend, use the automated frontend test plus a temporary invalid WebSocket URL in browser developer instrumentation to confirm polling continues until open and resumes after close. Do not change persistent production configuration for this check.

- [ ] **Step 8: Clean staging files and preserve backups**

Remove only `/tmp/*.codex` files created by this task. Keep timestamped production backups until the next successful overnight observation.
