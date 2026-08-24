<?php

declare(strict_types=1);

namespace Modules\ModuleMonitorActiveCalls\Lib;

use MikoPBX\Core\Asterisk\AsteriskManager as CoreAsteriskManager;

if (method_exists(CoreAsteriskManager::class, 'isConnected')) {
    /**
     * Use the current Core AMI implementation when connection recovery is available.
     */
    class AsteriskManager extends CoreAsteriskManager
    {
    }
} else {
    require_once __DIR__ . '/LegacyAsteriskManager.php';

    /**
     * Preserve the module AMI behavior on Core versions before isConnected() was introduced.
     */
    class AsteriskManager extends LegacyAsteriskManager
    {
        public function isConnected(): bool
        {
            if (!is_resource($this->socket) || !$this->loggedIn()) {
                return false;
            }

            $metadata = stream_get_meta_data($this->socket);
            if (feof($this->socket) || ($metadata['eof'] ?? false)) {
                fclose($this->socket);
                $this->socket = false;
                $this->disconnect();
                return false;
            }

            return true;
        }
    }
}
