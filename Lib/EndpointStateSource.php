<?php

declare(strict_types=1);

namespace Modules\ModuleMonitorActiveCalls\Lib;

use Throwable;

/**
 * Reads endpoint availability from Asterisk immediately after channel removal.
 */
final class EndpointStateSource
{
    private object $manager;

    public function __construct(object $manager)
    {
        $this->manager = $manager;
    }

    public function read(string $endpoint): array
    {
        return [
            'registration' => $this->registrationState($endpoint),
            'hint' => $this->hintState($endpoint),
            'custom' => $this->customState($endpoint),
        ];
    }

    private function registrationState(string $endpoint): ?string
    {
        $known = false;
        try {
            foreach ([$endpoint, $endpoint . '-WS'] as $candidate) {
                $response = $this->manager->sendRequestTimeout(
                    'PJSIPShowEndpoint',
                    ['Endpoint' => $candidate]
                );
                $data = is_array($response['data'] ?? null) ? $response['data'] : [];
                if (!array_key_exists('ContactStatusDetail', $data)) {
                    continue;
                }
                $known = true;
                foreach ((array)$data['ContactStatusDetail'] as $contact) {
                    if (!is_array($contact) || empty($contact['URI'])) {
                        continue;
                    }
                    $status = strtolower(trim((string)($contact['Status'] ?? '')));
                    if (!in_array($status, ['unavail', 'unreachable', 'removed', 'unknown', 'unavailable'], true)) {
                        return 'Idle';
                    }
                }
            }
        } catch (Throwable $exception) {
            unset($exception);
            return null;
        }
        return $known ? 'Unavailable' : null;
    }

    private function hintState(string $endpoint): ?string
    {
        try {
            $response = $this->manager->ExtensionState($endpoint, 'internal-hints');
            $state = $response['StatusText'] ?? ($response['data']['StatusText'] ?? null);
            return is_scalar($state) && trim((string)$state) !== '' ? trim((string)$state) : null;
        } catch (Throwable $exception) {
            unset($exception);
            return null;
        }
    }

    private function customState(string $endpoint): ?string
    {
        try {
            $state = $this->manager->GetVar('', 'DEVICE_STATE(Custom:' . $endpoint . ')', null, false);
            return is_scalar($state) && trim((string)$state) !== '' ? trim((string)$state) : null;
        } catch (Throwable $exception) {
            unset($exception);
            return null;
        }
    }
}
