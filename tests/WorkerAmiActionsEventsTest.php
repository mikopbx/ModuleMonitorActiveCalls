<?php

declare(strict_types=1);

namespace MikoPBX\Common\Models {
    final class PbxSettings
    {
        public static function getValueByKey(string $key): string
        {
            return '5038';
        }
    }
}

namespace MikoPBX\Core\Workers {
    class WorkerBase
    {
    }
}

namespace Modules\ModuleMonitorActiveCalls\Lib {
    class AsteriskManager
    {
        public string $events = '';

        public function connect(
            ?string $server = null,
            ?string $username = null,
            ?string $secret = null,
            string $events = 'on'
        ): bool {
            $this->events = $events;
            return true;
        }
    }

    class Logger
    {
    }

    class MonitorActiveCallsConf
    {
        public const AMI_USER = 'monitor-active-calls';
    }
}

namespace {
    set_include_path(__DIR__ . '/fixtures' . PATH_SEPARATOR . get_include_path());
    require_once dirname(__DIR__) . '/bin/WorkerAmiActions.php';

    $worker = new \Modules\ModuleMonitorActiveCalls\bin\WorkerAmiActions();
    $manager = $worker->getAstManager();

    if ($manager->events !== 'off') {
        fwrite(
            STDERR,
            "FAIL: WorkerAmiActions must disable AMI events by default; got '{$manager->events}'.\n"
        );
        exit(1);
    }

    fwrite(STDOUT, "PASS: WorkerAmiActions disables AMI events by default.\n");
}
