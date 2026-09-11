<?php

declare(strict_types=1);

namespace Modules\ModuleMonitorActiveCalls\Lib;

use Throwable;

/** Reads one endpoint on an isolated, short-lived AMI command session. */
final class EndpointStateSource
{
    private object $manager;
    private bool $failed = false;
    private array $diagnostics = [];

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

    public function diagnostics(): array
    {
        return $this->diagnostics;
    }

    private function request(string $action, array $parameters): array
    {
        if ($this->failed) {
            return [];
        }
        $start = microtime(true);
        $reason = 'ok';
        try {
            $response = $this->manager->sendRequestTimeout($action, $parameters);
            if ($response === [] || !empty($response['incomplete'])) {
                // Do not mistake a late response to this request for the next one.
                $this->failed = true;
                $reason = $response === [] ? 'no-response' : 'incomplete-response';
                return [];
            }
            if (($response['Response'] ?? '') === 'Error') {
                $reason = 'ami-error';
                return [];
            }
            return $response;
        } catch (Throwable $exception) {
            $this->failed = true;
            $reason = $this->manager instanceof EndpointStateAmiSession ? $exception->getMessage() : get_class($exception);
            return [];
        } finally {
            $this->diagnostics[] = [
                'action' => $action, 'result' => $reason,
                'elapsedMs' => (int)((microtime(true) - $start) * 1000),
            ];
        }
    }

    private function registrationState(string $endpoint): ?string
    {
        $known = false;
        $missing = false;
        foreach ([$endpoint, $endpoint . '-WS'] as $candidate) {
            $response = $this->request('PJSIPShowEndpoint', ['Endpoint' => $candidate]);
            $data = is_array($response['data'] ?? null) ? $response['data'] : [];
            if (!array_key_exists('ContactStatusDetail', $data)) {
                $missing = true;
                continue;
            }
            $known = true;
            foreach ((array)$data['ContactStatusDetail'] as $contact) {
                if (!is_array($contact) || empty($contact['URI'])) {
                    continue;
                }
                $status = strtolower(trim((string)($contact['Status'] ?? '')));
                if ($status === '') {
                    $missing = true;
                } elseif (!in_array($status, ['unavail', 'unreachable', 'removed', 'unknown', 'unavailable'], true)) {
                    return 'Idle';
                }
            }
        }
        return $known && !$missing ? 'Unavailable' : null;
    }

    private function hintState(string $endpoint): ?string
    {
        $response = $this->request('ExtensionState', ['Exten' => $endpoint, 'Context' => 'internal-hints']);
        $state = $response['StatusText'] ?? ($response['data']['StatusText'] ?? null);
        if (is_string($state) && trim($state) !== '') {
            return trim($state);
        }
        // ExtensionState responses may only contain the numeric status.
        $status = $response['Status'] ?? ($response['data']['Status'] ?? null);
        if (!is_int($status) && !is_string($status)) {
            return null;
        }
        return [0 => 'Idle', 1 => 'Up', 2 => 'Busy', 4 => 'Unavailable',
            8 => 'Ringing', 9 => 'Ringing', 16 => 'OnHold', 17 => 'OnHold'][$status ?? ''] ?? null;
    }

    private function customState(string $endpoint): ?string
    {
        $response = $this->request('GetVar', ['Channel' => '', 'Variable' => 'DEVICE_STATE(Custom:' . $endpoint . ')']);
        $state = $response['Value'] ?? ($response['data']['Value'] ?? null);
        return is_string($state) && trim($state) !== '' ? trim($state) : null;
    }
}
