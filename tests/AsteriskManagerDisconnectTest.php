<?php

declare(strict_types=1);

namespace MikoPBX\Core\System {
    final class Processes
    {
        public static function mwExec(string $command): int
        {
            return 1;
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
            return '/bin/false';
        }
    }
}

namespace {
    require_once dirname(__DIR__) . '/Lib/AsteriskManager.php';

    $sockets = stream_socket_pair(STREAM_PF_UNIX, STREAM_SOCK_STREAM, 0);
    if ($sockets === false) {
        fwrite(STDERR, 'FAIL: unable to create socket pair for the test.' . PHP_EOL);
        exit(1);
    }

    [$workerSocket, $serverSocket] = $sockets;
    fclose($serverSocket);
    usleep(10000);

    if (!feof($workerSocket)) {
        fwrite(STDERR, 'FAIL: test socket did not reach EOF.' . PHP_EOL);
        exit(1);
    }

    $manager = new \Modules\ModuleMonitorActiveCalls\Lib\AsteriskManager();
    $manager->socket = $workerSocket;

    $loggedIn = new ReflectionProperty($manager, '_loggedIn');
    $loggedIn->setAccessible(true);
    $loggedIn->setValue($manager, true);

    $manager->disconnect();

    if ($manager->socket !== false) {
        fwrite(STDERR, 'FAIL: disconnect must clear the socket property.' . PHP_EOL);
        exit(1);
    }

    if ($manager->loggedIn()) {
        fwrite(STDERR, 'FAIL: disconnect must clear the logged-in state.' . PHP_EOL);
        exit(1);
    }

    fwrite(STDOUT, 'PASS: disconnect clears a remotely closed AMI session.' . PHP_EOL);
}
