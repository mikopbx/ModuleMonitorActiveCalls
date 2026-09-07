<?php

declare(strict_types=1);

namespace MikoPBX\Core\Workers {
    class WorkerBase
    {
    }
}

namespace Modules\ModuleMonitorActiveCalls\Lib {
    class AsteriskManager
    {
        public function sendRequestTimeout(string $action, array $parameters = []): array
        {
            if ($action === 'PJSIPShowEndpoint') {
                return ['data' => ['ContactStatusDetail' => []]];
            }
            return [];
        }

        public function ExtensionState(string $extension, string $context): array
        {
            return ['StatusText' => 'Unavailable'];
        }

        public function GetVar(string $channel, string $variable, $actionId = null, bool $retArray = true)
        {
            return 'NOT_INUSE';
        }
    }

    class Logger
    {
        public function writeInfo($message, string $header = ''): void
        {
        }
    }
}

namespace Modules\ModuleMonitorActiveCalls\bin {
    set_include_path(__DIR__ . '/fixtures' . PATH_SEPARATOR . get_include_path());
    require_once dirname(__DIR__) . '/Lib/EndpointStateResolver.php';
    require_once dirname(__DIR__) . '/Lib/EndpointStateSource.php';
    require_once dirname(__DIR__) . '/bin/WorkerActiveCalls.php';

    final class HangupStateProbe extends WorkerActiveCalls
    {
        public function __construct()
        {
            $this->amCustom = new \Modules\ModuleMonitorActiveCalls\Lib\AsteriskManager();
            $this->logger = new \Modules\ModuleMonitorActiveCalls\Lib\Logger();
            $property = new \ReflectionProperty(WorkerActiveCalls::class, 'states');
            $property->setAccessible(true);
            $property->setValue($this, [
                '132' => ['name' => 'Test', 'state' => 'Idle', 'channels' => []],
            ]);
        }

        public function endpointState(string $endpoint): string
        {
            $property = new \ReflectionProperty(WorkerActiveCalls::class, 'states');
            $property->setAccessible(true);
            $states = $property->getValue($this);
            return (string)($states[$endpoint]['state'] ?? '');
        }
    }
}

namespace {
    use Modules\ModuleMonitorActiveCalls\bin\HangupStateProbe;

    $worker = new HangupStateProbe();
    $baseEvent = [
        'Channel' => 'PJSIP/132-00000001',
        'ChannelStateDesc' => 'Ringing',
        'CallerIDNum' => '132',
        'ConnectedLineNum' => '200',
        'Context' => 'internal',
        'Exten' => '132',
        'Uniqueid' => 'mikopbx-1.2',
        'Linkedid' => 'mikopbx-1.1',
    ];
    $worker->callEvents(['Event' => 'Newchannel'] + $baseEvent);
    $worker->callEvents(['Event' => 'Hangup'] + $baseEvent);

    $actual = $worker->endpointState('132');
    if ($actual !== 'Unavailable') {
        fwrite(STDERR, "FAIL: last-channel Hangup must refresh Asterisk state; expected Unavailable, got {$actual}.\n");
        exit(1);
    }

    fwrite(STDOUT, "PASS: last-channel Hangup refreshes endpoint state from Asterisk.\n");
}
