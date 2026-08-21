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
        $module = PbxExtensionModules::findFirstByUniqid('ModuleSoftphoneBackend');
        if ($module === null || intval($module->disabled) !== 0) {
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
}
