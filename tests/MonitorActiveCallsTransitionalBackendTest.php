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

namespace Modules\ModuleSoftphoneBackend\Lib\ClientAPI {
    final class ClientActionFactory
    {
        public static function createServiceToken(string $serviceId): array
        {
            return ['success' => true, 'data' => ['access_token' => 'service-token']];
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
        || ($data['transport'] ?? '') !== 'polling'
        || ($data['routes'] ?? null) !== []
        || isset($data['access_token'])
        || isset($data['refresh_token'])
    ) {
        fwrite(STDERR, "FAIL: transitional backend did not select polling.\n");
        exit(1);
    }

    fwrite(STDOUT, "PASS: transitional SoftphoneBackend selects polling.\n");
}
