<?php

declare(strict_types=1);

namespace MikoPBX\Core\Workers {
    class WorkerBase
    {
        protected bool $needRestart = false;
        protected function makePingTubeName(string $class): string { return 'test-ping'; }
    }
}

namespace MikoPBX\Common\Models {
    class PbxSettings { public static function getValueByKey(string $key): string { return '5038'; } }
}

namespace Modules\ModuleMonitorActiveCalls\Lib {
    class MonitorActiveCallsConf { public const AMI_USER = 'test'; }
    class AsteriskManager
    {
        public array $handlers = [];
        public $idle = null;
        public function connect(...$arguments): bool { return true; }
        public function setSocketTimeout(int $seconds, int $microseconds): void {}
        public function sendRequestTimeout(string $action, array $parameters): array { return ['Response' => 'Success']; }
        public function addEventHandler(string $event, callable $handler): void { $this->handlers[$event][] = $handler; }
        public function setOnIdleCallback(callable $callback, int $interval): void { $this->idle = $callback; }
    }

    class Logger
    {
        public int $errors = 0;
        public function writeInfo($message, string $header = ''): void {}

        public function writeError(mixed $message, string $header = ''): void
        {
            ++$this->errors;
        }
    }
}

namespace Modules\ModuleMonitorActiveCalls\bin {
    set_include_path(__DIR__ . '/fixtures' . PATH_SEPARATOR . get_include_path());
    require_once dirname(__DIR__) . '/bin/WorkerActiveCalls.php';

    final class AmiInitializationProbe extends WorkerActiveCalls
    {
        private array $connectionResults;
        private bool $stopOnPause;
        public int $attempts = 0;
        public int $pauses = 0;

        public function __construct(array $connectionResults, bool $stopOnPause = false)
        {
            $this->connectionResults = $connectionResults;
            $this->stopOnPause = $stopOnPause;
            $this->logger = new \Modules\ModuleMonitorActiveCalls\Lib\Logger();
        }

        public function initializeAmi(): bool
        {
            return $this->waitForAmiInitialization();
        }

        protected function initManagerAsterisk(): bool
        {
            ++$this->attempts;
            $result = array_shift($this->connectionResults) ?? false;
            if ($result instanceof \Throwable) {
                throw $result;
            }
            return $result;
        }

        protected function pauseBeforeAmiRetry(): void
        {
            ++$this->pauses;
            if ($this->stopOnPause) {
                $this->needRestart = true;
            }
        }
    }
}

namespace {
    use Modules\ModuleMonitorActiveCalls\bin\AmiInitializationProbe;

    if (!method_exists(AmiInitializationProbe::class, 'waitForAmiInitialization')) {
        fwrite(STDERR, 'FAIL: WorkerActiveCalls must wait for complete AMI initialization.' . PHP_EOL);
        exit(1);
    }

    $worker = new AmiInitializationProbe([false, true]);
    if (!$worker->initializeAmi()) {
        fwrite(STDERR, 'FAIL: successful retry must report initialized AMI.' . PHP_EOL);
        exit(1);
    }

    if ($worker->attempts !== 2) {
        fwrite(STDERR, "FAIL: expected two AMI initialization attempts, got {$worker->attempts}." . PHP_EOL);
        exit(1);
    }
    if ($worker->pauses !== 1) {
        fwrite(STDERR, "FAIL: expected one pause before retry, got {$worker->pauses}." . PHP_EOL);
        exit(1);
    }

    $worker = new AmiInitializationProbe([new RuntimeException('transient setup failure'), true]);
    if (!$worker->initializeAmi()) {
        fwrite(STDERR, 'FAIL: successful retry after an exception must report initialized AMI.' . PHP_EOL);
        exit(1);
    }
    if ($worker->attempts !== 2 || $worker->pauses !== 1 || $worker->logger->errors !== 1) {
        fwrite(STDERR, 'FAIL: AMI initialization exceptions must be logged and retried.' . PHP_EOL);
        exit(1);
    }

    $worker = new AmiInitializationProbe(
        [false, new RuntimeException('initialization continued after shutdown')],
        true
    );
    if ($worker->initializeAmi()) {
        fwrite(STDERR, 'FAIL: shutdown during AMI retry must stop initialization.' . PHP_EOL);
        exit(1);
    }
    if ($worker->attempts !== 1 || $worker->pauses !== 1) {
        fwrite(STDERR, 'FAIL: shutdown must prevent another AMI initialization attempt.' . PHP_EOL);
        exit(1);
    }

    // Exercise real registration, including reconnect: state events must route exactly once.
    $worker = new AmiInitializationProbe([true]);
    $class = \Modules\ModuleMonitorActiveCalls\bin\WorkerActiveCalls::class;
    foreach ([1, 2] as $connection) {
        (new \ReflectionMethod($class, 'initManagerAsterisk'))->invoke($worker);
        $manager = (new \ReflectionProperty($class, 'amCustom'))->getValue($worker);
        if (count($manager->handlers['ExtensionStatus'] ?? []) !== 1 || !is_callable($manager->idle)) {
            throw new \RuntimeException('Each AMI initialization must install one state dispatcher and restore the idle callback');
        }
        (new \ReflectionProperty($class, 'states'))->setValue($worker, ['222' => ['state' => 'Ringing']]);
        ($manager->handlers['ExtensionStatus'][0])(['Event' => 'ExtensionStatus', 'Exten' => '222', 'StatusText' => 'Idle']);
        $states = (new \ReflectionProperty($class, 'states'))->getValue($worker);
        if ($states['222']['state'] !== 'Idle') {
            throw new \RuntimeException('Registered ExtensionStatus handler must reach the employee state');
        }
        ($manager->idle)();
    }

    fwrite(STDOUT, 'PASS: WorkerActiveCalls waits for a fully initialized AMI session.' . PHP_EOL);
}
