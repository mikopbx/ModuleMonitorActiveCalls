<?php

declare(strict_types=1);

namespace MikoPBX\Common\Models {
    final class PbxExtensionModules
    {
        public static function findFirstByUniqid(string $moduleId): object
        {
            return (object)['disabled' => 0];
        }
    }
}

namespace MikoPBX\Modules {
    class PbxExtensionBase
    {
    }
}

namespace Modules\ModuleSoftphoneBackend\Lib\RestAPI\Controllers {
    final class ApiController
    {
        public static function createServiceToken(string $serviceId): array
        {
            return [
                'success' => true,
                'data' => [
                    'access_token' => 'legacy-access',
                    'refresh_token' => 'legacy-refresh',
                ],
            ];
        }

        public static function publishActiveCalls(array $data): void
        {
        }

        public static function publishUserStates(array $data): void
        {
        }
    }
}

namespace {
    set_include_path(__DIR__ . '/fixtures' . PATH_SEPARATOR . get_include_path());
    require_once dirname(__DIR__) . '/Lib/MonitorActiveCallsMain.php';

    $session = \Modules\ModuleMonitorActiveCalls\Lib\MonitorActiveCallsMain::createBackendUiSession(42);
    $data = $session['data'] ?? [];
    if (($session['success'] ?? false) !== true
        || ($data['access_token'] ?? '') !== 'legacy-access'
        || ($data['refresh_token'] ?? '') !== 'legacy-refresh'
        || ($data['transport'] ?? '') !== 'legacy-v1'
        || ($data['routes']['contacts'] ?? '') !== '/pbxcore/api/module-softphone-backend/v1/sub/contacts'
        || ($data['routes']['active_calls'] ?? '') !== '/pbxcore/api/module-softphone-backend/v1/sub/active-calls'
    ) {
        fwrite(STDERR, "FAIL: legacy backend session was not adapted.\n");
        exit(1);
    }

    fwrite(STDOUT, "PASS: legacy SoftphoneBackend API is adapted.\n");
}
