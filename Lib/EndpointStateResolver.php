<?php

declare(strict_types=1);

namespace Modules\ModuleMonitorActiveCalls\Lib;

/**
 * Resolves an employee state after channel removal without assuming Idle.
 */
final class EndpointStateResolver
{
    public static function resolve(
        array $channelStates,
        ?string $registrationState,
        ?string $hintState,
        ?string $customState,
        string $fallbackState
    ): string {
        $normalizedChannels = array_map([self::class, 'normalize'], $channelStates);
        if (in_array('Up', $normalizedChannels, true)) {
            return 'Up';
        }
        if (in_array('Ringing', $normalizedChannels, true)) {
            return 'Ringing';
        }
        if (in_array('Busy', $normalizedChannels, true)) {
            return 'Busy';
        }

        $custom = strtoupper(trim((string)$customState));
        if (in_array($custom, ['BUSY', 'INUSE', 'UNAVAILABLE', 'INVALID'], true)) {
            return 'Unavailable';
        }

        $registration = self::normalize($registrationState);
        if ($registration === 'Unavailable') {
            return 'Unavailable';
        }

        $hint = self::normalize($hintState);
        if ($hint !== null) {
            return $hint;
        }
        if ($registration !== null) {
            return $registration;
        }

        return $fallbackState;
    }

    private static function normalize(?string $state): ?string
    {
        if ($state === null || trim($state) === '') {
            return null;
        }
        $value = strtolower(trim($state));
        $states = [
            'up' => 'Up',
            'in use' => 'Up',
            'inuse' => 'Up',
            'busy' => 'Busy',
            'ring' => 'Ringing',
            'ringing' => 'Ringing',
            'ringinuse' => 'Ringing',
            'on hold' => 'OnHold',
            'onhold' => 'OnHold',
            'not in use' => 'Idle',
            'not_inuse' => 'Idle',
            'idle' => 'Idle',
            'unavailable' => 'Unavailable',
            'unknown' => 'Unavailable',
            'invalid' => 'Unavailable',
        ];
        return $states[$value] ?? null;
    }
}
