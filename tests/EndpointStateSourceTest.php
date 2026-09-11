<?php

declare(strict_types=1);

use Modules\ModuleMonitorActiveCalls\Lib\EndpointStateSource;

require_once dirname(__DIR__) . '/Lib/EndpointStateSource.php';

final class EndpointStateAmiFake
{
    public function sendRequestTimeout(string $action, array $parameters = []): array
    {
        if ($action === 'ExtensionState') {
            return ['Response' => 'Success', 'Status' => ($parameters['Exten'] === '132' ? '2' : '4')];
        }
        if ($action === 'GetVar') {
            return ['Response' => 'Success', 'Value' => ($parameters['Variable'] === 'DEVICE_STATE(Custom:132)' ? 'BUSY' : 'NOT_INUSE')];
        }
        if ($action !== 'PJSIPShowEndpoint') {
            return [];
        }
        if (($parameters['Endpoint'] ?? '') === '132') {
            return ['data' => ['ContactStatusDetail' => [
                ['URI' => 'sip:132@192.0.2.10', 'Status' => 'Reachable'],
            ]]];
        }
        if (($parameters['Endpoint'] ?? '') === '134') {
            return ['data' => ['ContactStatusDetail' => [
                ['URI' => 'sip:134@192.0.2.20', 'Status' => 'Unavail'],
            ]]];
        }
        return ['data' => ['ContactStatusDetail' => []]];
    }


}

function endpointSourceAssertSame($expected, $actual, string $message): void
{
    if ($expected === $actual) {
        return;
    }
    fwrite(STDERR, 'FAIL: ' . $message . '; expected ' . var_export($expected, true)
        . ', got ' . var_export($actual, true) . '.' . PHP_EOL);
    exit(1);
}

$source = new EndpointStateSource(new EndpointStateAmiFake());
$state132 = $source->read('132');
endpointSourceAssertSame('Idle', $state132['registration'], 'a reachable physical contact must be registered');
endpointSourceAssertSame('Busy', $state132['hint'], 'the current Asterisk hint must be returned');
endpointSourceAssertSame('BUSY', $state132['custom'], 'the current Custom device state must be returned');

$state134 = $source->read('134');
endpointSourceAssertSame('Unavailable', $state134['registration'], 'an endpoint without physical or WS contacts must be unavailable');
endpointSourceAssertSame('Unavailable', $state134['hint'], 'an unavailable hint must be returned');
endpointSourceAssertSame('NOT_INUSE', $state134['custom'], 'a non-DND Custom state must be returned');



$missing = new class {
    public int $requests = 0;
    public function sendRequestTimeout(string $action, array $parameters): array {
        ++$this->requests;
        return [];
    }
};
$missingSource = new EndpointStateSource($missing);
endpointSourceAssertSame(['registration' => null, 'hint' => null, 'custom' => null], $missingSource->read('222'), 'timeout is not a registration state');
endpointSourceAssertSame(1, $missing->requests, 'a failed response must stop queries on the desynchronized session');

fwrite(STDOUT, 'PASS: endpoint sources use bounded queries, numeric hints and stop on timeout.' . PHP_EOL);
