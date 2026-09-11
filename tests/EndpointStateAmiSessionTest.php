<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/Lib/EndpointStateSource.php';
if (!class_exists(\Modules\ModuleMonitorActiveCalls\Lib\EndpointStateAmiSession::class)) {
    $path = dirname(__DIR__) . '/Lib/EndpointStateAmiSession.php';
    if (!is_file($path)) {
        fwrite(STDERR, "FAIL: endpoint lookups need a session with a deadline covering login, queries and close.\n");
        exit(1);
    }
    require_once $path;
}

use Modules\ModuleMonitorActiveCalls\Lib\EndpointStateAmiSession;
use Modules\ModuleMonitorActiveCalls\Lib\EndpointStateSource;

foreach (['numeric', 'text', 'ws', 'no-contacts', 'login-timeout', 'partial', 'wrong-id'] as $scenario) {
    $server = stream_socket_server('tcp://127.0.0.1:0', $errno, $error);
    if ($server === false) { throw new RuntimeException($error); }
    $address = stream_socket_get_name($server, false);
    $pid = pcntl_fork();
    if ($pid === -1) { throw new RuntimeException('fork failed'); }
    if ($pid === 0) {
        $client = stream_socket_accept($server, 2);
        if ($client === false) { exit(2); }
        stream_set_timeout($client, 2);
        fwrite($client, "Asterisk Call Manager/5.0\r\n");
        $login = readFrame($client);
        if (($login['Events'] ?? '') !== 'off' || strtolower($login['Action'] ?? '') !== 'login') { exit(3); }
        if ($scenario === 'login-timeout') {
            while (fread($client, 4096) !== '' && !feof($client)) {}
            fclose($client);
            exit(0);
        }
        reply($client, ['Response' => 'Success', 'ActionID' => $login['ActionID']]);
        $endpoint = readFrame($client);
        if (($endpoint['Action'] ?? '') !== 'PJSIPShowEndpoint') { exit(4); }
        if ($scenario === 'ws') {
            reply($client, ['Response' => 'Error', 'ActionID' => $endpoint['ActionID'], 'Message' => 'Unable to find object']);
            $endpoint = readFrame($client);
            if (($endpoint['Endpoint'] ?? '') !== '222-WS') { exit(8); }
        }
        $id = $scenario === 'wrong-id' ? 'unrelated' : $endpoint['ActionID'];
        reply($client, ['Response' => 'Success', 'ActionID' => $id, 'EventList' => 'start',
            'Message' => 'Following are Events for each object associated with the Endpoint']);
        if ($scenario !== 'no-contacts') {
            reply($client, ['Event' => 'ContactStatusDetail', 'ActionID' => $id, 'URI' => 'sip:222@192.0.2.2', 'Status' => 'Reachable']);
        }
        if (in_array($scenario, ['partial', 'wrong-id'], true)) {
            // The client must close on its deadline, without sending another query or reconnecting.
            $extra = fread($client, 4096);
            fclose($client);
            exit($extra === '' ? 0 : 5);
        }
        reply($client, ['Event' => 'EndpointDetailComplete', 'ActionID' => $id, 'EventList' => 'Complete']);
        if ($scenario === 'no-contacts') {
            $ws = readFrame($client);
            if (($ws['Endpoint'] ?? '') !== '222-WS') { exit(9); }
            reply($client, ['Response' => 'Success', 'ActionID' => $ws['ActionID'], 'EventList' => 'start']);
            reply($client, ['Event' => 'EndpointDetailComplete', 'ActionID' => $ws['ActionID'], 'EventList' => 'Complete']);
        }
        $hint = readFrame($client);
        if (($hint['Action'] ?? '') !== 'ExtensionState') { exit(6); }
        reply($client, ['Response' => 'Success', 'ActionID' => $hint['ActionID']] +
            ($scenario === 'no-contacts' ? ['Status' => '4'] : ($scenario === 'numeric' ? ['Status' => '0'] : ['StatusText' => 'Idle'])));
        $custom = readFrame($client);
        if (($custom['Action'] ?? '') !== 'GetVar') { exit(7); }
        reply($client, ['Response' => 'Success', 'ActionID' => $custom['ActionID'], 'Value' => 'NOT_INUSE']);
        while (fread($client, 4096) !== '' && !feof($client)) {}
        fclose($client);
        exit(0);
    }
    fclose($server);
    $session = null;
    $start = microtime(true);
    $state = null;
    try {
        $session = new EndpointStateAmiSession($address, 'fixture', 'fixture-secret', 0.3);
        $state = (new EndpointStateSource($session))->read('222');
        if ($scenario === 'login-timeout') { throw new LogicException('Login timeout was accepted'); }
    } catch (RuntimeException $exception) {
        if ($scenario !== 'login-timeout') { throw $exception; }
    } finally {
        if ($session !== null) { $session->disconnect(); }
    }
    if (microtime(true) - $start > 1.0) { throw new RuntimeException('Session exceeded its total deadline'); }
    pcntl_waitpid($pid, $status);
    if (!pcntl_wifexited($status) || pcntl_wexitstatus($status) !== 0) { throw new RuntimeException('AMI fixture failed: ' . $scenario . ' / ' . $status); }
    if (in_array($scenario, ['numeric', 'text', 'ws'], true)) {
        if ($state !== ['registration' => 'Idle', 'hint' => 'Idle', 'custom' => 'NOT_INUSE']) { throw new RuntimeException('Complete snapshot not parsed: ' . $scenario); }
    } elseif ($scenario === 'no-contacts') {
        if ($state !== ['registration' => 'Unavailable', 'hint' => 'Unavailable', 'custom' => 'NOT_INUSE']) { throw new RuntimeException('Complete empty contact list must prove unregistered'); }
    } elseif ($scenario !== 'login-timeout' && $state !== ['registration' => null, 'hint' => null, 'custom' => null]) {
        throw new RuntimeException('Incomplete/unrelated response was accepted');
    }
}
echo "PASS: isolated AMI sessions, numeric/text hints, complete multipart replies, login/partial deadlines and ActionID matching.\n";

function readFrame($socket): array {
    $frame = [];
    while (($line = fgets($socket)) !== false) {
        $line = trim($line);
        if ($line === '') { break; }
        [$key, $value] = explode(':', $line, 2);
        $frame[$key] = trim($value);
    }
    return $frame;
}
function reply($socket, array $frame): void {
    foreach ($frame as $key => $value) { fwrite($socket, "$key: $value\r\n"); }
    fwrite($socket, "\r\n");
}
