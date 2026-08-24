<?php

declare(strict_types=1);

require_once dirname(__DIR__, 3) . '/mikopbx/Core/vendor/autoload.php';
require_once dirname(__DIR__) . '/Lib/AsteriskManager.php';

use MikoPBX\Core\Asterisk\AsteriskManager as CoreAsteriskManager;
use Modules\ModuleMonitorActiveCalls\Lib\AsteriskManager;

if (!is_subclass_of(AsteriskManager::class, CoreAsteriskManager::class)) {
    fwrite(STDERR, 'FAIL: module AMI manager must inherit the current Core connection handling.' . PHP_EOL);
    exit(1);
}

$transcriptFile = sys_get_temp_dir() . '/monitor-active-calls-ami-' . getmypid();
@unlink($transcriptFile);
$server = stream_socket_server('tcp://127.0.0.1:0', $errorCode, $errorMessage);
if (!is_resource($server)) {
    throw new RuntimeException($errorMessage, $errorCode);
}
$address = (string)stream_socket_get_name($server, false);
$port = (int)substr(strrchr($address, ':'), 1);

$serverPid = pcntl_fork();
if ($serverPid === -1) {
    throw new RuntimeException('Unable to fork AMI fixture.');
}
if ($serverPid === 0) {
    foreach ([1, 2] as $connectionNumber) {
        $client = stream_socket_accept($server, 5);
        if (!is_resource($client)) {
            exit(2);
        }
        stream_set_timeout($client, 5);
        fwrite($client, "Asterisk Call Manager/5.0\r\n");

        $login = readAmiRequest($client);
        appendAmiAction($transcriptFile, $login);
        if (($login['Action'] ?? '') !== 'login' || ($login['Events'] ?? '') !== 'off') {
            exit(3);
        }
        fwrite($client, "Response: Success\r\nMessage: Authentication accepted\r\n\r\n");

        $ping = readAmiRequest($client);
        appendAmiAction($transcriptFile, $ping);
        if (($ping['Action'] ?? '') !== 'Ping') {
            exit(4);
        }
        if ($connectionNumber === 1) {
            fclose($client);
            continue;
        }
        fwrite($client, "Response: Success\r\nPing: Pong\r\n\r\n");

        $logoff = readAmiRequest($client);
        appendAmiAction($transcriptFile, $logoff);
        fclose($client);
    }
    fclose($server);
    exit(0);
}

fclose($server);
$manager = new class (null, [
    'server' => "127.0.0.1:$port",
    'username' => 'fixture',
    'secret' => 'fixture-secret',
]) extends AsteriskManager {
    protected function isAsteriskListening(): bool
    {
        return true;
    }
};

$failure = null;
try {
    if (!$manager->connect(null, null, null, 'off')) {
        throw new RuntimeException('Initial AMI login failed.');
    }
    $response = $manager->sendRequestTimeout('Ping');
    if (($response['Response'] ?? '') !== 'Success' || ($response['Ping'] ?? '') !== 'Pong') {
        throw new RuntimeException('AMI request was not recovered after the first connection closed.');
    }
} catch (Throwable $throwable) {
    $failure = $throwable;
} finally {
    $manager->disconnect();
    $status = 0;
    pcntl_waitpid($serverPid, $status);
}

$actions = [];
foreach (file($transcriptFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
    $actions[] = $line;
}
@unlink($transcriptFile);

if ($failure !== null) {
    fwrite(STDERR, 'FAIL: ' . $failure->getMessage() . PHP_EOL);
    exit(1);
}
if (!pcntl_wifexited($status) || pcntl_wexitstatus($status) !== 0) {
    fwrite(STDERR, 'FAIL: AMI fixture exited abnormally.' . PHP_EOL);
    exit(1);
}
if ($actions !== ['login', 'Ping', 'login', 'Ping', 'Logoff']) {
    fwrite(STDERR, 'FAIL: unexpected AMI action sequence: ' . implode(', ', $actions) . PHP_EOL);
    exit(1);
}

fwrite(STDOUT, 'PASS: module manager inherits Core AMI reconnection behavior.' . PHP_EOL);

function readAmiRequest($client): array
{
    $request = [];
    while (($line = fgets($client)) !== false) {
        $line = rtrim($line, "\r\n");
        if ($line === '') {
            break;
        }
        $separator = strpos($line, ':');
        if ($separator !== false) {
            $request[substr($line, 0, $separator)] = ltrim(substr($line, $separator + 1));
        }
    }
    return $request;
}

function appendAmiAction(string $filename, array $request): void
{
    file_put_contents($filename, ($request['Action'] ?? '') . PHP_EOL, FILE_APPEND);
}
