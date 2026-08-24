<?php

declare(strict_types=1);

namespace MikoPBX\Common\Models {
    final class PbxExtensionModules
    {
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

    $empty = $mainClass::normalizeActiveCallsPayload(null);
    if ($empty !== ['calls' => [], 'queues' => []]) {
        fwrite(STDERR, "FAIL: an unavailable worker cache must produce empty calls and queues.\n");
        exit(1);
    }

    $malformed = $mainClass::normalizeActiveCallsPayload([
        'calls' => null,
        'queues' => 'invalid',
    ]);
    if ($malformed !== ['calls' => [], 'queues' => []]) {
        fwrite(STDERR, "FAIL: malformed worker cache must be normalized to empty arrays.\n");
        exit(1);
    }

    $valid = [
        'calls' => [['id' => 'call-1']],
        'queues' => ['queue-1' => ['id' => 'queue-1']],
    ];
    if ($mainClass::normalizeActiveCallsPayload($valid) !== $valid) {
        fwrite(STDERR, "FAIL: valid worker cache must be preserved.\n");
        exit(1);
    }

    fwrite(STDOUT, "PASS: active calls payload is normalized.\n");
}
