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

namespace MikoPBX\Core\System {
    final class SystemMessages
    {
        public static function sysLogMsg(string $tag, string $message, int $level = 0): void
        {
        }
    }
}

namespace MikoPBX\Core\Workers {
    class WorkerBase
    {
    }
}

namespace MikoPBX\PBXCoreREST\Lib {
    class PBXApiResult
    {
        public string $processor = '';
        public bool $success = false;
        public array $messages = [];
    }
}

namespace Modules\ModuleMonitorActiveCalls\Lib {
    class AsteriskManager
    {
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

        public function Hangup(string $channel): array
        {
            return ['Response' => 'Error', 'Message' => 'No such channel'];
        }

        public function disconnect(): void
        {
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

namespace Modules\ModuleMonitorActiveCalls\bin {
    class WorkerActiveCalls
    {
        public static function getEndpointName(string $channel): string
        {
            return '101';
        }
    }
}

namespace {
    set_include_path(__DIR__ . '/fixtures' . PATH_SEPARATOR . get_include_path());
    require_once dirname(__DIR__) . '/bin/WorkerAmiActions.php';

    $worker = new \Modules\ModuleMonitorActiveCalls\bin\WorkerAmiActions();
    $worker->logger = new \Modules\ModuleMonitorActiveCalls\Lib\Logger();
    $result = $worker->restAPICallback([
        'action' => 'hangup',
        'data' => [
            'ch1' => 'PJSIP/101-00000001',
            'ch2' => '',
        ],
    ]);

    if ($result->success) {
        fwrite(STDERR, 'FAIL: Hangup must not succeed when AMI returns an error.' . PHP_EOL);
        exit(1);
    }

    fwrite(STDOUT, 'PASS: Hangup reports the AMI command result.' . PHP_EOL);
}
