<?php

declare(strict_types=1);

use Modules\ModuleMonitorActiveCalls\Lib\EndpointStateResolver;

require_once dirname(__DIR__) . '/Lib/EndpointStateResolver.php';

function endpointStateAssertSame(string $expected, string $actual, string $message): void
{
    if ($expected === $actual) {
        return;
    }
    fwrite(STDERR, "FAIL: {$message}; expected {$expected}, got {$actual}." . PHP_EOL);
    exit(1);
}

endpointStateAssertSame(
    'Unavailable',
    EndpointStateResolver::resolve([], 'Unavailable', 'Idle', 'NOT_INUSE', 'Up'),
    'last-channel hangup must preserve the current PJSIP registration state'
);

endpointStateAssertSame(
    'Unavailable',
    EndpointStateResolver::resolve([], 'Idle', 'Busy', 'BUSY', 'Idle'),
    'DND custom device state must prevent a false Idle state'
);

endpointStateAssertSame(
    'Up',
    EndpointStateResolver::resolve(['Ringing', 'Up'], 'Idle', 'Idle', 'NOT_INUSE', 'Idle'),
    'an answered remaining channel must take precedence over device state'
);

endpointStateAssertSame(
    'Ringing',
    EndpointStateResolver::resolve(['Ring'], 'Idle', 'Idle', 'NOT_INUSE', 'Idle'),
    'a remaining ringing channel must keep the employee ringing'
);

endpointStateAssertSame(
    'Busy',
    EndpointStateResolver::resolve([], null, null, null, 'Busy'),
    'AMI lookup failure must preserve the previous non-idle state'
);

fwrite(STDOUT, 'PASS: endpoint state is resolved from channels, registration, hint and DND.' . PHP_EOL);
