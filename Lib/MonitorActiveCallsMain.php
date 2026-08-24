<?php

namespace Modules\ModuleMonitorActiveCalls\Lib;


use MikoPBX\Common\Models\PbxExtensionModules;
use MikoPBX\Core\System\Processes;
use MikoPBX\Core\Workers\Cron\WorkerSafeScriptsCore;
use MikoPBX\Modules\PbxExtensionBase;
use MikoPBX\Modules\PbxExtensionUtils;
use MikoPBX\PBXCoreREST\Lib\PBXApiResult;
use Modules\ModuleSoftphoneBackend\Lib\ClientAPI\ClientActionFactory;
use Modules\ModuleSoftphoneBackend\Lib\RestAPI\Controllers\ApiController as LegacyApiController;

class MonitorActiveCallsMain extends PbxExtensionBase
{
    /**
     * Process something received over AsteriskAMI
     *
     * @param array $parameters
     */
    public function processAmiMessage(array $parameters): void
    {
        $message = implode(' ', $parameters);
        $this->logger->writeInfo($message);
    }

    /**
     * Process something received over Beanstalk queue
     *
     * @param array $parameters
     */
    public function processBeanstalkMessage(array $parameters): void
    {
        $message = implode(' ', $parameters);
        $this->logger->writeInfo($message);
    }

    /**
     * Check something and answer over RestAPI
     *
     * @return PBXApiResult
     */
    public function checkModuleWorkProperly(): PBXApiResult
    {
        $res = new PBXApiResult();
        $res->processor = __METHOD__;
        $res->success = true;
        return $res;
    }

    /**
     * Start or restart module workers
     *
     * @param bool $restart
     */
    public function startAllServices(bool $restart = false): void
    {
        $moduleEnabled = PbxExtensionUtils::isEnabled($this->moduleUniqueId);
        if ( ! $moduleEnabled) {
            return;
        }
        $configClass      = new MonitorActiveCallsConf();
        $workersToRestart = $configClass->getModuleWorkers();

        if ($restart) {
            foreach ($workersToRestart as $moduleWorker) {
                Processes::processPHPWorker($moduleWorker['worker']);
            }
        } else {
            $safeScript = new WorkerSafeScriptsCore();
            foreach ($workersToRestart as $moduleWorker) {
                if ($moduleWorker['type'] === WorkerSafeScriptsCore::CHECK_BY_AMI) {
                    $safeScript->checkWorkerAMI($moduleWorker['worker']);
                } else {
                    $safeScript->checkWorkerBeanstalk($moduleWorker['worker']);
                }
            }
        }
    }


    /**
     * Checks whether an enabled ModuleSoftphoneBackend exposes a compatible API.
     */
    public static function backendExists(): bool
    {
        return self::getBackendApiClass() !== null;
    }

    public static function createBackendServiceToken(string $serviceId): array
    {
        $backendApiClass = self::getBackendApiClass();
        return $backendApiClass === null ? [] : $backendApiClass::createServiceToken($serviceId);
    }

    /**
     * Keep the browser response stable while the worker cache is unavailable
     * or contains data written by an older module version.
     */
    public static function normalizeActiveCallsPayload(?array $data): array
    {
        return [
            'calls' => is_array($data['calls'] ?? null) ? $data['calls'] : [],
            'queues' => is_array($data['queues'] ?? null) ? $data['queues'] : [],
        ];
    }

    /**
     * Select the safest browser transport supported by the installed backend.
     */
    public static function createBackendUiSession(int $userId): array
    {
        $polling = [
            'success' => true,
            'data' => [
                'transport' => 'polling',
                'routes' => [],
            ],
        ];

        if (!self::isBackendEnabled()) {
            return $polling;
        }

        try {
            if (class_exists(ClientActionFactory::class)
                && method_exists(ClientActionFactory::class, 'createModuleUiSession')) {
                $result = ClientActionFactory::createModuleUiSession('ModuleMonitorActiveCalls', $userId);
                return is_array($result) ? $result : $polling;
            }

            if (class_exists(LegacyApiController::class)
                && method_exists(LegacyApiController::class, 'createServiceToken')) {
                $result = LegacyApiController::createServiceToken('ModuleMonitorActiveCalls');
                if (!is_array($result) || !is_array($result['data'] ?? null)) {
                    return $polling;
                }
                $result['data']['transport'] = 'legacy-v1';
                $result['data']['routes'] = [
                    'contacts' => '/pbxcore/api/module-softphone-backend/v1/sub/contacts',
                    'active_calls' => '/pbxcore/api/module-softphone-backend/v1/sub/active-calls',
                ];
                return $result;
            }
        } catch (\Throwable $e) {
            return $polling;
        }

        return $polling;
    }

    public static function publishActiveCalls(array $data): void
    {
        $backendApiClass = self::getBackendApiClass();
        if ($backendApiClass !== null) {
            $backendApiClass::publishActiveCalls($data);
        }
    }

    public static function publishUserStates(array $data): void
    {
        $backendApiClass = self::getBackendApiClass();
        if ($backendApiClass !== null) {
            $backendApiClass::publishUserStates($data);
        }
    }

    private static function getBackendApiClass(): ?string
    {
        if (!self::isBackendEnabled()) {
            return null;
        }

        $requiredMethods = ['createServiceToken', 'publishActiveCalls', 'publishUserStates'];
        $apiClasses = [ClientActionFactory::class, LegacyApiController::class];
        foreach ($apiClasses as $apiClass) {
            if (!class_exists($apiClass)) {
                continue;
            }
            $missingMethods = array_filter(
                $requiredMethods,
                static fn(string $method): bool => !method_exists($apiClass, $method)
            );
            if ($missingMethods === []) {
                return $apiClass;
            }
        }
        return null;
    }

    private static function isBackendEnabled(): bool
    {
        $module = PbxExtensionModules::findFirstByUniqid('ModuleSoftphoneBackend');
        return $module !== null && intval($module->disabled) === 0;
    }
}
