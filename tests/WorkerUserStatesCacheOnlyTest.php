<?php
declare(strict_types=1);

namespace MikoPBX\Core\Workers {
    class WorkerBase {}
}
namespace Modules\ModuleMonitorActiveCalls\Lib {
    class Logger { public function writeInfo($message): void {} }
    // Replace external cache/HTTP boundaries; execute the real worker methods.
    class CacheManager {
        public static array $data = [];
        public static function setCacheData($key, $value, int $ttl): void {
            self::$data[$key] = $value;
        }
    }
    class MonitorActiveCallsMain {
        public static int $statesSent = 0;
        public static function publishUserStates(array $data): void { self::$statesSent++; }
        public static function publishActiveCalls(array $data): void {}
    }
}
namespace {
    use Modules\ModuleMonitorActiveCalls\bin\WorkerActiveCalls;
    use Modules\ModuleMonitorActiveCalls\Lib\CacheManager;
    use Modules\ModuleMonitorActiveCalls\Lib\MonitorActiveCallsMain;

    set_include_path(__DIR__ . '/fixtures' . PATH_SEPARATOR . get_include_path());
    require_once dirname(__DIR__) . '/bin/WorkerActiveCalls.php';
    $worker = (new ReflectionClass(WorkerActiveCalls::class))->newInstanceWithoutConstructor();
    $worker->logger = new Modules\ModuleMonitorActiveCalls\Lib\Logger();
    $set = static function (string $name, $value) use ($worker): void {
        (new ReflectionProperty(WorkerActiveCalls::class, $name))->setValue($worker, $value);
    };
    $payload = ['states' => ['269' => ['state' => 'Ringing']]];
    $set('backendExists', true);
    $set('pendingUserStatesData', $payload);
    $set('stateUpdateScheduled', 1);
    (new ReflectionMethod(WorkerActiveCalls::class, 'flushPendingStateUpdate'))->invoke($worker);
    $set('lastNchanPublishTime', 0);
    (new ReflectionMethod(WorkerActiveCalls::class, 'republishToNchan'))->invoke($worker);
    if ((CacheManager::$data['getUsersStates'] ?? null) !== $payload) {
        throw new RuntimeException('Worker must preserve its own state cache');
    }
    if (MonitorActiveCallsMain::$statesSent !== 0) {
        throw new RuntimeException('Worker must not publish employee states to Backend');
    }
    echo "PASS: employee states remain cache-only, including periodic publication.\n";
}
