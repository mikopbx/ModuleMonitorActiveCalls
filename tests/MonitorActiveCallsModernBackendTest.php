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
        public static array $activeCalls = [];
        public static array $userStates = [];
        public static string $serviceId = '';
        public static int $userId = 0;

        public static function createModuleUiSession(string $serviceId, int $userId): array
        {
            self::$serviceId = $serviceId;
            self::$userId = $userId;
            return ['success' => true, 'data' => ['transport' => 'scoped-v2']];
        }

        public static function createServiceToken(string $serviceId): array
        {
            return ['success' => true, 'service' => $serviceId];
        }

        public static function publishActiveCalls(array $data): void
        {
            self::$activeCalls = $data;
        }

        public static function publishUserStates(array $data): void
        {
            self::$userStates = $data;
        }
    }
}

namespace {
    set_include_path(__DIR__ . '/fixtures' . PATH_SEPARATOR . get_include_path());
    require_once dirname(__DIR__) . '/Lib/MonitorActiveCallsMain.php';

    use Modules\ModuleMonitorActiveCalls\Lib\MonitorActiveCallsMain;
    use Modules\ModuleSoftphoneBackend\Lib\ClientAPI\ClientActionFactory;

    if (!MonitorActiveCallsMain::backendExists()) {
        fwrite(STDERR, "FAIL: the modern SoftphoneBackend API was not detected.\n");
        exit(1);
    }

    $activeCalls = ['calls' => [['id' => 'call-1']]];
    $userStates = ['states' => ['201' => 'Idle']];

    try {
        MonitorActiveCallsMain::publishActiveCalls($activeCalls);
        MonitorActiveCallsMain::publishUserStates($userStates);
        $token = MonitorActiveCallsMain::createBackendServiceToken('ModuleMonitorActiveCalls');
        $session = MonitorActiveCallsMain::createBackendUiSession(42);
    } catch (\Throwable $e) {
        fwrite(STDERR, 'FAIL: modern SoftphoneBackend API is not usable: ' . $e->getMessage() . "\n");
        exit(1);
    }

    if (ClientActionFactory::$activeCalls !== $activeCalls
        || ClientActionFactory::$userStates !== $userStates
        || ($token['service'] ?? '') !== 'ModuleMonitorActiveCalls'
        || ($session['data']['transport'] ?? '') !== 'scoped-v2'
        || ClientActionFactory::$serviceId !== 'ModuleMonitorActiveCalls'
        || ClientActionFactory::$userId !== 42
    ) {
        fwrite(STDERR, "FAIL: data was not delegated to the modern SoftphoneBackend API.\n");
        exit(1);
    }

    fwrite(STDOUT, "PASS: modern SoftphoneBackend API is used.\n");
}
