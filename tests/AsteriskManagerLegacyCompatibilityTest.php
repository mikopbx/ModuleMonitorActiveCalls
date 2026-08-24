<?php

declare(strict_types=1);

namespace MikoPBX\Core\Asterisk {
    class AsteriskManager
    {
    }
}

namespace MikoPBX\Core\System {
    final class Processes
    {
        public static function mwExec(string $command): int
        {
            return 0;
        }
    }

    final class SystemMessages
    {
        public static function sysLogMsg(string $tag, string $message, int $level): void
        {
        }
    }

    final class Util
    {
        public static function which(string $command): string
        {
            return '/bin/true';
        }

        public static function generateRandomString(int $length): string
        {
            return str_repeat('x', $length);
        }
    }
}

namespace {
    require_once dirname(__DIR__) . '/Lib/AsteriskManager.php';

    $manager = new \Modules\ModuleMonitorActiveCalls\Lib\AsteriskManager();
    if (!method_exists($manager, 'isConnected')) {
        fwrite(STDERR, 'FAIL: legacy adapter must provide isConnected().' . PHP_EOL);
        exit(1);
    }

    $sockets = stream_socket_pair(STREAM_PF_UNIX, STREAM_SOCK_STREAM, 0);
    if ($sockets === false) {
        fwrite(STDERR, 'FAIL: unable to create socket pair for the test.' . PHP_EOL);
        exit(1);
    }
    [$managerSocket, $asteriskSocket] = $sockets;
    $manager->socket = $managerSocket;

    $legacyClass = \Modules\ModuleMonitorActiveCalls\Lib\LegacyAsteriskManager::class;
    $loggedIn = new ReflectionProperty($legacyClass, '_loggedIn');
    $loggedIn->setAccessible(true);
    $loggedIn->setValue($manager, true);

    $actionId = 'legacy-bridge-list';
    fwrite($asteriskSocket, implode("\r\n", [
        'Response: Success',
        "ActionID: $actionId",
        'Message: Bridge listing will follow',
        '',
        'Event: BridgeListItem',
        "ActionID: $actionId",
        'BridgeUniqueid: bridge-1',
        'BridgeType: basic',
        '',
        'Event: BridgeListComplete',
        '',
    ]) . "\r\n");

    $response = $manager->sendRequest('BridgeList', ['ActionID' => $actionId]);
    $bridge = $response['data']['BridgeListItem'][0] ?? [];
    if (($bridge['BridgeUniqueid'] ?? '') !== 'bridge-1') {
        fwrite(STDERR, 'FAIL: legacy adapter must preserve BridgeList parsing.' . PHP_EOL);
        exit(1);
    }
    if (!$manager->isConnected()) {
        fwrite(STDERR, 'FAIL: open authenticated legacy socket must be connected.' . PHP_EOL);
        exit(1);
    }

    fclose($asteriskSocket);
    usleep(10000);
    if ($manager->isConnected()) {
        fwrite(STDERR, 'FAIL: EOF must invalidate the legacy AMI connection.' . PHP_EOL);
        exit(1);
    }
    if (is_resource($managerSocket)) {
        fclose($managerSocket);
    }

    fwrite(STDOUT, 'PASS: legacy Core keeps BridgeList parsing and connection checks.' . PHP_EOL);
}
