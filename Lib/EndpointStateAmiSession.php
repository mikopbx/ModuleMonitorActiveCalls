<?php

declare(strict_types=1);

namespace Modules\ModuleMonitorActiveCalls\Lib;

use RuntimeException;
use Throwable;

/**
 * Request-only AMI connection with one deadline covering login and all queries.
 * It never dispatches events, reconnects, or waits for a Logoff response.
 * Kept separate from Core/legacy listeners whose recovery can outlive a probe.
 */
final class EndpointStateAmiSession
{
    private $socket = null;
    private float $deadline;
    private int $bytesRead = 0;

    public function __construct(string $address, string $username, string $secret, float $timeout = 1.0)
    {
        $this->deadline = microtime(true) + $timeout;
        try {
            $this->socket = @stream_socket_client('tcp://' . $address, $errno, $error, $this->remaining());
            if (!is_resource($this->socket)) {
                throw new RuntimeException('AMI connection failed');
            }
            if (strpos($this->readLine(), 'Asterisk Call Manager/') !== 0) {
                throw new RuntimeException('Invalid AMI greeting');
            }
            $login = $this->sendRequestTimeout('Login', ['Username' => $username, 'Secret' => $secret, 'Events' => 'off']);
            if (($login['Response'] ?? '') !== 'Success') {
                throw new RuntimeException('AMI login failed');
            }
        } catch (Throwable $exception) {
            $this->disconnect();
            throw $exception;
        }
    }

    public function sendRequestTimeout(string $action, array $parameters = []): array
    {
        try {
            if (!in_array($action, ['Login', 'PJSIPShowEndpoint', 'ExtensionState', 'GetVar'], true)) {
                throw new RuntimeException('Unsupported endpoint query');
            }
            $id = 'endpoint-' . bin2hex(random_bytes(8));
            $parameters = ['Action' => $action, 'ActionID' => $id] + $parameters;
            $request = '';
            foreach ($parameters as $key => $value) {
                if (strpbrk((string)$key . (string)$value, "\r\n") !== false) {
                    throw new RuntimeException('Invalid AMI header');
                }
                $request .= "$key: $value\r\n";
            }
            $request .= "\r\n";
            while ($request !== '') {
                $this->setTimeout();
                $written = @fwrite($this->socket, $request);
                if ($written === false || $written === 0) {
                    throw new RuntimeException('AMI write failed');
                }
                $request = substr($request, $written);
            }
            $response = null;
            while (true) {
                $frame = $this->readFrame();
                if (($frame['ActionID'] ?? '') !== $id) {
                    continue;
                }
                if (isset($frame['Response'])) {
                    if ($frame['Response'] !== 'Success' || $action !== 'PJSIPShowEndpoint') {
                        return $frame;
                    }
                    $response = $frame;
                    $response['data'] = [];
                } elseif ($response !== null && isset($frame['Event'])) {
                    if ($frame['Event'] === 'EndpointDetailComplete') {
                        // Only a complete snapshot can prove that no contacts exist.
                        $response['data']['ContactStatusDetail'] = $response['data']['ContactStatusDetail'] ?? [];
                        return $response;
                    }
                    $response['data'][$frame['Event']][] = $frame;
                }
            }
        } catch (Throwable $exception) {
            $this->disconnect();
            throw $exception;
        }
    }

    private function remaining(): float
    {
        $remaining = $this->deadline - microtime(true);
        if ($remaining <= 0) {
            throw new RuntimeException('AMI probe deadline exceeded');
        }
        return $remaining;
    }

    private function setTimeout(): void
    {
        if (!is_resource($this->socket)) {
            throw new RuntimeException('AMI session is closed');
        }
        $remaining = $this->remaining();
        stream_set_timeout($this->socket, (int)$remaining, max(1, (int)(($remaining - (int)$remaining) * 1000000)));
    }

    private function readLine(): string
    {
        $this->setTimeout();
        $line = @fgets($this->socket, 8192);
        if ($line === false || substr($line, -1) !== "\n") {
            throw new RuntimeException('AMI read incomplete or timed out');
        }
        $this->bytesRead += strlen($line);
        if ($this->bytesRead > 1048576) {
            throw new RuntimeException('AMI probe response too large');
        }
        return rtrim($line, "\r\n");
    }

    private function readFrame(): array
    {
        $frame = [];
        while (($line = $this->readLine()) !== '') {
            $separator = strpos($line, ':');
            if ($separator !== false) {
                $frame[substr($line, 0, $separator)] = ltrim(substr($line, $separator + 1));
            }
        }
        return $frame;
    }

    public function disconnect(): void
    {
        if (is_resource($this->socket)) {
            fclose($this->socket);
        }
        $this->socket = null;
    }

    public function __destruct()
    {
        $this->disconnect();
    }
}
