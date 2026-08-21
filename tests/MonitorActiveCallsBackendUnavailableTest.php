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

namespace {
    set_include_path(__DIR__ . '/fixtures' . PATH_SEPARATOR . get_include_path());
    require_once dirname(__DIR__) . '/Lib/MonitorActiveCallsMain.php';

    $mainClass = \Modules\ModuleMonitorActiveCalls\Lib\MonitorActiveCallsMain::class;
    if ($mainClass::backendExists()) {
        fwrite(
            STDERR,
            "FAIL: an enabled SoftphoneBackend without a compatible API must be unavailable.\n"
        );
        exit(1);
    }

    $session = $mainClass::createBackendUiSession(42);
    if (($session['success'] ?? false) !== true
        || ($session['data']['transport'] ?? '') !== 'polling'
        || ($session['data']['routes'] ?? null) !== []
    ) {
        fwrite(STDERR, "FAIL: incompatible SoftphoneBackend must select polling.\n");
        exit(1);
    }

    fwrite(STDOUT, "PASS: incompatible SoftphoneBackend is unavailable.\n");
}
