<?php

declare(strict_types=1);

use Modules\ModuleMonitorActiveCalls\Lib\ActiveCallProjector;

require_once dirname(__DIR__) . '/Lib/ActiveCallProjector.php';

function activeCallProjectorAssert(bool $condition, string $message): void
{
    if ($condition) {
        return;
    }
    fwrite(STDERR, "FAIL: {$message}.\n");
    exit(1);
}

$calls = [];
$queues = ['queue-1' => ['calls' => []]];
$queueCall = ['linkedid' => 'call-1', 'lastQueue' => 'queue-1'];
ActiveCallProjector::append($calls, $queues, $queueCall);

activeCallProjectorAssert(
    ($calls[0]['linkedid'] ?? '') === 'call-1',
    'a live queue call must remain in the root calls collection'
);
activeCallProjectorAssert(
    ($queues['queue-1']['callIds'][0] ?? '') === 'call-1',
    'a queue must reference its live call without duplicating the call object'
);
activeCallProjectorAssert(
    count($queues['queue-1']['calls']) === 0,
    'a queue must not contain a second mutable copy of a call'
);

$regularCall = ['linkedid' => 'call-2', 'lastQueue' => ''];
ActiveCallProjector::append($calls, $queues, $regularCall);
activeCallProjectorAssert(count($calls) === 2, 'a regular call must be appended once');
activeCallProjectorAssert(
    count($queues['queue-1']['callIds']) === 1,
    'a regular call must not be attached to a queue'
);

fwrite(STDOUT, "PASS: active calls keep a canonical root projection and a queue index.\n");
