<?php

declare(strict_types=1);

namespace Modules\ModuleMonitorActiveCalls\Lib;

/**
 * Keeps one canonical active-call list and only lightweight per-queue IDs.
 */
final class ActiveCallProjector
{
    public static function append(array &$calls, array &$queues, array $call): void
    {
        $calls[] = $call;
        $queueId = trim((string)($call['lastQueue'] ?? ''));
        if ($queueId !== '' && isset($queues[$queueId])) {
            $linkedId = trim((string)($call['linkedid'] ?? ''));
            if ($linkedId !== '') {
                $queues[$queueId]['callIds'][] = $linkedId;
            }
        }
    }
}
