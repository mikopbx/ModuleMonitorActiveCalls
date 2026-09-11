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
        public $duringRead = null;
        public bool $unavailable = true;
        public int $reads = 0;
        public int $disconnections = 0;
        public ?string $hint = null;
        public string $custom = 'NOT_INUSE';
        public bool $registered = false;
        public function GetChannels(): array { return []; }
        public function isConnected(): bool { return true; }
        public function disconnect(): void { ++$this->disconnections; }

        public function sendRequestTimeout(string $action, array $parameters = []): array
        {
            ++$this->reads;
            if ($this->duringRead !== null) {
                $callback = $this->duringRead;
                $this->duringRead = null;
                $callback();
            }
            if (!$this->unavailable) { return []; }
            if ($action === 'ExtensionState') { return ['StatusText' => $this->hint ?? 'Unavailable']; }
            if ($action === 'GetVar') { return ['Value' => $this->custom]; }
            if ($action === 'PJSIPShowEndpoint') {
                return ['data' => ['ContactStatusDetail' => $this->registered ? [['URI' => 'sip:test@192.0.2.1', 'Status' => 'Reachable']] : []]];
            }
            return [];
        }

    }

    class CacheManager {
        public static array $data = [];
        public static function setCacheData($key, $value, int $ttl): void { self::$data[$key] = $value; }
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
    require_once dirname(__DIR__) . '/Lib/ActiveCallProjector.php';
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

        protected function createEndpointStateManager(): \Modules\ModuleMonitorActiveCalls\Lib\AsteriskManager
        {
            return $this->amCustom;
        }

        public function manager(): \Modules\ModuleMonitorActiveCalls\Lib\AsteriskManager { return $this->amCustom; }

        public function reconcile(): void
        {
            $method = new \ReflectionMethod(WorkerActiveCalls::class, 'processPendingEndpointStates');
            $method->invoke($this);
        }

        public function get(string $name) { return (new \ReflectionProperty(WorkerActiveCalls::class, $name))->getValue($this); }
        public function set(string $name, $value): void { (new \ReflectionProperty(WorkerActiveCalls::class, $name))->setValue($this, $value); }
        public function due(): void {
            $pending = $this->get('pendingEndpointStates');
            foreach ($pending as &$entry) { $entry['due'] = 0; }
            $this->set('pendingEndpointStates', $pending);
            $this->set('nextEndpointCheck', 0.0);
        }
        public function publish(): array {
            $this->set('init', false);
            $this->set('lastControlActiveCalls', time());
            (new \ReflectionMethod(WorkerActiveCalls::class, 'printActiveCalls'))->invoke($this);
            $this->set('stateUpdateScheduled', 1);
            (new \ReflectionMethod(WorkerActiveCalls::class, 'flushPendingStateUpdate'))->invoke($this);
            return \Modules\ModuleMonitorActiveCalls\Lib\CacheManager::$data['getUsersStates'];
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
    if ($worker->manager()->reads !== 0) {
        fwrite(STDERR, "FAIL: Hangup must defer AMI queries until the event handler has returned.\n");
        exit(1);
    }
    $worker->reconcile();

    $actual = $worker->endpointState('132');
    if ($actual !== 'Unavailable') {
        fwrite(STDERR, "FAIL: last-channel Hangup must refresh Asterisk state; expected Unavailable, got {$actual}.\n");
        exit(1);
    }

    $worker = new HangupStateProbe();
    $worker->manager()->unavailable = false;
    $worker->callEvents(['Event' => 'Newchannel'] + $baseEvent);
    $worker->callEvents(['Event' => 'Hangup'] + $baseEvent);
    $worker->manager()->duringRead = function () use ($worker): void {
        $worker->stateEvents(['Event' => 'ExtensionStatus', 'Exten' => '132', 'StatusText' => 'Idle']);
    };
    $worker->reconcile();
    if ($worker->endpointState('132') !== 'Idle') {
        fwrite(STDERR, "FAIL: an incomplete AMI lookup must not overwrite fresh Idle with Ringing.\n");
        exit(1);
    }

    // Both event orders from a ring-all queue must publish Idle for both losing agents.
    foreach ([true, false] as $idleFirst) {
        $worker = new HangupStateProbe();
        $worker->manager()->unavailable = false;
        $worker->set('states', [
            '222' => ['name' => '222', 'state' => 'Idle', 'channels' => []],
            '223' => ['name' => '223', 'state' => 'Idle', 'channels' => []],
            '236' => ['name' => '236', 'state' => 'Idle', 'channels' => []],
            '6020' => ['name' => '6020', 'state' => 'Idle', 'channels' => [], 'isQueue' => true],
        ]);
        $worker->set('queuesData', ['queue-6020' => ['number' => '6020', 'agents' => ['222', '223', '236']]]);
        $answeredLeg = array_replace($baseEvent, ['Channel' => 'PJSIP/236-000001', 'CallerIDNum' => '236', 'Exten' => '236', 'ChannelStateDesc' => 'Up']);
        $worker->callEvents(['Event' => 'Newchannel'] + $answeredLeg);
        foreach (['222', '223'] as $number) {
            $leg = array_replace($baseEvent, ['Channel' => 'PJSIP/' . $number . '-000001', 'CallerIDNum' => $number, 'Exten' => $number]);
            $worker->callEvents(['Event' => 'Newchannel'] + $leg);
            $idle = ['Event' => 'ExtensionStatus', 'Exten' => $number, 'StatusText' => 'Idle'];
            if ($idleFirst) { $worker->stateEvents($idle); }
            $worker->callEvents(['Event' => 'Hangup'] + $leg);
            if (!$idleFirst) { $worker->stateEvents($idle); }
        }
        $worker->reconcile();
        $worker->due();
        $worker->reconcile();
        $payload = $worker->publish();
        check($payload['states']['222']['state'] === 'Idle' && $payload['states']['223']['state'] === 'Idle', 'queue losers must publish Idle in both event orders');
        check($payload['states']['236']['state'] === 'Up', 'answering agent must remain in the call');
        $queue = \Modules\ModuleMonitorActiveCalls\Lib\CacheManager::$data['getActiveChannelsV2Action']['queues']['queue-6020'];
        check($queue['agents']['222']['state'] === 'Idle' && $queue['agents']['223']['state'] === 'Idle', 'queue agent cards must publish Idle as well');
    }

    // A timeout must retry even after the final active call disappears.
    $worker = new HangupStateProbe();
    $worker->manager()->unavailable = false;
    $worker->callEvents(['Event' => 'Newchannel'] + $baseEvent);
    $worker->callEvents(['Event' => 'Hangup'] + $baseEvent);
    $worker->callEvents(['Event' => 'Hangup'] + $baseEvent);
    foreach ([1, 3, 10, 60, 60] as $delay) {
        $worker->due();
        $start = microtime(true);
        $worker->reconcile();
        $pending = $worker->get('pendingEndpointStates');
        check(abs($pending['132']['due'] - $start - $delay) < 0.5, 'retry must use bounded backoff');
        $reads = $worker->manager()->reads;
        $worker->reconcile();
        check($worker->manager()->reads === $reads, 'retry must not busy loop');
    }
    check($worker->manager()->reads === 5, 'duplicate Hangups must coalesce');
    check($worker->get('activeChannels') === [], 'recovery scenario must have no calls');
    $worker->manager()->unavailable = true;
    $worker->manager()->registered = true;
    $worker->manager()->hint = 'Idle';
    $worker->due();
    $worker->reconcile();
    check($worker->endpointState('132') === 'Idle', 'recovered AMI must clear stale Ringing without another call');
    check($worker->get('pendingEndpointStates') === [], 'confirmed endpoints must stop retrying');
    check($worker->manager()->disconnections === 6, 'every check must close its session');

    // A new channel arriving during a successful lookup invalidates even an Idle result.
    $worker = new HangupStateProbe();
    $worker->manager()->registered = true;
    $worker->manager()->hint = 'Idle';
    $worker->callEvents(['Event' => 'Newchannel'] + $baseEvent);
    $worker->callEvents(['Event' => 'Hangup'] + $baseEvent);
    $worker->manager()->duringRead = function () use ($worker, $baseEvent): void {
        $worker->callEvents(['Event' => 'Newchannel', 'ChannelStateDesc' => 'Up', 'Channel' => 'PJSIP/132-00000002'] + $baseEvent);
    };
    $worker->reconcile();
    check($worker->endpointState('132') === 'Up', 'new call must survive stale successful result');

    foreach (['Up', 'Ringing', 'OnHold'] as $remaining) {
        $worker = new HangupStateProbe();
        $worker->callEvents(['Event' => 'Newchannel'] + $baseEvent);
        $worker->callEvents(['Event' => 'Newchannel', 'Channel' => 'PJSIP/132-00000002', 'ChannelStateDesc' => $remaining] + $baseEvent);
        $worker->callEvents(['Event' => 'Hangup'] + $baseEvent);
        $worker->reconcile();
        check($worker->endpointState('132') === $remaining, 'remaining ' . $remaining . ' channel must win over unavailable registration');
    }

    $worker = new HangupStateProbe();
    $worker->manager()->registered = true;
    $worker->manager()->hint = 'Busy';
    $worker->manager()->custom = 'BUSY';
    $worker->callEvents(['Event' => 'Newchannel'] + $baseEvent);
    $worker->callEvents(['Event' => 'Hangup'] + $baseEvent);
    $worker->reconcile();
    check($worker->endpointState('132') === 'Unavailable', 'DND must not become Idle');

    // An immediate post-Hangup hint can lag behind the real channel teardown.
    $worker = new HangupStateProbe();
    $worker->manager()->registered = true;
    $worker->manager()->hint = 'Ringing';
    $worker->callEvents(['Event' => 'Newchannel'] + $baseEvent);
    $worker->callEvents(['Event' => 'Hangup'] + $baseEvent);
    $worker->reconcile();
    check($worker->get('pendingEndpointStates') !== [], 'activity without channels must keep reconciliation pending');
    $worker->manager()->hint = 'Idle';
    $worker->due();
    $worker->reconcile();
    check($worker->endpointState('132') === 'Idle', 'lagging hint must recover without another event');

    // Missed Hangup discovered by channel reconciliation must also recheck the endpoint.
    $worker = new HangupStateProbe();
    $worker->manager()->registered = true;
    $worker->manager()->hint = 'Idle';
    $worker->callEvents(['Event' => 'Newchannel'] + $baseEvent);
    (new \ReflectionMethod(\Modules\ModuleMonitorActiveCalls\bin\WorkerActiveCalls::class, 'channelAdditionalControl'))->invoke($worker);
    $worker->reconcile();
    check($worker->endpointState('132') === 'Idle', 'channel cleanup must repair employee status');
    check(empty($worker->get('states')['132']['channels']), 'whole linkedid cleanup must remove endpoint channel references');

    // Continuous unrelated events must drive due checks, not just the idle callback.
    $worker = new HangupStateProbe();
    $worker->manager()->unavailable = false;
    $worker->callEvents(['Event' => 'Newchannel'] + $baseEvent);
    $worker->callEvents(['Event' => 'Hangup'] + $baseEvent);
    $worker->reconcile();
    $worker->publish();
    $worker->manager()->unavailable = true;
    $worker->manager()->registered = true;
    $worker->manager()->hint = 'Idle';
    $worker->due();
    $worker->dispatchAmiEvent(['Event' => 'QueueMemberStatus', 'MemberName' => 'other']);
    check($worker->endpointState('132') === 'Idle', 'event traffic must drive due reconciliation');
    $payload = $worker->publish();
    check($payload['states']['132']['state'] === 'Idle', 'reconciliation must update published state');

    echo "PASS: deferred Hangup state, queue payloads, races, retries, DND and remaining channels.\n";

    function check(bool $condition, string $message): void {
        if (!$condition) { throw new \RuntimeException($message); }
    }
}
