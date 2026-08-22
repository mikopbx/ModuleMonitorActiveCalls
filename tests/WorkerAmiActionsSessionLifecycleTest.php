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
        public static int $instances = 0;
        public static int $disconnects = 0;

        private int $instanceId;

        public function __construct()
        {
            $this->instanceId = ++self::$instances;
        }

        public function connect(
            ?string $server = null,
            ?string $username = null,
            ?string $secret = null,
            string $events = 'on'
        ): bool {
            return true;
        }

        public function loggedIn(): bool
        {
            return true;
        }

        public function getChannels(): array
        {
            return [$this->instanceId];
        }

        public function disconnect(): void
        {
            ++self::$disconnects;
        }
    }

    class Logger
    {
        public function writeError(mixed $message, string $header = ''): void
        {
        }
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
    $first = $worker->getChannels();
    $second = $worker->getChannels();

    if ($first !== [1] || $second !== [2]) {
        fwrite(STDERR, 'FAIL: every command must use a new AMI manager instance.' . PHP_EOL);
        exit(1);
    }

    if (\Modules\ModuleMonitorActiveCalls\Lib\AsteriskManager::$disconnects !== 2) {
        fwrite(STDERR, 'FAIL: every command-scoped AMI manager must be disconnected.' . PHP_EOL);
        exit(1);
    }

    fwrite(STDOUT, 'PASS: WorkerAmiActions uses one AMI session per command.' . PHP_EOL);
}
